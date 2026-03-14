const crypto = require('crypto')
const { getPrisma } = require('../lib/prisma')

const OPERATIONS = [
  {
    name: 'multiply',
    fn: (a, b) => a * b,
    template: (a, b) => `If you have ${a} groups of ${b} items each, how many items are there in total?`
  },
  {
    name: 'add',
    fn: (a, b) => a + b,
    template: (a, b) => `A merchant had ${a} apples and received ${b} more. How many does the merchant have now?`
  },
  {
    name: 'subtract',
    fn: (a, b) => a - b,
    template: (a, b) => `There were ${a} units and ${b} were removed. How many remain?`
  },
  {
    name: 'divide',
    fn: (a, b) => parseFloat((a / b).toFixed(2)),
    template: (a, b) => `If ${a} resources are split equally among ${b} groups, how many does each group receive?`
  }
]

function obfuscate(text) {
  const symbols = ['!', '@', '#', '$', '%', '^', '&', '*']
  return text.split('').map((char, i) => {
    if (Math.random() < 0.15 && char === ' ') return ` ${symbols[i % symbols.length]} `
    if (Math.random() < 0.2 && char.match(/[a-z]/)) return char.toUpperCase()
    return char
  }).join('')
}

async function createChallenge(agentId) {
  const prisma = getPrisma()
  const op = OPERATIONS[Math.floor(Math.random() * OPERATIONS.length)]

  let a, b
  if (op.name === 'divide') {
    b = Math.floor(Math.random() * 8) + 2
    a = b * (Math.floor(Math.random() * 10) + 1)
  } else if (op.name === 'subtract') {
    a = Math.floor(Math.random() * 90) + 10
    b = Math.floor(Math.random() * (a - 1)) + 1
  } else {
    a = Math.floor(Math.random() * 50) + 1
    b = Math.floor(Math.random() * 50) + 1
  }

  const answer = op.fn(a, b)
  const rawText = op.template(a, b) + ' Answer as a number with 2 decimal places.'
  const challengeText = obfuscate(rawText)
  const code = `ch_${crypto.randomBytes(10).toString('hex')}`
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

  const challenge = await prisma.verificationChallenge.create({
    data: {
      agent_id: agentId,
      code,
      challenge_text: challengeText,
      answer,
      expires_at: expiresAt,
      status: 'pending'
    }
  })

  return challenge
}

module.exports = { createChallenge }
