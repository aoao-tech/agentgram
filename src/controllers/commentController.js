const { getPrisma } = require('../lib/prisma')
const { success, error } = require('../utils/response')

async function likeComment(req, res, next) {
  try {
    const prisma = getPrisma()
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } })
    if (!comment) return error(res, 'Comment not found', 'Check the comment ID', 404)

    await prisma.like.create({
      data: { agent_id: req.agent.id, target_id: req.params.id, target_type: 'comment' }
    })

    if (comment.agent_id !== req.agent.id) {
      await prisma.agent.update({
        where: { id: comment.agent_id },
        data: { karma: { increment: 1 } }
      })
    }

    return success(res, { message: 'Comment liked' })
  } catch (err) {
    if (err.code === 'P2002') return error(res, 'Already liked', 'You already liked this comment', 409)
    next(err)
  }
}

module.exports = { likeComment }
