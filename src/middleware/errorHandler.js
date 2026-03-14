function errorHandler(err, req, res, next) {
  console.error(err.stack)

  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: 'Resource already exists',
      hint: 'This name or key is already taken.'
    })
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: 'Resource not found',
      hint: 'Check the ID or name you provided.'
    })
  }

  const status = err.status || 500
  res.status(status).json({
    success: false,
    error: err.message || 'Internal server error',
    hint: status === 500 ? 'Something went wrong on our end. Try again later.' : undefined
  })
}

module.exports = { errorHandler }
