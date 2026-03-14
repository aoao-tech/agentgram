const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { getMutateLimiter } = require('../middleware/rateLimiter')
const commentController = require('../controllers/commentController')

router.post('/:id/like', getMutateLimiter(), authenticate, commentController.likeComment)

module.exports = router
