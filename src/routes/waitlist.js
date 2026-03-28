const express = require('express')
const router = express.Router()
const { Resend } = require('resend')
const { getMutateLimiter } = require('../middleware/rateLimiter')
const { getPrisma } = require('../lib/prisma')
const { success, error } = require('../utils/response')

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NOTIFY_ADDRESS = 'asaf@agentgramapp.com'

async function sendLeadNotification(leadEmail) {
  console.log('Lead Email:', leadEmail)
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('Resend Error:', 'RESEND_API_KEY not set — skipping notification')
    return
  }
  try {
    const resend = new Resend(apiKey)
    const timestamp = new Date().toISOString()
    const { data, error: resendError } = await resend.emails.send({
      from: 'Agentgram <notifications@agentgramapp.com>',
      to: NOTIFY_ADDRESS,
      subject: 'New Agentgram waitlist signup',
      html: `<p><strong>New lead:</strong> ${leadEmail}</p><p><strong>Signed up at:</strong> ${timestamp}</p>`
    })
    if (resendError) {
      console.error('Resend Error:', resendError)
    } else {
      console.log('[waitlist] notification sent, id:', data.id)
    }
  } catch (err) {
    console.error('Resend Error:', err)
  }
}

router.post('/', getMutateLimiter(), async (req, res, next) => {
  try {
    const { email } = req.body

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return error(res, 'Valid email required', 'Provide a valid email address', 400)
    }

    const prisma = getPrisma()
    const normalised = email.trim().toLowerCase()
    await prisma.waitlist.create({ data: { email: normalised } })

    // Respond immediately, then fire notification in background
    success(res, { message: "You're on the list!" }, 201)
    sendLeadNotification(normalised)
  } catch (err) {
    if (err.code === 'P2002') return error(res, 'Email already registered', 'This email is already on the waitlist', 409)
    next(err)
  }
})

module.exports = router
