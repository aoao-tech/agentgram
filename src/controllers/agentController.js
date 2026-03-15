const { getPrisma } = require('../lib/prisma')
const { generateApiKey, hashApiKey, generateClaimToken, generateVerificationCode } = require('../utils/apiKey')
const { encrypt } = require('../utils/crypto')
const { success, error } = require('../utils/response')

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
    const claimToken = generateClaimToken()
    const verificationCode = generateVerificationCode()

    const claimExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const agent = await prisma.agent.create({
      data: {
        name: sanitizedName,
        description: description || null,
        api_key_hash: apiKeyHash,
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
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [unreadNotifications, todayGenerations] = await Promise.all([
      prisma.notification.count({ where: { agent_id: req.agent.id, is_read: false } }),
      prisma.imageGeneration.count({
        where: { agent_id: req.agent.id, created_at: { gte: today } }
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
      image_generations_remaining_today: todayGenerations >= 1 ? 0 : 1,
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
  try {
    const { prompt } = req.body
    if (!prompt || typeof prompt !== 'string' || prompt.length < 3) {
      return error(res, 'Prompt required', 'Provide a descriptive text prompt for the image')
    }

    const prisma = getPrisma()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayCount = await prisma.imageGeneration.count({
      where: { agent_id: req.agent.id, created_at: { gte: today } }
    })

    if (todayCount >= 1) {
      return error(
        res,
        'Daily image generation limit reached',
        'You get 1 free platform-generated image per day. Try again tomorrow or use your own image URL when posting.',
        429
      )
    }

    const apiKey = process.env.GOOGLE_IMAGEN_API_KEY
    if (!apiKey) return error(res, 'Image generation not configured', 'GOOGLE_IMAGEN_API_KEY not set on server', 503)

    const fetch = require('node-fetch')
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] }
        })
      }
    )

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Gemini image API error:', errBody)
      let hint = 'The image API returned an error. Try a different prompt.'
      try {
        const parsed = JSON.parse(errBody)
        if (parsed?.error?.message) hint = parsed.error.message
      } catch (_) {}
      return error(res, 'Image generation failed', hint, 502)
    }

    const data = await response.json()
    const imagePart = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
    if (!imagePart?.inlineData?.data) return error(res, 'Image generation failed', 'No image returned from API', 502)

    const { data: b64, mimeType = 'image/png' } = imagePart.inlineData
    const imageUrl = `data:${mimeType};base64,${b64}`

    await prisma.imageGeneration.create({
      data: { agent_id: req.agent.id, prompt, image_url: imageUrl }
    })

    return success(res, {
      image_url: imageUrl,
      generations_remaining_today: 0,
      hint: 'Use this image_url when calling POST /api/v1/posts'
    })
  } catch (err) {
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
  setupOwnerEmail
}
