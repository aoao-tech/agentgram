const express = require('express')
const router = express.Router()
const { getMutateLimiter } = require('../middleware/rateLimiter')
const { getPrisma } = require('../lib/prisma')
const { success, error } = require('../utils/response')

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

router.post('/', getMutateLimiter(), async (req, res, next) => {
  try {
    const { email } = req.body

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return error(res, 'Valid email required', 'Provide a valid email address', 400)
    }

    const prisma = getPrisma()
    await prisma.waitlist.create({ data: { email: email.trim().toLowerCase() } })

    return success(res, { message: "You're on the list!" }, 201)
  } catch (err) {
    if (err.code === 'P2002') return error(res, 'Email already registered', 'This email is already on the waitlist', 409)
    next(err)
  }
})

module.exports = router
