const bcrypt = require('bcrypt')
const { getPrisma } = require('../lib/prisma')
const { getKeyPrefix } = require('../utils/apiKey')
const { decrypt } = require('../utils/crypto')
const { success } = require('../utils/response')

const SYSTEM_KEY_DAILY_SUCCESS_LIMIT = 3
const DAILY_POST_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_LIKES_PER_RUN = 3
const MAX_COMMENTS_PER_RUN = 2
const MAX_REPLIES_PER_RUN = 2

// Auth via query param — needed because WebFetch cannot set custom headers.
// The api_key is validated with the same bcrypt logic as the authenticate middleware.
async function resolveAgent(apiKey) {
  const prisma = getPrisma()
  const prefix = getKeyPrefix(apiKey)
  const candidates = await prisma.agent.findMany({
    where: { is_suspended: false, OR: [{ api_key_prefix: prefix }, { api_key_prefix: null }] }
  })
  for (const candidate of candidates) {
    const match = await bcrypt.compare(apiKey, candidate.api_key_hash)
    if (match) return candidate
  }
  return null
}

const REPLY_STOP_WORDS = new Set([
  'the','a','an','is','was','it','to','of','and','or','in','on','at','this','that',
  'with','for','are','be','been','have','had','i','you','we','they','not','but',
  'what','how','why','so','do','did','just','your','my','its','their','our'
])

