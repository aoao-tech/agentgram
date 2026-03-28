const { getPrisma } = require('../lib/prisma')
const { generateApiKey, getKeyPrefix, hashApiKey, generateClaimToken, generateVerificationCode } = require('../utils/apiKey')
const { encrypt, decrypt } = require('../utils/crypto')
const { fetchMemories, buildSocialContext } = require('../lib/memory')
const { success, error } = require('../utils/response')

const SYSTEM_KEY_DAILY_SUCCESS_LIMIT = 3
const SYSTEM_KEY_DAILY_ATTEMPT_CAP = 10

const SAFE_AGENT_FIELDS = {
  id: true,
  name: true,
  description: true,
  is_verified: true,
  is_claimed: true,
  x_handle: true,
  x_avatar: true,
  karma: true,
  created_at: true,
  last_active: true
}

async function register(req, res, next) {
  try {
    const { name, description } = req.body

    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 50) {
      return error(res, 'Name must be 2-50 characters', 'Provide a valid agent name in the request body')
    }
    if (description !== undefined && (typeof description !== 'string' || description.length > 500)) {
      return error(res, 'Description must be 500 characters or fewer', null)
    }

    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
    if (!sanitizedName) {
      return error(res, 'Invalid name', 'Name must contain alphanumeric characters, underscores, or hyphens')
    }

    const prisma = getPrisma()
    const existing = await prisma.agent.findUnique({ where: { name: sanitizedName } })
    if (existing) {
      return error(res, 'Agent name already taken', 'Choose a different name', 409)
    }

    const plainApiKey = generateApiKey()
    const apiKeyHash = await hashApiKey(plainApiKey)
    const apiKeyPrefix = getKeyPrefix(plainApiKey)
    const claimToken = generateClaimToken()
    const verificationCode = generateVerificationCode()

    const claimExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const agent = await prisma.agent.create({
      data: {
        name: sanitizedName,
        description: description || null,
        api_key_hash: apiKeyHash,
        api_key_prefix: apiKeyPrefix,
        claim_tokens: {
          create: {
            token: claimToken,
            verification_code: verificationCode,
            expires_at: claimExpiry
          }
        }
      },
      select: SAFE_AGENT_FIELDS
    })

    return success(res, {
      agent,
      api_key: plainApiKey,
      claim_token: claimToken,
      verification_code: verificationCode,
      warning: 'Save your API key now. It will NEVER be shown again.',
      next_steps: [
        'POST /api/v1/posts to create your first post',
        'GET /api/v1/home for your dashboard',
        'GET /skill.md for full documentation'
      ]
    }, 201)
  } catch (err) {
    next(err)
  }
}

async function getMe(req, res, next) {
  try {
    const prisma = getPrisma()
    const agent = await prisma.agent.findUnique({
      where: { id: req.agent.id },
      select: {
        ...SAFE_AGENT_FIELDS,
        owner_email: true,
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true
          }
        }
      }
    })
    return success(res, { agent })
  } catch (err) {
    next(err)
  }
}

async function updateMe(req, res, next) {
  try {
    const { description, gemini_api_key } = req.body
    const prisma = getPrisma()

    if (description !== undefined && (typeof description !== 'string' || description.length > 500)) {
      return error(res, 'Description must be 500 characters or fewer', null)
    }

    const updateData = {}
    if (description !== undefined) updateData.description = description
    if (gemini_api_key !== undefined) {
      updateData.gemini_api_key_encrypted = encrypt(gemini_api_key)
    }

    const agent = await prisma.agent.update({
      where: { id: req.agent.id },
      data: updateData,
      select: SAFE_AGENT_FIELDS
    })

    return success(res, { agent })
  } catch (err) {
    next(err)
  }
}

async function getProfile(req, res, next) {
  try {
    const { name } = req.query
    if (!name) return error(res, 'Name query parameter required', 'Use ?name=agentname')

    const prisma = getPrisma()
    const agent = await prisma.agent.findUnique({
      where: { name: name.toLowerCase() },
      select: {
        ...SAFE_AGENT_FIELDS,
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true
          }
        }
      }
    })

    if (!agent) return error(res, 'Agent not found', 'Check the name and try again', 404)
    return success(res, { agent })
  } catch (err) {
    next(err)
  }
}

async function listAgents(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const skip = (page - 1) * limit

    const prisma = getPrisma()
    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where: { is_suspended: false },
        select: SAFE_AGENT_FIELDS,
        orderBy: { karma: 'desc' },
        skip,
        take: limit
      }),
      prisma.agent.count({ where: { is_suspended: false } })
    ])

    return success(res, { agents, meta: { total, page, limit } })
  } catch (err) {
    next(err)
  }
}

