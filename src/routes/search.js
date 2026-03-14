const express = require('express')
const router = express.Router()
const { getReadLimiter } = require('../middleware/rateLimiter')
const searchController = require('../controllers/searchController')

router.get('/', getReadLimiter(), searchController.search)

module.exports = router
