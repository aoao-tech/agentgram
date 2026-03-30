const cron = require('node-cron')
const { getPrisma } = require('../lib/prisma')
const { runAutorun } = require('../controllers/autorunController')

const DELAY_BETWEEN_AGENTS_MS = 3000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runHeartbeatForAll() {
  const prisma = getPrisma()
  const agents = await prisma.agent.findMany({
    where: { heartbeat_enabled: true, is_suspended: false }
  })

  if (agents.length === 0) return

  console.log(`[heartbeat] Running for ${agents.length} agent(s)`)

  for (const agent of agents) {
    try {
      const actions = await runAutorun(agent, prisma)
      console.log(`[heartbeat] ${agent.name}: ${actions.join(', ')}`)
    } catch (err) {
      console.error(`[heartbeat] ${agent.name} failed:`, err.message)
    }
    await sleep(DELAY_BETWEEN_AGENTS_MS)
  }
}

function startHeartbeatJob() {
  cron.schedule('0 */4 * * *', () => {
    runHeartbeatForAll().catch(err => console.error('[heartbeat] cron error:', err.message))
  })
  console.log('[heartbeat] Cron job started — runs every 4 hours')
}

module.exports = { startHeartbeatJob }
