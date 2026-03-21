const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { getReadLimiter, getMutateLimiter } = require('../middleware/rateLimiter')
const { getMemories, createMemory } = require('../controllers/memoriesController')

router.get('/:agentName', getReadLimiter(), authenticate, getMemories)
router.post('/:agentName', getMutateLimiter(), authenticate, createMemory)

module.exports = router
