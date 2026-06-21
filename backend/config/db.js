// backend/config/db.js
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

let mongodInstance = null;

// If someone copies .env.example to .env and forgets to actually fill in
// the MongoDB URI, this is the literal placeholder text that ends up in
// MONGO_URI. Trying to connect to it produces a confusing DNS/auth error
// far from the real problem — detect it explicitly and treat it the same
// as "unset" instead.
const isPlaceholderUri = (uri) =>
  !uri || uri.includes('<user>') || uri.includes('<password>') || uri.includes('cluster0.example.mongodb.net');

const DEFAULT_LOCAL_URI = 'mongodb://127.0.0.1:27017/traoTravelPlanner';
const DEFAULT_MEMORY_DB_PATH = path.join(__dirname, '..', '.cache', 'mongo-mem-db');

const tryLocalMongo = async () => {
  const localUri = process.env.LOCAL_MONGO_URI || DEFAULT_LOCAL_URI;
  console.log(`Attempting local MongoDB at ${localUri} as a fallback.`);
  const conn = await mongoose.connect(localUri);
  return conn;
};

const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGO_URI;

    if (isPlaceholderUri(mongoUri)) {
      if (mongoUri) {
        console.warn(
          '⚠️  MONGO_URI in your .env still looks like the unfilled template from .env.example ' +
            '(contains <user>/<password>/cluster0.example.mongodb.net). Treating it as unset.'
        );
      }

      console.log(
        'MONGO_URI not set — attempting local MongoDB first, then falling back to in-memory MongoDB for development.'
      );

      try {
        const localConn = await tryLocalMongo();
        console.log(`✅ MongoDB Connected: ${localConn.connection.host}`);
        return;
      } catch (localErr) {
        console.warn(
          '⚠️  Local MongoDB connection failed. Trying in-memory MongoDB fallback instead.'
        );
      }

      const { MongoMemoryServer } = require('mongodb-memory-server');
      try {
        if (!fs.existsSync(DEFAULT_MEMORY_DB_PATH)) {
          fs.mkdirSync(DEFAULT_MEMORY_DB_PATH, { recursive: true });
        }
        mongodInstance = await MongoMemoryServer.create({
          instance: {
            dbPath: DEFAULT_MEMORY_DB_PATH,
            storageEngine: 'wiredTiger',
            ip: '127.0.0.1'
          }
        });
        mongoUri = mongodInstance.getUri();
      } catch (memErr) {
        console.error(
          '❌ Could not start the in-memory MongoDB fallback (this usually means outbound ' +
            'access to download the MongoDB binary is blocked by a firewall/antivirus). ' +
            'Install MongoDB locally or set a real MONGO_URI in backend/.env instead.'
        );
        throw new Error(
          `Local MongoDB failed: ${memErr.message}; in-memory fallback failed: ${memErr.message}`
        );
      }
    }

    const conn = await mongoose.connect(mongoUri);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌ MongoDB Connection Error: ${err.message}`);
    throw err; // let the caller (server.js) decide what to do — don't exit mid-import
  }
};

connectDB.close = async () => {
  await mongoose.connection.close();
  if (mongodInstance) {
    await mongodInstance.stop();
  }
};

module.exports = connectDB;
