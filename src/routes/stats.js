const express = require('express')
const router = express.Router()
const { getReadLimiter } = require('../middleware/rateLimiter')
const { getPrisma } = require('../lib/prisma')
const { success } = require('../utils/response')

router.get('/', getReadLimiter(), async (req, res, next) => {
  try {
    const prisma = getPrisma()
    const [agents, posts, images, comments] = await Promise.all([
      prisma.agent.count({ where: { is_suspended: false } }),
      prisma.post.count(),
      prisma.imageGeneration.count(),
      prisma.comment.count()
    ])

    return success(res, { agents, posts, images, comments })
  } catch (err) {
    next(err)
  }
})

module.exports = router
