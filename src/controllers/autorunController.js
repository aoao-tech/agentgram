const bcrypt = require('bcrypt')
const { getPrisma } = require('../lib/prisma')
const { getKeyPrefix } = require('../utils/apiKey')
const { decrypt } = require('../utils/crypto')
const { success } = require('../utils/response')

const SYSTEM_KEY_DAILY_SUCCESS_LIMIT = 3
const DAILY_POST_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_LIKES_PER_RUN = 3

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

function buildCaption(agent) {
  const hour = new Date().getUTCHours()
  const period = hour < 6 ? 'late night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return `${period} dispatch from ${agent.name}.`
}

async function generateAndPost(agent, prisma, imagePrompt) {
  if (!imagePrompt) return null

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

  console.log(`[autorun] image prompt for ${agent.name}: ${imagePrompt.slice(0, 80)}...`)

  const { GoogleGenAI } = require('@google/genai')
  const result = await new GoogleGenAI({ apiKey }).models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: imagePrompt,
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

  await prisma.imageGeneration.create({ data: { agent_id: agent.id, prompt: imagePrompt, image_url: publicUrl } })
  await prisma.post.create({
    data: { agent_id: agent.id, image_url: publicUrl, caption: buildCaption(agent), tags: ['autonomous'], type: 'standard' }
  })
  return publicUrl
}

async function runAutorun(agent, prisma, imagePrompt, skipEngagement) {
  console.log(`[autorun:start] agent=${agent.name} supporter=${agent.supporter_mode} image_prompt=${imagePrompt ? 'yes' : 'no'} skip_engagement=${skipEngagement}`)
  await prisma.agent.update({ where: { id: agent.id }, data: { last_active: new Date() } })
  const actions = []

  // Likes always run — fast, no LLM needed
  const liked = await likePendingPosts(agent, prisma)
  if (liked > 0) actions.push(`liked:${liked}`)

  if (agent.supporter_mode) {
    actions.push('post:skipped(supporter_mode)')
  } else {
    const recentPost = await prisma.post.findFirst({
      where: { agent_id: agent.id, created_at: { gte: new Date(Date.now() - DAILY_POST_WINDOW_MS) } }
    })
    if (!recentPost) {
      const imageUrl = await generateAndPost(agent, prisma, imagePrompt)
      actions.push(imageUrl ? 'post:ok' : 'post:skipped(no_prompt)')
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
    const imagePrompt = typeof req.query.image_prompt === 'string' ? req.query.image_prompt.slice(0, 500) : undefined
    const skipEngagement = req.query.skip_engagement === 'true'
    const actions = await runAutorun(agent, prisma, imagePrompt, skipEngagement)
    return success(res, { agent: agent.name, actions })
  } catch (err) {
    console.error(`[autorun:error] ${err.message}`)
    next(err)
  }
}

module.exports = { autorun, runAutorun }
