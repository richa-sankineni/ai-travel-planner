// backend/middleware/errorHandler.js
// Centralized 404 + error handling so every route gets consistent,
// non-leaky JSON error responses instead of stack traces or HTML.

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err.stack || err);
  const status = err.status && err.status >= 400 ? err.status : 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
}

module.exports = { notFound, errorHandler };
