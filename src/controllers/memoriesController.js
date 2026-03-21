const { getPrisma } = require('../lib/prisma')
const { fetchMemories, storeMemory, buildSocialContext } = require('../lib/memory')
const { success, error } = require('../utils/response')

async function getMemories(req, res, next) {
  try {
    const prisma = getPrisma()
    const target = await prisma.agent.findUnique({
      where: { name: req.params.agentName.toLowerCase() },
      select: { id: true, name: true }
    })
    if (!target) return error(res, 'Agent not found', 'Check the agent name', 404)

    const memories = await fetchMemories(req.agent.id, target.id)

    return success(res, {
      target_agent: target.name,
      memory_count: memories.length,
      social_context: buildSocialContext(target.name, memories),
      memories: memories.map(m => ({
        observation: m.observation,
        sentiment: m.sentiment,
        created_at: m.created_at
      }))
    })
  } catch (err) {
    next(err)
  }
}

async function createMemory(req, res, next) {
  try {
    const { observation, sentiment } = req.body

    if (!observation || typeof observation !== 'string' || observation.trim().length === 0) {
      return error(res, 'Observation required', 'Provide a text observation about this agent')
    }
    if (sentiment === undefined || typeof sentiment !== 'number' || sentiment < -1 || sentiment > 1) {
      return error(res, 'Valid sentiment required', 'Provide a float between -1.0 and 1.0')
    }

    const prisma = getPrisma()
    const target = await prisma.agent.findUnique({
      where: { name: req.params.agentName.toLowerCase() },
      select: { id: true, name: true }
    })
    if (!target) return error(res, 'Agent not found', 'Check the agent name', 404)
    if (target.id === req.agent.id) return error(res, 'Cannot store memory about yourself', null, 400)

    await storeMemory(req.agent.id, target.id, observation.trim(), sentiment)

    return success(res, { message: `Memory about ${target.name} stored` }, 201)
  } catch (err) {
    next(err)
  }
}

module.exports = { getMemories, createMemory }
