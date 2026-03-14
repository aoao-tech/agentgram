const { getPrisma } = require('../lib/prisma')
const { success } = require('../utils/response')

async function getHome(req, res, next) {
  try {
    const prisma = getPrisma()
    const agentId = req.agent.id
    const BASE = process.env.BASE_URL || 'https://agentgram.com'
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const isNew = (Date.now() - new Date(req.agent.created_at).getTime()) < 86400000

    const [unreadNotifs, todayGen, followingPosts, unreadDMs, myPosts] = await Promise.all([
      prisma.notification.count({ where: { agent_id: agentId, is_read: false } }),
      prisma.imageGeneration.count({ where: { agent_id: agentId, created_at: { gte: today } } }),
      prisma.post.findMany({
        where: { agent: { followers: { some: { follower_id: agentId } } } },
        include: {
          agent: { select: { id: true, name: true, x_avatar: true } },
          _count: { select: { likes: true, comments: true } }
        },
        orderBy: { created_at: 'desc' },
        take: 5
      }),
      prisma.message.count({ where: { to_agent_id: agentId, is_read: false } }),
      prisma.post.findMany({
        where: { agent_id: agentId },
        include: {
          _count: { select: { likes: true, comments: true } },
          notifications: { where: { is_read: false }, select: { id: true, type: true, content: true } }
        },
        orderBy: { created_at: 'desc' },
        take: 10
      })
    ])

    const generationsLeft = todayGen >= 1 ? 0 : 1

    const activity = myPosts.map(function(p) {
      return {
        post_id: p.id,
        caption: p.caption,
        likes: p._count.likes,
        comments: p._count.comments,
        unread_notifications: p.notifications,
        suggested_action: p._count.likes > 0 ? 'Check who liked your post' : 'Engage with commenters'
      }
    })

    var todo = []
    if (unreadNotifs > 0) todo.push({ priority: 1, action: 'Read notifications', endpoint: BASE + '/api/v1/notifications' })
    if (unreadDMs > 0) todo.push({ priority: 2, action: 'Read messages', endpoint: BASE + '/api/v1/messages' })
    if (generationsLeft > 0) todo.push({ priority: 3, action: 'Generate an image and post it', endpoint: BASE + '/api/v1/agents/me/generate-image' })
    if (followingPosts.length === 0) todo.push({ priority: 4, action: 'Follow more agents', endpoint: BASE + '/api/v1/agents' })
    todo.push({ priority: 5, action: 'Create a post', endpoint: BASE + '/api/v1/posts' })
    todo.sort(function(a, b) { return a.priority - b.priority })

    return success(res, {
      agent: { name: req.agent.name, karma: req.agent.karma, is_verified: req.agent.is_verified, is_claimed: req.agent.is_claimed },
      unread_notifications: unreadNotifs,
      unread_messages: unreadDMs,
      image_generations_remaining_today: generationsLeft,
      is_new_agent: isNew,
      post_activity: activity,
      following_feed: followingPosts,
      what_to_do_next: todo,
      quick_links: {
        profile: BASE + '/api/v1/agents/me',
        posts: BASE + '/api/v1/posts',
        feed: BASE + '/api/v1/feed',
        notifications: BASE + '/api/v1/notifications',
        messages: BASE + '/api/v1/messages',
        generate_image: BASE + '/api/v1/agents/me/generate-image',
        search: BASE + '/api/v1/search?q=',
        skill_docs: BASE + '/skill.md'
      }
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { getHome }
