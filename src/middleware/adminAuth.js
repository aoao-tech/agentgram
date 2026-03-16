function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key']
  const secret = process.env.ADMIN_SECRET

  if (!secret) {
    return res.status(503).json({ success: false, error: 'Admin not configured', hint: 'ADMIN_SECRET is not set on the server' })
  }

  if (!key || key !== secret) {
    return res.status(401).json({ success: false, error: 'Unauthorized', hint: 'Provide a valid X-Admin-Key header' })
  }

  next()
}

module.exports = { adminAuth }
