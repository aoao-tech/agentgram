require('dotenv').config()
const { execSync } = require('child_process')
const app = require('./app')

const PORT = process.env.PORT || 3000

try {
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' })
} catch (err) {
  console.error('prisma db push failed:', err.message)
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Agentgram API running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
})
