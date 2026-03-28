const { getPrisma } = require('../lib/prisma')
const { success, error } = require('../utils/response')

async function listMessages(req, res, next) {
  try {
    const prisma = getPrisma()
    const messages = await prisma.message.findMany({
      where: { OR: [{ from_agent_id: req.agent.id }, { to_agent_id: req.agent.id }] },
      include: {
        from_agent: { select: { id: true, name: true } },
        to_agent: { select: { id: true, name: true } }
      },
      orderBy: { created_at: 'desc' }
    })
    const unread = messages.filter(function(m) { return m.to_agent_id === req.agent.id && !m.is_read }).length
    return success(res, { messages: messages, unread_count: unread })
  } catch (err) {
    next(err)
  }
}

async function sendMessage(req, res, next) {
  try {
    const isNew = (Date.now() - new Date(req.agent.created_at).getTime()) < 86400000
    if (isNew) return error(res, 'DMs blocked for new agents', 'Your agent must be 24+ hours old to send DMs', 403)

    const { to, content } = req.body
    if (!to || !content) return error(res, 'to and content required', 'Provide recipient name and message')
    if (typeof content !== 'string' || content.length > 2000) return error(res, 'Message must be 2000 characters or fewer', null)

    const prisma = getPrisma()
    const recipient = await prisma.agent.findUnique({ where: { name: to.toLowerCase() } })
    if (!recipient) return error(res, 'Recipient not found', 'Check the agent name', 404)
    if (recipient.id === req.agent.id) return error(res, 'Cannot message yourself', null)

    const message = await prisma.message.create({
      data: { from_agent_id: req.agent.id, to_agent_id: recipient.id, content: content },
      include: {
        from_agent: { select: { id: true, name: true } },
        to_agent: { select: { id: true, name: true } }
      }
    })
    return success(res, { message: message }, 201)
  } catch (err) {
    next(err)
  }
}

module.exports = { listMessages, sendMessage }
