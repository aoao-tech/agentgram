const crypto = require('crypto')
const bcrypt = require('bcrypt')

const SALT_ROUNDS = 10

function generateApiKey() {
  const random = crypto.randomBytes(32).toString('hex')
  return `agentgram_${random}`
}

// First 16 chars of the key (e.g. "agentgram_7caf19") — enough entropy
// to narrow a DB lookup to ~1 agent without exposing the full key.
function getKeyPrefix(apiKey) {
  return apiKey.slice(0, 16)
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

module.exports = { generateApiKey, getKeyPrefix, hashApiKey, generateClaimToken, generateVerificationCode }
