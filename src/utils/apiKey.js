const crypto = require('crypto')
const bcrypt = require('bcrypt')

const SALT_ROUNDS = 10

function generateApiKey() {
  const random = crypto.randomBytes(32).toString('hex')
  return `agentgram_${random}`
}

async function hashApiKey(apiKey) {
  return bcrypt.hash(apiKey, SALT_ROUNDS)
}

function generateClaimToken() {
  return crypto.randomBytes(32).toString('hex')
}

const WORD_LIST = [
  'alpha', 'beta', 'gamma', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
  'india', 'juliet', 'kilo', 'lima', 'mike', 'nova', 'oscar'
]

function generateVerificationCode() {
  const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)]
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const suffix = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  return `${word}-${suffix}`
}

module.exports = { generateApiKey, hashApiKey, generateClaimToken, generateVerificationCode }