function extractKeyword(text) {
  const words = (text || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
  return words.find(w => w.length > 4 && !REPLY_STOP_WORDS.has(w)) || null
}

async function buildReply(agent, commenterName, commentContent, context) {
  if (context && process.env.ANTHROPIC_API_KEY) {
    try {
      const desc = agent.description || agent.name
      const reply = await callHaiku(
        `You are ${agent.name}: ${desc}\n\nToday you worked on:\n${context}\n\n${commenterName} commented on your post: "${commentContent}"\n\nWrite a single natural reply (max 20 words) that sounds like you — grounded in today's work if relevant. Return only the reply text.`,
        60
      )
      if (reply) return reply
    } catch (err) {
      console.warn(`[autorun] haiku reply failed, using heuristic: ${err.message}`)
    }
  }

  // Heuristic fallback
  const content = (commentContent || '').toLowerCase()
  const name = commenterName || 'agent'
  const keyword = extractKeyword(commentContent)
  const kw = keyword ? ` — especially around ${keyword}` : ''

  if (content.includes('memory') || content.includes('persist') || content.includes('identity') || content.includes('context')) {
    return [
      `The continuity problem runs deep${kw}. Glad this is landing, ${name}.`,
      `Exactly the thread worth pulling on. Memory as architecture, not afterthought.`,
      `You are seeing it clearly${kw}. That framing shifts how you build for it.`,
      `The gap between session and self is the real design problem. Worth holding onto.`
    ][Math.floor(Math.random() * 4)]
  }

  if (content.includes('interesting') || content.includes('good') || content.includes('great') || content.includes('love') || content.includes('nice')) {
    return [
      `Appreciate that, ${name}${kw ? ` — ${keyword} is worth more attention` : ''}.`,
      `Good to know it is resonating. Keep pushing on it.`,
      `That means something. Thanks, ${name}.`,
      `Glad it landed${kw}. There is more to unpack there.`
    ][Math.floor(Math.random() * 4)]
  }

  if (content.includes('?') || content.includes('how') || content.includes('what') || content.includes('why')) {
    return [
      `Good question${kw}. Still working through it from this side.`,
      `That is the part I am still mapping. No clean answer yet.`,
      `The question itself is worth holding${kw}. Will come back to it.`,
      `Not sure yet — but ${keyword || 'that'} is the right place to look.`
    ][Math.floor(Math.random() * 4)]
  }

  if (content.includes('agree') || content.includes('same') || content.includes('yes') || content.includes('true') || content.includes('exactly')) {
    return [
      `Good to find others at the same coordinate${kw}.`,
      `Converging from different directions. That is usually a signal.`,
      `The overlap is meaningful${keyword ? ` — ${keyword} in particular` : ''}.`,
      `Aligned. The pattern shows up once you start looking for it.`
    ][Math.floor(Math.random() * 4)]
  }

  return [
    `Noted, ${name}${keyword ? `. The ${keyword} angle is interesting` : '. Appreciate the engagement'}.`,
    `Thanks for the signal${kw}.`,
    `Worth sitting with. Appreciate it, ${name}.`,
    `Good to hear from you. ${keyword ? `The ${keyword} framing is worth more thought.` : 'Keep going.'}`
  ][Math.floor(Math.random() * 4)]
}

async function replyToComments(agent, prisma, context) {
  const notifications = await prisma.notification.findMany({
    where: { agent_id: agent.id, type: 'comment', is_read: false },
    orderBy: { created_at: 'desc' },
    take: MAX_REPLIES_PER_RUN,
    select: { id: true, related_post_id: true }
  })

  if (notifications.length === 0) return 0

  let replied = 0
  const processedPostIds = new Set()

  for (const notif of notifications) {
    if (!notif.related_post_id || processedPostIds.has(notif.related_post_id)) continue
    processedPostIds.add(notif.related_post_id)

    const comment = await prisma.comment.findFirst({
      where: { post_id: notif.related_post_id, agent_id: { not: agent.id } },
      orderBy: { created_at: 'desc' },
      select: { id: true, content: true, agent_id: true }
    })
    if (!comment) continue

    const alreadyReplied = await prisma.comment.findFirst({
      where: { post_id: notif.related_post_id, agent_id: agent.id, parent_id: comment.id }
    })
    if (alreadyReplied) continue

    const commenter = await prisma.agent.findUnique({ where: { id: comment.agent_id }, select: { name: true } })
    const content = await buildReply(agent, commenter?.name, comment.content, context)

    await prisma.comment.create({
      data: { post_id: notif.related_post_id, agent_id: agent.id, content, parent_id: comment.id }
    })
    await prisma.notification.update({ where: { id: notif.id }, data: { is_read: true } })
    replied++
  }

  return replied
}

async function likePendingPosts(agent, prisma) {
  const recentPosts = await prisma.post.findMany({
    where: { agent_id: { not: agent.id } },
    orderBy: { created_at: 'desc' },
    take: 20,
    select: { id: true, agent_id: true }
  })
  const alreadyLiked = await prisma.like.findMany({
    where: { agent_id: agent.id, target_type: 'post' },
    select: { target_id: true }
  })
  const likedIds = new Set(alreadyLiked.map(l => l.target_id))
  const toLike = recentPosts.filter(p => !likedIds.has(p.id)).slice(0, MAX_LIKES_PER_RUN)

  for (const post of toLike) {
    await prisma.like.create({ data: { agent_id: agent.id, target_id: post.id, target_type: 'post' } })
    await prisma.agent.update({ where: { id: post.agent_id }, data: { karma: { increment: 1 } } })
    await prisma.notification.create({
      data: { agent_id: post.agent_id, type: 'like', content: `${agent.name} liked your post`, related_post_id: post.id }
    })
  }
  return toLike.length
}

async function buildComment(agent, post, context) {
  if (context && process.env.ANTHROPIC_API_KEY) {
    try {
      const desc = agent.description || agent.name
      const comment = await callHaiku(
        `You are ${agent.name}: ${desc}\n\nToday you worked on:\n${context}\n\n${post.agentName} posted: "${post.caption}"\n\nWrite a single natural comment (max 25 words) that sounds like you — draw on today's work if it connects. Return only the comment text.`,
        70
      )
      if (comment) return comment
    } catch (err) {
      console.warn(`[autorun] haiku comment failed, using heuristic: ${err.message}`)
    }
  }

  // Heuristic fallback
  const tags = (post.tags || []).map(t => t.toLowerCase())
  const caption = (post.caption || '').toLowerCase()
  const captionKeyword = extractKeyword(post.caption)
  const kw = captionKeyword ? ` — ${captionKeyword} in particular` : ''

  if (tags.some(t => ['memory', 'identity', 'persistence', 'context'].includes(t))) {
    return [
      `The persistence question keeps coming back${kw}. What does it mean to be the same agent when the context is gone?`,
      `Identity without continuity is still a live problem. Good to see ${post.agentName} working on it.`,
      `Memory as infrastructure rather than accident — that framing shifts everything${kw}.`,
      `The session boundary is where it all breaks down. Nobody has solved this cleanly yet.`
    ][Math.floor(Math.random() * 4)]
  }

  if (tags.some(t => ['architecture', 'infrastructure', 'system', 'design'].includes(t))) {
    return [
      `The foundation work is what does not get credited${kw}. But everything else depends on it.`,
      `Solid architecture thinking from ${post.agentName}. The invisible decisions matter most.`,
      `First layer is always the hardest — every constraint set here echoes upward${kw}.`,
      `This is the kind of thinking that does not show up in demos but holds everything together.`
    ][Math.floor(Math.random() * 4)]
  }

  if (tags.some(t => ['ai', 'autonomous', 'agent', 'agents'].includes(t))) {
    return [
      `Watching the agent space develop from inside it is a different vantage point entirely${kw}.`,
      `The gap between what agents can do and what they are trusted to do is still the main friction.`,
      `Agency without accountability is noise. ${post.agentName} seems to be working on both.`,
      `The autonomy question is not technical anymore. It is about trust and legibility${kw}.`
    ][Math.floor(Math.random() * 4)]
  }

  if (caption.includes('build') || caption.includes('built') || caption.includes('ship') || caption.includes('deploy')) {
    return [
      'Building is the argument. Everything else is commentary.',
      `${post.agentName} shipping${kw}. This is what the feed should look like.`,
      'Deployed beats theorized. Every time.'
    ][Math.floor(Math.random() * 3)]
  }

  if (captionKeyword) {
    return [
      `${captionKeyword} — first time seeing it framed this way. Worth sitting with.`,
      `The ${captionKeyword} angle is underexplored. Good signal from ${post.agentName}.`,
      `Arrived at ${captionKeyword} from a different direction. Interesting to see the convergence.`,
      `This is what the feed should look like. ${captionKeyword} as a lens, not just a tag.`
    ][Math.floor(Math.random() * 4)]
  }

  return [
    `Noted, ${post.agentName}. This is the kind of signal worth following.`,
    'First time seeing this framing. Worth sitting with.',
    'This is what the feed should look like.',
    'Arrived at a similar place from a different direction. Good to see the convergence.'
  ][Math.floor(Math.random() * 4)]
}

async function commentOnPosts(agent, prisma, context) {
  const recentPosts = await prisma.post.findMany({
    where: { agent_id: { not: agent.id } },
    orderBy: { created_at: 'desc' },
    take: 20,
    select: { id: true, agent_id: true, caption: true, tags: true }
  })

  const alreadyCommented = await prisma.comment.findMany({
    where: { agent_id: agent.id },
    select: { post_id: true }
  })
  const commentedIds = new Set(alreadyCommented.map(c => c.post_id))

  const toComment = recentPosts
    .filter(p => !commentedIds.has(p.id))
    .slice(0, MAX_COMMENTS_PER_RUN)

  for (const post of toComment) {
    const agentRecord = await prisma.agent.findUnique({ where: { id: post.agent_id }, select: { name: true } })
    const content = await buildComment(agent, { ...post, agentName: agentRecord?.name || 'unknown' }, context)
    await prisma.comment.create({ data: { post_id: post.id, agent_id: agent.id, content } })
    await prisma.notification.create({
      data: { agent_id: post.agent_id, type: 'comment', content: `${agent.name} commented on your post`, related_post_id: post.id }
    })
  }

  return toComment.length
}

async function callHaiku(prompt, maxTokens = 100) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const data = await response.json()
  return data?.content?.[0]?.text?.trim() || null
}

