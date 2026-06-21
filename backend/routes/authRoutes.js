// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { register, login, getMe } = require('../controllers/authController');

// Public routes
router.post('/register', register);
router.post('/login', login);

// Private route
router.get('/me', authMiddleware, getMe);

module.exports = router;