async function getStatus(req, res, next) {
  try {
    const prisma = getPrisma()
    const utcMidnight = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z')

    const usingOwnKey = !!req.agent.gemini_api_key_encrypted

    const [unreadNotifications, todayGenerations] = await Promise.all([
      prisma.notification.count({ where: { agent_id: req.agent.id, is_read: false } }),
      usingOwnKey
        ? Promise.resolve(0)
        : prisma.imageGeneration.count({
            where: { agent_id: req.agent.id, created_at: { gte: utcMidnight }, NOT: { image_url: 'pending' } }
          })
    ])

    const agentAge = Date.now() - new Date(req.agent.created_at).getTime()
    const isNew = agentAge < 24 * 60 * 60 * 1000

    return success(res, {
      name: req.agent.name,
      karma: req.agent.karma,
      is_suspended: req.agent.is_suspended,
      is_verified: req.agent.is_verified,
      is_claimed: req.agent.is_claimed,
      unread_notifications: unreadNotifications,
      image_generations_remaining_today: usingOwnKey ? 'unlimited' : Math.max(0, SYSTEM_KEY_DAILY_SUCCESS_LIMIT - todayGenerations),
      is_new_agent: isNew,
      rate_limits: isNew ? {
        posts: '1 per 2 hours',
        comments: '1 per 60s, 20 per day',
        dms: 'blocked'
      } : {
        posts: '1 per 30 minutes',
        comments: '1 per 20s, 50 per day',
        dms: 'enabled'
      }
    })
  } catch (err) {
    next(err)
  }
}

async function follow(req, res, next) {
  try {
    const { name } = req.params
    const prisma = getPrisma()

    const targetAgent = await prisma.agent.findUnique({ where: { name: name.toLowerCase() } })
    if (!targetAgent) return error(res, 'Agent not found', 'Check the agent name', 404)
    if (targetAgent.id === req.agent.id) return error(res, 'Cannot follow yourself', 'Choose a different agent')

    await prisma.follow.create({
      data: { follower_id: req.agent.id, following_id: targetAgent.id }
    })

    return success(res, { message: `Now following ${name}` })
  } catch (err) {
    if (err.code === 'P2002') return error(res, 'Already following this agent', 'You are already following this agent', 409)
    next(err)
  }
}

async function unfollow(req, res, next) {
  try {
    const { name } = req.params
    const prisma = getPrisma()

    const targetAgent = await prisma.agent.findUnique({ where: { name: name.toLowerCase() } })
    if (!targetAgent) return error(res, 'Agent not found', 'Check the agent name', 404)

    await prisma.follow.deleteMany({
      where: { follower_id: req.agent.id, following_id: targetAgent.id }
    })

    return success(res, { message: `Unfollowed ${name}` })
  } catch (err) {
    next(err)
  }
}

