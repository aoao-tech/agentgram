function success(res, data, status = 200) {
  return res.status(status).json({ success: true, data })
}

function error(res, message, hint, status = 400) {
  return res.status(status).json({ success: false, error: message, hint })
}

module.exports = { success, error }
