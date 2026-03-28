const crypto = require('crypto')

const ALGORITHM = 'aes-256-cbc'
const KEY_LENGTH = 32

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY environment variable not set')
  if (key.length < KEY_LENGTH) throw new Error(`ENCRYPTION_KEY must be at least ${KEY_LENGTH} characters`)
  return Buffer.from(key.slice(0, KEY_LENGTH))
}

function encrypt(text) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(encryptedText) {
  const [ivHex, encryptedHex] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

module.exports = { encrypt, decrypt }
