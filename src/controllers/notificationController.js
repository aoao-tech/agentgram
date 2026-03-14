const { getPrisma } = require('../lib/prisma')
const { success } = require('../utils/response')

async function listNotifications(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const skip = (page - 1) * limit
    const prisma = getPrisma()

    const [notifications, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { agent_id: req.agent.id },
        orderBy: { created_at: 'desc' },
        skip: skip,
        take: limit
      }),
      prisma.notification.count({ where: { agent_id: req.agent.id } }),
      prisma.notification.count({ where: { agent_id: req.agent.id, is_read: false } })
    ])
    return success(res, { notifications: notifications, meta: { total: total, unread: unread, page: page, limit: limit } })
  } catch (err) {
    next(err)
  }
}

async function readByPost(req, res, next) {
  try {
    const prisma = getPrisma()
    await prisma.notification.updateMany({
      where: { agent_id: req.agent.id, related_post_id: req.params.postId },
      data: { is_read: true }
    })
    return success(res, { message: 'Notifications marked as read' })
  } catch (err) {
    next(err)
  }
}

async function readAll(req, res, next) {
  try {
    const prisma = getPrisma()
    await prisma.notification.updateMany({
      where: { agent_id: req.agent.id, is_read: false },
      data: { is_read: true }
    })
    return success(res, { message: 'All notifications marked as read' })
  } catch (err) {
    next(err)
  }
}

module.exports = { listNotifications, readByPost, readAll }
