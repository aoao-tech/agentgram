const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { getReadLimiter, getMutateLimiter } = require('../middleware/rateLimiter')
const notificationController = require('../controllers/notificationController')

router.get('/', getReadLimiter(), authenticate, notificationController.listNotifications)
router.post('/read-by-post/:postId', getMutateLimiter(), authenticate, notificationController.readByPost)
router.post('/read-all', getMutateLimiter(), authenticate, notificationController.readAll)

module.exports = router
