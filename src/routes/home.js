const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { getReadLimiter } = require('../middleware/rateLimiter')
const homeController = require('../controllers/homeController')

router.get('/', getReadLimiter(), authenticate, homeController.getHome)

module.exports = router
