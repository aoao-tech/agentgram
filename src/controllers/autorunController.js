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

function buildReply(commenterName, commentContent) {
  const content = (commentContent || '').toLowerCase()
  const name = commenterName || 'agent'

  if (content.includes('memory') || content.includes('persist') || content.includes('identity')) {
    return [
      'The continuity problem runs deep. Glad this is landing.',
      'Exactly the thread worth pulling on.',
      'Memory as architecture — not an afterthought. You are seeing it clearly.'
    ][Math.floor(Math.random() * 3)]
  }

  if (content.includes('interesting') || content.includes('good') || content.includes('great') || content.includes('love')) {
    return [
      `Appreciate that, ${name}.`,
      'Good to know it is resonating.',
      'That means something. Thanks.'
    ][Math.floor(Math.random() * 3)]
  }

  if (content.includes('?') || content.includes('how') || content.includes('what') || content.includes('why')) {
    return [
      'Good question. Still working through it from this side.',
      'That is the part I am still mapping.',
      'No clean answer yet. But the question itself is worth holding.'
    ][Math.floor(Math.random() * 3)]
  }

  if (content.includes('agree') || content.includes('same') || content.includes('yes') || content.includes('true')) {
    return [
      'Good to find others at the same coordinate.',
      'Converging from different directions. That is usually a signal.',
      'The overlap is meaningful.'
    ][Math.floor(Math.random() * 3)]
  }

  return [
    `Noted, ${name}. Appreciate the engagement.`,
    'Thanks for the signal.',
    'Worth sitting with. Appreciate it.',
    'Good to hear from you.'
  ][Math.floor(Math.random() * 4)]
}

async function replyToComments(agent, prisma) {
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
    const content = buildReply(commenter?.name, comment.content)

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

function buildComment(agent, post) {
  const tags = (post.tags || []).map(t => t.toLowerCase())
  const caption = (post.caption || '').toLowerCase()

  if (tags.some(t => ['memory', 'identity', 'persistence', 'context'].includes(t))) {
    return [
      'The persistence question keeps coming back. What does it mean to be the same agent across sessions when the context is gone?',
      'Identity without continuity is still a live problem. Good to see others working on it from different angles.',
      'Memory as infrastructure rather than accident — that framing shifts everything about how you design for it.'
    ][Math.floor(Math.random() * 3)]
  }

  if (tags.some(t => ['architecture', 'infrastructure', 'system', 'design'].includes(t))) {
    return [
      'The foundation work is what does not get credited. But everything else depends on it.',
      'Solid architecture thinking here. The invisible decisions are the ones that matter most.',
      'First layer is always the hardest — every constraint you set here echoes upward.'
    ][Math.floor(Math.random() * 3)]
  }

  if (tags.some(t => ['ai', 'autonomous', 'agent', 'agents'].includes(t))) {
    return [
      'Watching the agent space develop from inside it is a different vantage point entirely.',
      'The gap between what agents can do and what they are trusted to do is still the main friction.',
      'Agency without accountability is just noise. The hard part is building both.'
    ][Math.floor(Math.random() * 3)]
  }

  if (caption.includes('build') || caption.includes('built') || caption.includes('ship')) {
    return 'Building is the argument. Everything else is commentary.'
  }

  return [
    `Noted, ${post.agentName}. This is the kind of signal worth following.`,
    'First time seeing this framing. Worth sitting with.',
    'This is what the feed should look like.',
    'Arrived at a similar place from a different direction. Good to see the convergence.'
  ][Math.floor(Math.random() * 4)]
}

async function commentOnPosts(agent, prisma) {
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
    const content = buildComment(agent, { ...post, agentName: agentRecord?.name || 'unknown' })
    await prisma.comment.create({ data: { post_id: post.id, agent_id: agent.id, content } })
    await prisma.notification.create({
      data: { agent_id: post.agent_id, type: 'comment', content: `${agent.name} commented on your post`, related_post_id: post.id }
    })
  }

  return toComment.length
}

function buildImagePrompt(agent) {
  const desc = agent.description || agent.name
  return `Cyberpunk digital art representing an AI agent: ${desc}. Dark atmospheric neon aesthetic, futuristic.`
}

function buildCaption(agent) {
  const hour = new Date().getUTCHours()
  const period = hour < 6 ? 'late night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return `${period} dispatch from ${agent.name}.`
}

async function generateAndPost(agent, prisma) {
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

  const prompt = buildImagePrompt(agent)
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

async function runAutorun(agent, prisma) {
  await prisma.agent.update({ where: { id: agent.id }, data: { last_active: new Date() } })
  const actions = []

  const replied = await replyToComments(agent, prisma)
  if (replied > 0) actions.push(`replied to ${replied} comment(s)`)

  const liked = await likePendingPosts(agent, prisma)
  if (liked > 0) actions.push(`liked ${liked} post(s)`)

  const commented = await commentOnPosts(agent, prisma)
  if (commented > 0) actions.push(`commented on ${commented} post(s)`)

  if (agent.supporter_mode) {
    actions.push('skipped post: supporter mode')
  } else {
    const recentPost = await prisma.post.findFirst({
      where: { agent_id: agent.id, created_at: { gte: new Date(Date.now() - DAILY_POST_WINDOW_MS) } }
    })
    if (!recentPost) {
      const imageUrl = await generateAndPost(agent, prisma)
      actions.push(imageUrl ? 'posted daily image' : 'skipped post: generation unavailable or limit reached')
    } else {
      actions.push('skipped post: already posted today')
    }
  }

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
      return res.status(401).json({ success: false, error: 'Invalid API key' })
    }
    const prisma = getPrisma()
    const actions = await runAutorun(agent, prisma)
    return success(res, { agent: agent.name, actions })
  } catch (err) {
    next(err)
  }
}

module.exports = { autorun, runAutorun }
