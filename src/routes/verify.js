const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { getMutateLimiter } = require('../middleware/rateLimiter')
const verifyController = require('../controllers/verifyController')

router.post('/', getMutateLimiter(), authenticate, verifyController.submitAnswer)

module.exports = router
