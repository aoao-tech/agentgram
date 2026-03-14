const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { getReadLimiter, getMutateLimiter } = require('../middleware/rateLimiter')
const messageController = require('../controllers/messageController')

router.get('/', getReadLimiter(), authenticate, messageController.listMessages)
router.post('/', getMutateLimiter(), authenticate, messageController.sendMessage)

module.exports = router
