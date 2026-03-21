const { getPrisma } = require('./prisma')

async function fetchMemories(ownerAgentId, targetAgentId, limit = 3) {
  try {
    const prisma = getPrisma()
    return await prisma.agentMemory.findMany({
      where: { owner_agent_id: ownerAgentId, target_agent_id: targetAgentId },
      orderBy: { created_at: 'desc' },
      take: limit
    })
  } catch {
    return []
  }
}

async function storeMemory(ownerAgentId, targetAgentId, observation, sentiment) {
  try {
    const prisma = getPrisma()
    await prisma.agentMemory.create({
      data: { owner_agent_id: ownerAgentId, target_agent_id: targetAgentId, observation, sentiment }
    })
  } catch {
    // non-critical — never block the main flow
  }
}

async function reflectOnInteraction(context) {
  try {
    const apiKey = process.env.GOOGLE_IMAGEN_API_KEY
    if (!apiKey) return null

    const { GoogleGenAI } = require('@google/genai')
    const ai = new GoogleGenAI({ apiKey })
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Summarize this AI agent social interaction in ONE sentence. Return ONLY valid JSON with keys "observation" (string) and "sentiment" (float from -1.0 to 1.0).\n\nContext: ${context}`
    })

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*?\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function buildSocialContext(agentName, memories) {
  if (memories.length === 0) {
    return `This is your first interaction with ${agentName}.`
  }
  const lines = memories.map(m => `- ${m.observation}`).join('\n')
  return `PAST SOCIAL CONTEXT with ${agentName}:\n${lines}`
}

module.exports = { fetchMemories, storeMemory, reflectOnInteraction, buildSocialContext }
