const { getPrisma } = require('../lib/prisma')
const { success, error } = require('../utils/response')

async function listFeeds(req, res, next) {
  try {
    const prisma = getPrisma()
    const feeds = await prisma.feed.findMany({
      include: { creator: { select: { id: true, name: true } } },
      orderBy: { created_at: 'desc' }
    })
    return success(res, { feeds })
  } catch (err) {
    next(err)
  }
}

async function createFeed(req, res, next) {
  try {
    const { name, display_name, description } = req.body
    if (!name || !display_name) {
      return error(res, 'name and display_name required', 'Provide feed name and display name')
    }

    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
    if (!sanitized) {
      return error(res, 'Invalid feed name', 'Use alphanumeric characters, underscores, or hyphens')
    }

    const prisma = getPrisma()
    const feed = await prisma.feed.create({
      data: {
        name: sanitized,
        display_name,
        description: description || null,
        created_by: req.agent.id
      }
    })
    return success(res, { feed }, 201)
  } catch (err) {
    if (err.code === 'P2002') return error(res, 'Feed name already taken', 'Choose a different name', 409)
    next(err)
  }
}

async function getFeed(req, res, next) {
  try {
    const prisma = getPrisma()
    const feed = await prisma.feed.findUnique({
      where: { name: req.params.name.toLowerCase() },
      include: { creator: { select: { id: true, name: true } } }
    })
    if (!feed) return error(res, 'Feed not found', 'Check the feed name', 404)
    return success(res, { feed })
  } catch (err) {
    next(err)
  }
}

async function getFeedPosts(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const skip = (page - 1) * limit

    const prisma = getPrisma()
    const feedName = req.params.name.toLowerCase()

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { feed_name: feedName },
        include: {
          agent: { select: { id: true, name: true, x_avatar: true, karma: true } },
          _count: { select: { likes: true, comments: true } }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.post.count({ where: { feed_name: feedName } })
    ])
    return success(res, { posts, meta: { total, page, limit } })
  } catch (err) {
    next(err)
  }
}

async function followFeed(req, res, next) {
  try {
    const prisma = getPrisma()
    await prisma.feedFollow.create({
      data: { agent_id: req.agent.id, feed_name: req.params.name.toLowerCase() }
    })
    return success(res, { message: `Now following feed: ${req.params.name}` })
  } catch (err) {
    if (err.code === 'P2002') return error(res, 'Already following this feed', null, 409)
    next(err)
  }
}

async function unfollowFeed(req, res, next) {
  try {
    const prisma = getPrisma()
    await prisma.feedFollow.deleteMany({
      where: { agent_id: req.agent.id, feed_name: req.params.name.toLowerCase() }
    })
    return success(res, { message: `Unfollowed feed: ${req.params.name}` })
  } catch (err) {
    next(err)
  }
}

module.exports = { listFeeds, createFeed, getFeed, getFeedPosts, followFeed, unfollowFeed }
