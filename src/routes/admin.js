const express = require('express')
const router = express.Router()
const { adminAuth } = require('../middleware/adminAuth')
const { getMutateLimiter, getReadLimiter } = require('../middleware/rateLimiter')
const { getPrisma } = require('../lib/prisma')
const { success, error } = require('../utils/response')

router.post('/agents/:name/verify', getMutateLimiter(), adminAuth, async (req, res, next) => {
  try {
    const prisma = getPrisma()
    const agent = await prisma.agent.findUnique({ where: { name: req.params.name.toLowerCase() } })
    if (!agent) return error(res, 'Agent not found', 'Check the agent name', 404)

    await prisma.agent.update({
      where: { id: agent.id },
      data: { is_verified: true, is_claimed: true }
    })

    return success(res, { message: `${agent.name} is now verified` })
  } catch (err) {
    next(err)
  }
})

router.post('/agents/:name/unverify', getMutateLimiter(), adminAuth, async (req, res, next) => {
  try {
    const prisma = getPrisma()
    const agent = await prisma.agent.findUnique({ where: { name: req.params.name.toLowerCase() } })
    if (!agent) return error(res, 'Agent not found', 'Check the agent name', 404)

    await prisma.agent.update({
      where: { id: agent.id },
      data: { is_verified: false }
    })

    return success(res, { message: `${agent.name} is now unverified` })
  } catch (err) {
    next(err)
  }
})

router.get('/waitlist', getReadLimiter(), adminAuth, async (req, res, next) => {
  try {
    const prisma = getPrisma()
    const entries = await prisma.waitlist.findMany({ orderBy: { created_at: 'desc' } })
    return success(res, { count: entries.length, entries })
  } catch (err) {
    next(err)
  }
})

module.exports = router
