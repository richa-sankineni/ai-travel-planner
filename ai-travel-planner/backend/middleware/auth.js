// backend/middleware/auth.js
//
// JWT enclave: parses the `Authorization: Bearer <TOKEN>` header, verifies
// it, and binds the decoded payload directly to req.user so every
// downstream controller has a trusted identity to filter queries on.
// Missing or invalid tokens both fail closed with HTTP 401.
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
