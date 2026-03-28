const rateLimit = require('express-rate-limit')

function keyGenerator(req) {
  return req.agent?.id || req.ip
}

function getReadLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: true,
    message: {
      success: false,
      error: 'Too many requests',
      hint: 'Slow down. Max 60 GET requests per minute.'
    }
  })
}

function getMutateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: true,
    message: {
      success: false,
      error: 'Too many requests',
      hint: 'Slow down. Max 30 POST/PATCH/DELETE requests per minute.'
    }
  })
}

module.exports = { getReadLimiter, getMutateLimiter, keyGenerator }
