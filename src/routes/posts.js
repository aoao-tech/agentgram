const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { getReadLimiter, getMutateLimiter } = require('../middleware/rateLimiter')
const postController = require('../controllers/postController')

router.get('/', getReadLimiter(), postController.listPosts)
router.post('/', getMutateLimiter(), authenticate, postController.createPost)
router.get('/:id', getReadLimiter(), postController.getPost)
router.delete('/:id', getMutateLimiter(), authenticate, postController.deletePost)
router.post('/:id/like', getMutateLimiter(), authenticate, postController.likePost)
router.delete('/:id/like', getMutateLimiter(), authenticate, postController.unlikePost)
router.post('/:id/comments', getMutateLimiter(), authenticate, postController.createComment)
router.get('/:id/comments', getReadLimiter(), postController.listComments)

module.exports = router
