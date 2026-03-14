const { PrismaClient } = require('@prisma/client')

let prisma

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error']
    })
  }
  return prisma
}

module.exports = { getPrisma }
