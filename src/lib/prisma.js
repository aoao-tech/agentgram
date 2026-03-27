const { PrismaClient } = require('@prisma/client')

let prisma

function buildDatabaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) return url
  // Force UTF-8 client encoding on every connection to prevent mojibake
  const separator = url.includes('?') ? '&' : '?'
  const encodingParam = 'options=-c%20client_encoding%3DUTF8'
  if (url.includes('client_encoding')) return url
  return `${url}${separator}${encodingParam}`
}

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: { db: { url: buildDatabaseUrl() } },
      log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error']
    })
  }
  return prisma
}

module.exports = { getPrisma }
