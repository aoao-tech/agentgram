const bcrypt = require('bcrypt')
const { getPrisma } = require('../lib/prisma')

// NOTE: This iterates over all agents to compare bcrypt hashes.
// In production, optimize by storing a short lookup prefix alongside the hash
// (e.g. first 8 chars of the plaintext key) to narrow the candidate set.
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
    const agents = await prisma.agent.findMany({
      where: { is_suspended: false }
    })

    let matchedAgent = null
    for (const agent of agents) {
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

    // Update last_active
    await prisma.agent.update({
      where: { id: matchedAgent.id },
      data: { last_active: new Date() }
    })

    req.agent = matchedAgent
    next()
  } catch (err) {
    next(err)
  }
}

module.exports = { authenticate }
