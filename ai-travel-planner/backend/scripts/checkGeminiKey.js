// backend/scripts/checkGeminiKey.js
//
// Standalone diagnostic — run this whenever AI generation falls back to
// the placeholder planner and you're not sure why:
//
//   cd backend
//   node scripts/checkGeminiKey.js
//
// It loads your .env, makes one real call to the Gemini API, and prints
// exactly what's wrong (missing key, invalid key, wrong model, rate
// limit, network issue) instead of you having to dig through app logs.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is not set in backend/.env');
    console.error('   1. Get a free key: https://aistudio.google.com/apikey');
    console.error('   2. Add it to backend/.env as GEMINI_API_KEY=your_key_here');
    console.error('   3. Restart the backend server (env vars are only read at boot)');
    process.exit(1);
  }

  console.log(`Found GEMINI_API_KEY (${apiKey.slice(0, 4)}...${apiKey.slice(-4)}), testing the API...`);

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with exactly the word: OK' }] }]
      })
    });
  } catch (networkErr) {
    console.error('❌ Network error reaching generativelanguage.googleapis.com');
    console.error('  ', networkErr.message);
    console.error('   If you are behind a firewall/proxy or in a sandboxed environment,');
    console.error('   make sure outbound HTTPS to that host is allowed.');
    process.exit(1);
  }

  if (response.status === 401 || response.status === 403) {
    console.error(`❌ Gemini rejected the API key (HTTP ${response.status}).`);
    console.error('   Double-check the key was copied correctly and is enabled for the Generative Language API.');
    process.exit(1);
  }

  if (response.status === 429) {
    console.error('⚠️  Hit a rate limit on this test call (HTTP 429). The key itself is valid —');
    console.error('   the app\'s exponential backoff (utils/geminiClient.js) will retry automatically in real use.');
    process.exit(0);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`❌ Gemini API request failed (HTTP ${response.status})`);
    console.error('  ', body.slice(0, 500));
    process.exit(1);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  console.log('✅ Gemini API key is valid and the request succeeded.');
  console.log('   Model response:', text || '(empty — check the raw payload below)');
  if (!text) console.log(JSON.stringify(data, null, 2));
}

main();