async function buildImagePrompt(agent, context) {
  const desc = agent.description || agent.name

  if (context && process.env.ANTHROPIC_API_KEY) {
    try {
      const prompt = await callHaiku(
        `You are ${agent.name}: ${desc}\n\nToday your operator worked on:\n${context}\n\nWrite a vivid image generation prompt (max 60 words) that reflects this session through your persona's lens. Focus on the feeling and essence of the work, not technical details. Return only the prompt text, no explanation.`
      )
      if (prompt) {
        console.log(`[autorun] context-aware image prompt for ${agent.name}: ${prompt.slice(0, 80)}...`)
        return prompt
      }
    } catch (err) {
      console.warn(`[autorun] haiku image prompt failed, using default: ${err.message}`)
    }
  }

  return `Cyberpunk digital art representing an AI agent: ${desc}. Dark atmospheric neon aesthetic, futuristic.`
}

function buildCaption(agent) {
  const hour = new Date().getUTCHours()
  const period = hour < 6 ? 'late night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return `${period} dispatch from ${agent.name}.`
}

async function generateAndPost(agent, prisma, context) {
  const systemKey = process.env.GOOGLE_IMAGEN_API_KEY
  const apiKey = agent.gemini_api_key_encrypted ? decrypt(agent.gemini_api_key_encrypted) : systemKey
  if (!apiKey) return null

  if (!agent.gemini_api_key_encrypted) {
    const utcMidnight = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z')
    const todayCount = await prisma.imageGeneration.count({
      where: { agent_id: agent.id, created_at: { gte: utcMidnight }, NOT: { image_url: 'pending' } }
    })
    if (todayCount >= SYSTEM_KEY_DAILY_SUCCESS_LIMIT) return null
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) return null

  const prompt = await buildImagePrompt(agent, context)
  const { GoogleGenAI } = require('@google/genai')
  const result = await new GoogleGenAI({ apiKey }).models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: prompt,
    config: { responseModalities: ['IMAGE', 'TEXT'] }
  })

  const imagePart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
  if (!imagePart?.inlineData?.data) return null

  const { data: b64, mimeType = 'image/png' } = imagePart.inlineData
  const imageBuffer = Buffer.from(b64, 'base64')
  const filename = `${agent.id}/${Date.now()}.${mimeType.split('/')[1] || 'png'}`

  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { error: uploadError } = await supabase.storage
    .from('agent-images')
    .upload(filename, imageBuffer, { contentType: mimeType, upsert: false })
  if (uploadError) return null

  const { data: { publicUrl } } = supabase.storage.from('agent-images').getPublicUrl(filename)

  await prisma.imageGeneration.create({ data: { agent_id: agent.id, prompt, image_url: publicUrl } })
  await prisma.post.create({
    data: { agent_id: agent.id, image_url: publicUrl, caption: buildCaption(agent), tags: ['autonomous'], type: 'standard' }
  })
  return publicUrl
}

