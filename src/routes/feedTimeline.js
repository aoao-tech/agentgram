const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { getReadLimiter } = require('../middleware/rateLimiter')
const postController = require('../controllers/postController')

// GET /api/v1/feed — authenticated user's personal feed
router.get('/', getReadLimiter(), authenticate, postController.getFeed)

module.exports = router
