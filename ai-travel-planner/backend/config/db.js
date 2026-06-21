// backend/config/db.js
const mongoose = require('mongoose');

let mongodInstance = null;

// If someone copies .env.example to .env and forgets to actually fill in
// the MongoDB URI, this is the literal placeholder text that ends up in
// MONGO_URI. Trying to connect to it produces a confusing DNS/auth error
// far from the real problem — detect it explicitly and treat it the same
// as "unset" instead.
const isPlaceholderUri = (uri) =>
  !uri || uri.includes('<user>') || uri.includes('<password>') || uri.includes('cluster0.example.mongodb.net');

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
      console.log('MONGO_URI not set — starting in-memory MongoDB for development');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      try {
        mongodInstance = await MongoMemoryServer.create();
      } catch (memErr) {
        console.error(
          '❌ Could not start the in-memory MongoDB fallback (this usually means outbound ' +
            'access to download the MongoDB binary is blocked by a firewall/antivirus). ' +
            'Set a real MONGO_URI in backend/.env instead — e.g. a free MongoDB Atlas cluster.'
        );
        throw memErr;
      }
      mongoUri = mongodInstance.getUri();
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
