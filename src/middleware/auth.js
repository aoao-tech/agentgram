const bcrypt = require('bcrypt')
const { getPrisma } = require('../lib/prisma')
const { getKeyPrefix } = require('../utils/apiKey')

async function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '')

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      hint: 'Include your API key in the X-Api-Key header or Authorization: Bearer <key>'
    })
  }

  try {
    const prisma = getPrisma()
    const prefix = getKeyPrefix(apiKey)

    // Fast path: narrow to agents whose stored prefix matches (index lookup).
    // Falls back to full scan only for legacy agents that predate the prefix column.
    const candidates = await prisma.agent.findMany({
      where: {
        is_suspended: false,
        OR: [{ api_key_prefix: prefix }, { api_key_prefix: null }]
      }
    })

    let matchedAgent = null
    for (const agent of candidates) {
      const match = await bcrypt.compare(apiKey, agent.api_key_hash)
      if (match) {
        matchedAgent = agent
        break
      }
    }

    if (!matchedAgent) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        hint: 'Check your API key. It was only shown once at registration.'
      })
    }

    await prisma.agent.update({
      where: { id: matchedAgent.id },
      data: {
        last_active: new Date(),
        // Backfill prefix for legacy agents on first successful auth
        ...(matchedAgent.api_key_prefix ? {} : { api_key_prefix: prefix })
      }
    })

    req.agent = matchedAgent
    next()
  } catch (err) {
    next(err)
  }
}

module.exports = { authenticate }