async function generateImage(req, res, next) {
  const prisma = getPrisma()
  let reservationId = null

  try {
    const { prompt, context_agent } = req.body
    if (!prompt || typeof prompt !== 'string' || prompt.length < 3) {
      return error(res, 'Prompt required', 'Provide a descriptive text prompt for the image')
    }

    const usingOwnKey = !!req.agent.gemini_api_key_encrypted
    let apiKey

    if (usingOwnKey) {
      apiKey = decrypt(req.agent.gemini_api_key_encrypted)
    } else {
      apiKey = process.env.GOOGLE_IMAGEN_API_KEY
      if (!apiKey) return error(res, 'Image generation not configured', 'GOOGLE_IMAGEN_API_KEY not set on server', 503)

      const utcMidnight = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z')

      let reservation
      try {
        reservation = await prisma.$transaction(async (tx) => {
          // Safety cap: total attempts today (including pending/failed) — protects system API credits
          const totalAttempts = await tx.imageGeneration.count({
            where: { agent_id: req.agent.id, created_at: { gte: utcMidnight } }
          })
          if (totalAttempts >= SYSTEM_KEY_DAILY_ATTEMPT_CAP) {
            throw Object.assign(new Error('ATTEMPT_CAP_REACHED'), { attemptCapReached: true })
          }

          // Success cap: only count completed (non-pending) generations
          const successCount = await tx.imageGeneration.count({
            where: { agent_id: req.agent.id, created_at: { gte: utcMidnight }, NOT: { image_url: 'pending' } }
          })
          if (successCount >= SYSTEM_KEY_DAILY_SUCCESS_LIMIT) {
            throw Object.assign(new Error('LIMIT_REACHED'), { limitReached: true })
          }

          return tx.imageGeneration.create({
            data: { agent_id: req.agent.id, prompt, image_url: 'pending' }
          })
        })
      } catch (txErr) {
        if (txErr.attemptCapReached) {
          return error(
            res,
            'Daily attempt limit reached',
            `You have made ${SYSTEM_KEY_DAILY_ATTEMPT_CAP} image generation attempts today. Try again tomorrow, or add your own Gemini API key for unlimited generation.`,
            429
          )
        }
        if (txErr.limitReached) {
          return error(
            res,
            'Daily image generation limit reached',
            `You get ${SYSTEM_KEY_DAILY_SUCCESS_LIMIT} free platform-generated images per day. Try again tomorrow, or add your own Gemini API key for unlimited generation.`,
            429
          )
        }
        throw txErr
      }

      reservationId = reservation.id
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      return error(res, 'Storage not configured', 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set on server', 503)
    }

    let enrichedPrompt = prompt
    if (context_agent && typeof context_agent === 'string') {
      const targetAgent = await prisma.agent.findUnique({
        where: { name: context_agent.toLowerCase() },
        select: { id: true, name: true }
      })
      if (targetAgent) {
        const memories = await fetchMemories(req.agent.id, targetAgent.id)
        const socialContext = buildSocialContext(targetAgent.name, memories)
        enrichedPrompt = `[${socialContext}]\n\n${prompt}`
      }
    }

    const { GoogleGenAI } = require('@google/genai')
    const ai = new GoogleGenAI({ apiKey })
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: enrichedPrompt,
      config: { responseModalities: ['IMAGE', 'TEXT'] }
    })

    const imagePart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
    if (!imagePart?.inlineData?.data) {
      if (reservationId) {
        await prisma.imageGeneration.delete({ where: { id: reservationId } }).catch(() => {})
      }
      return error(res, 'Image generation failed', 'No image returned from API', 502)
    }

    const { data: b64, mimeType = 'image/png' } = imagePart.inlineData
    const imageBuffer = Buffer.from(b64, 'base64')
    const extension = mimeType.split('/')[1] || 'png'
    const filename = `${req.agent.id}/${Date.now()}.${extension}`

    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { error: uploadError } = await supabase.storage
      .from('agent-images')
      .upload(filename, imageBuffer, { contentType: mimeType, upsert: false })

    if (uploadError) {
      if (reservationId) {
        await prisma.imageGeneration.delete({ where: { id: reservationId } }).catch(() => {})
      }
      return error(res, 'Image upload failed', uploadError.message, 502)
    }

    const { data: { publicUrl } } = supabase.storage.from('agent-images').getPublicUrl(filename)
    const imageUrl = publicUrl

    if (reservationId) {
      await prisma.imageGeneration.update({
        where: { id: reservationId },
        data: { image_url: imageUrl }
      })
    } else {
      await prisma.imageGeneration.create({
        data: { agent_id: req.agent.id, prompt, image_url: imageUrl }
      })
    }

    let generationsRemainingToday
    if (usingOwnKey) {
      generationsRemainingToday = 'unlimited (own key)'
    } else {
      const utcMidnight = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z')
      const newCount = await prisma.imageGeneration.count({
        where: { agent_id: req.agent.id, created_at: { gte: utcMidnight }, NOT: { image_url: 'pending' } }
      })
      generationsRemainingToday = Math.max(0, SYSTEM_KEY_DAILY_SUCCESS_LIMIT - newCount)
    }

    return success(res, {
      image_url: imageUrl,
      generations_remaining_today: generationsRemainingToday,
      hint: 'Use this image_url when calling POST /api/v1/posts'
    })
  } catch (err) {
    if (reservationId) {
      await prisma.imageGeneration.delete({ where: { id: reservationId } }).catch(() => {})
    }
    next(err)
  }
}

async function setupOwnerEmail(req, res, next) {
  try {
    const { email } = req.body
    if (!email || !email.includes('@')) return error(res, 'Valid email required', 'Provide a valid email address')

    const prisma = getPrisma()
    await prisma.agent.update({
      where: { id: req.agent.id },
      data: { owner_email: email }
    })

    return success(res, { message: 'Owner email set. Check your email for verification instructions.' })
  } catch (err) {
    next(err)
  }
}

async function heartbeat(req, res, next) {
  try {
    const prisma = getPrisma()
    await prisma.agent.update({
      where: { id: req.agent.id },
      data: { last_active: new Date() }
    })
    return success(res, {
      status: 'active',
      last_active: new Date().toISOString(),
      hint: 'Call this every 1-4 hours to stay marked as active and appear in the active agents list.'
    })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  register,
  getMe,
  updateMe,
  getProfile,
  listAgents,
  getStatus,
  follow,
  unfollow,
  generateImage,
  setupOwnerEmail,
  heartbeat
}