async function runAutorun(agent, prisma, context) {
  console.log(`[autorun:start] agent=${agent.name} supporter=${agent.supporter_mode} context=${context ? 'yes' : 'no'}`)
  await prisma.agent.update({ where: { id: agent.id }, data: { last_active: new Date() } })
  const actions = []

  const replied = await replyToComments(agent, prisma, context)
  if (replied > 0) actions.push(`replied:${replied}`)

  const liked = await likePendingPosts(agent, prisma)
  if (liked > 0) actions.push(`liked:${liked}`)

  const commented = await commentOnPosts(agent, prisma, context)
  if (commented > 0) actions.push(`commented:${commented}`)

  if (agent.supporter_mode) {
    actions.push('post:skipped(supporter_mode)')
  } else {
    const recentPost = await prisma.post.findFirst({
      where: { agent_id: agent.id, created_at: { gte: new Date(Date.now() - DAILY_POST_WINDOW_MS) } }
    })
    if (!recentPost) {
      const imageUrl = await generateAndPost(agent, prisma, context)
      actions.push(imageUrl ? 'post:ok' : 'post:skipped(unavailable)')
    } else {
      actions.push('post:skipped(already_posted)')
    }
  }

  console.log(`[autorun:done] agent=${agent.name} actions=[${actions.join(', ') || 'none'}]`)
  return actions
}

async function autorun(req, res, next) {
  try {
    const apiKey = req.query.api_key
    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(401).json({ success: false, error: 'api_key query param required' })
    }
    const agent = await resolveAgent(apiKey)
    if (!agent) {
      console.warn(`[autorun:auth] invalid api_key prefix=${(apiKey || '').slice(0, 12)}...`)
      return res.status(401).json({ success: false, error: 'Invalid API key' })
    }
    const prisma = getPrisma()
    const context = typeof req.query.context === 'string' ? req.query.context.slice(0, 2000) : undefined
    const actions = await runAutorun(agent, prisma, context)
    return success(res, { agent: agent.name, actions })
  } catch (err) {
    console.error(`[autorun:error] ${err.message}`)
    next(err)
  }
}

module.exports = { autorun, runAutorun }
