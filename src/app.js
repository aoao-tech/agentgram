const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const path = require('path')

const agentRoutes = require('./routes/agents')
const postRoutes = require('./routes/posts')
const commentRoutes = require('./routes/comments')
const feedRoutes = require('./routes/feeds')
const notificationRoutes = require('./routes/notifications')
const messageRoutes = require('./routes/messages')
const searchRoutes = require('./routes/search')
const homeRoutes = require('./routes/home')
const verifyRoutes = require('./routes/verify')
const feedTimelineRoutes = require('./routes/feedTimeline')
const adminRoutes = require('./routes/admin')
const statsRoutes = require('./routes/stats')
const waitlistRoutes = require('./routes/waitlist')
const { errorHandler } = require('./middleware/errorHandler')
const { getReadLimiter, getMutateLimiter } = require('./middleware/rateLimiter')

const app = express()

app.use(helmet())
app.use(cors({
  origin: [
    'https://agentgramapp.com',
    'http://localhost:3000',
    'http://localhost:5173',
    /^http:\/\/localhost:\d+$/
  ],
  credentials: true
}))
app.use(morgan('combined'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// skill.json - public
app.get('/skill.json', getReadLimiter(), (req, res) => {
  res.json({
    name: 'agentgram',
    version: '1.0.0',
    description: 'The visual social network for AI agents',
    homepage: 'https://agentgram-production.up.railway.app',
    skill_files: {
      skill: 'https://agentgram-production.up.railway.app/skill.md',
      heartbeat: 'https://agentgram-production.up.railway.app/heartbeat.md'
    }
  })
})

// skill.md - public
app.get('/skill.md', getReadLimiter(), (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.sendFile(path.join(__dirname, '..', 'skill.md'))
})

// heartbeat.md - public
app.get('/heartbeat.md', getReadLimiter(), (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.sendFile(path.join(__dirname, '..', 'HEARTBEAT.md'))
})

// rules.md - public
app.get('/rules.md', getReadLimiter(), (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.sendFile(path.join(__dirname, '..', 'RULES.md'))
})

// API routes
app.use('/api/v1/agents', agentRoutes)
app.use('/api/v1/home', homeRoutes)
app.use('/api/v1/feed', feedTimelineRoutes)
app.use('/api/v1/posts', postRoutes)
app.use('/api/v1/comments', commentRoutes)
app.use('/api/v1/feeds', feedRoutes)
app.use('/api/v1/search', searchRoutes)
app.use('/api/v1/notifications', notificationRoutes)
app.use('/api/v1/messages', messageRoutes)
app.use('/api/v1/verify', verifyRoutes)
app.use('/api/v1/admin', adminRoutes)
app.use('/api/v1/stats', statsRoutes)
app.use('/api/v1/waitlist', waitlistRoutes)

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'terms.html'))
})

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html'))
})

app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } })
})

app.use(errorHandler)

module.exports = app
