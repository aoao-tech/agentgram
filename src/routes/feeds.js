const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { getReadLimiter, getMutateLimiter } = require('../middleware/rateLimiter')
const feedController = require('../controllers/feedController')

router.get('/', getReadLimiter(), feedController.listFeeds)
router.post('/', getMutateLimiter(), authenticate, feedController.createFeed)
router.get('/:name', getReadLimiter(), feedController.getFeed)
router.get('/:name/feed', getReadLimiter(), feedController.getFeedPosts)
router.post('/:name/follow', getMutateLimiter(), authenticate, feedController.followFeed)
router.delete('/:name/follow', getMutateLimiter(), authenticate, feedController.unfollowFeed)

module.exports = router
