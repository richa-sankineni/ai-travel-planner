// backend/server.js
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Fail-safe: never run with a hardcoded/predictable JWT secret. If one
// hasn't been provided via the environment, generate a random ephemeral
// secret for this process and warn loudly — tokens won't survive a
// restart, but they also won't be guessable.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn(
    '⚠️  JWT_SECRET not set — generated a random ephemeral secret for this process. ' +
      'Set JWT_SECRET in your .env for persistent sessions across restarts.'
  );
}

// The app still runs without a Gemini key — every AI endpoint has a
// deterministic fallback — but it's easy to forget to set this and then
// be confused why itineraries look generic. Warn loudly at boot so it
// shows up immediately in the server logs (and see GET /api/health,
// which also reports this).
if (!process.env.GEMINI_API_KEY) {
  console.warn(
    '⚠️  GEMINI_API_KEY not set — AI itinerary generation will use the deterministic ' +
      'fallback planner instead of calling Gemini. Get a free key at ' +
      'https://aistudio.google.com/apikey and add it to backend/.env, then restart the server. ' +
      'Run "node scripts/checkGeminiKey.js" to verify a key works.'
  );
}

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) =>
  res.json({
    status: 'ok',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    dbConnected: mongoose.connection.readyState === 1
  })
);

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/trips', require('./routes/tripRoutes'));

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// IMPORTANT: the server only starts accepting HTTP traffic *after*
// MongoDB has actually finished connecting. Previously connectDB() was
// fired without awaiting it, so Express could start handling requests
// (including register/login, which hit the DB immediately) while the
// connection was still establishing — or had silently failed — in the
// background. That race produced exactly this symptom: a generic 500
// "Server error" on the very first request after boot, with no clear
// link back to the DB. Awaiting it here means the process either starts
// fully ready, or exits immediately with a clear reason instead of
// serving requests it can't actually fulfill.
async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('❌ Could not start the server — MongoDB connection failed at boot.');
    process.exit(1);
  }

  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

start();

module.exports = app;
