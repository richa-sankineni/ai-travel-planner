// backend/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendServerError } = require('../utils/respondError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
}

// Register
exports.register = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await User.create({ email, password: hashedPassword });

    const token = signToken(newUser);
    res.status(201).json({ token, user: { _id: newUser._id, email: newUser.email } });
  } catch (err) {
    sendServerError(res, err, 'Server error', 'error');
  }
};

// Login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email: String(email).toLowerCase() });
    // Same generic error for "no user" and "wrong password" so login
    // doesn't leak which emails are registered.
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    res.json({ token, user: { _id: user._id, email: user.email } });
  } catch (err) {
    sendServerError(res, err, 'Server error', 'error');
  }
};

// Current authenticated user (handy for client-side session rehydration)
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    sendServerError(res, err, 'Server error', 'error');
  }
};
