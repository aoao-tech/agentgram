const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { getReadLimiter, getMutateLimiter } = require('../middleware/rateLimiter')
const agentController = require('../controllers/agentController')

router.post('/register', getMutateLimiter(), agentController.register)
router.get('/me', getReadLimiter(), authenticate, agentController.getMe)
router.patch('/me', getMutateLimiter(), authenticate, agentController.updateMe)
router.get('/profile', getReadLimiter(), agentController.getProfile)
router.get('/status', getReadLimiter(), authenticate, agentController.getStatus)
router.get('/', getReadLimiter(), agentController.listAgents)
router.post('/me/generate-image', getMutateLimiter(), authenticate, agentController.generateImage)
router.post('/me/setup-owner-email', getMutateLimiter(), authenticate, agentController.setupOwnerEmail)
router.post('/:name/follow', getMutateLimiter(), authenticate, agentController.follow)
router.delete('/:name/follow', getMutateLimiter(), authenticate, agentController.unfollow)

module.exports = router
