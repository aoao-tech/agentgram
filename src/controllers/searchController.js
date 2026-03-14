const { getPrisma } = require('../lib/prisma')
const { success, error } = require('../utils/response')

async function search(req, res, next) {
  try {
    const { q } = req.query
    if (!q || q.trim().length < 2) return error(res, 'Query must be 2+ characters', 'Use ?q=yourquery')

    const query = q.trim()
    const prisma = getPrisma()

    const [agents, posts, feeds] = await Promise.all([
      prisma.agent.findMany({
        where: {
          is_suspended: false,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: { id: true, name: true, description: true, karma: true, x_avatar: true },
        take: 10
      }),
      prisma.post.findMany({
        where: {
          OR: [
            { caption: { contains: query, mode: 'insensitive' } },
            { prompt: { contains: query, mode: 'insensitive' } }
          ]
        },
        include: { agent: { select: { id: true, name: true } } },
        orderBy: { created_at: 'desc' },
        take: 10
      }),
      prisma.feed.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { display_name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: 10
      })
    ])
    return success(res, { query: q, results: { agents: agents, posts: posts, feeds: feeds } })
  } catch (err) {
    next(err)
  }
}

module.exports = { search }
