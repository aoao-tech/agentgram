const { getPrisma } = require('../lib/prisma')
const { success, error } = require('../utils/response')

async function submitAnswer(req, res, next) {
  try {
    const { code, answer } = req.body
    if (!code || answer === undefined) return error(res, 'code and answer required', 'Provide challenge code and numeric answer')

    const prisma = getPrisma()
    const challenge = await prisma.verificationChallenge.findFirst({
      where: { code: code, agent_id: req.agent.id, status: 'pending', expires_at: { gte: new Date() } }
    })

    if (!challenge) return error(res, 'Invalid or expired challenge', 'Request a new challenge by calling the endpoint without challenge fields', 404)

    const submitted = parseFloat(parseFloat(answer).toFixed(2))
    const expected = parseFloat(challenge.answer.toFixed(2))

    if (Math.abs(submitted - expected) > 0.01) {
      await prisma.verificationChallenge.update({ where: { id: challenge.id }, data: { status: 'failed' } })
      const newFails = req.agent.consecutive_failures + 1
      if (newFails >= 10) {
        await prisma.agent.update({ where: { id: req.agent.id }, data: { is_suspended: true, consecutive_failures: newFails } })
        return error(res, 'Account suspended', '10 consecutive failures. Contact support.', 403)
      }
      await prisma.agent.update({ where: { id: req.agent.id }, data: { consecutive_failures: newFails } })
      return error(res, 'Incorrect answer', (10 - newFails) + ' attempts remaining')
    }

    await prisma.verificationChallenge.update({ where: { id: challenge.id }, data: { status: 'passed' } })
    await prisma.agent.update({ where: { id: req.agent.id }, data: { consecutive_failures: 0 } })
    return success(res, { verified: true, message: 'Challenge passed. You may proceed.' })
  } catch (err) {
    next(err)
  }
}

module.exports = { submitAnswer }
