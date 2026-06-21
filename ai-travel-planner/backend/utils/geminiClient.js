// backend/utils/geminiClient.js
//
// Centralizes all communication with the Gemini 2.5 Flash API:
//   - Forces strict, minified JSON-only responses (no prose, no markdown
//     fences) via both the system prompt AND responseMimeType.
//   - Wraps every call in an exponential backoff retry helper that
//     specifically targets HTTP 429 rate-limit responses (1s -> 2s -> 4s
//     -> 8s -> 16s, 5 attempts) before failing gracefully so the caller
//     can fall back to a deterministic default plan.
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const JSON_ENFORCEMENT_RULES = `You are a JSON API, not a chat assistant. Output rules (non-negotiable):
- Respond with ONLY raw, minified JSON. No prose, no explanations, no apologies.
- Do NOT wrap the JSON in markdown code fences (no \`\`\`json, no \`\`\`).
- Do NOT include any text before or after the JSON object.
- The JSON must match the exact structure requested below, with no extra keys.`;

async function callGeminiWithBackoff(payload, attempt = 0) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'NO_API_KEY';
    throw err;
  }

  // Google's current guidance is the x-goog-api-key header rather than the
  // legacy ?key= query parameter — the query param still works for
  // backward compatibility, but the header keeps the key out of server
  // logs / URLs and matches what the official docs show today.
  let response;

  try {
    response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });
  } catch (networkErr) {
    // Connection-level failure (DNS, timeout, reset) — treat as transient
    // and retry on the same backoff schedule as a rate limit.
    if (attempt < MAX_RETRIES) {
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
      return callGeminiWithBackoff(payload, attempt + 1);
    }
    throw networkErr;
  }

  if (response.status === 429) {
    if (attempt < MAX_RETRIES) {
      // 1s -> 2s -> 4s -> 8s -> 16s
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
      return callGeminiWithBackoff(payload, attempt + 1);
    }
    const err = new Error('Gemini API rate limit exceeded after 5 retries');
    err.code = 'RATE_LIMIT_EXCEEDED';
    throw err;
  }

  if (!response.ok) {
    // Any other non-2xx (400/401/403/500...) fails fast instead of being
    // silently retried — retrying a malformed request 5 times just delays
    // the inevitable failure and hides the real error.
    const body = await response.text().catch(() => '');
    const err = new Error(`Gemini API request failed (${response.status}): ${body.slice(0, 300)}`);
    err.code = 'GEMINI_API_ERROR';
    err.status = response.status;
    throw err;
  }

  return response.json();
}

function extractJSON(rawText) {
  if (!rawText) return null;
  let cleaned = rawText.trim();
  // Defensive strip in case the model still wraps the output in fences
  // despite the system prompt + responseMimeType instructing it not to.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function generateTripPlan({ destination, durationDays, budgetTier, interests = [] }) {
  const prompt = `${JSON_ENFORCEMENT_RULES}

Create a ${durationDays}-day travel itinerary for ${destination}.
Budget tier: ${budgetTier}.
Traveler interests: ${Array.isArray(interests) && interests.length ? interests.join(', ') : 'general sightseeing'}.

Return ONLY minified JSON matching exactly this shape:
{"itinerary":[{"dayNumber":1,"activities":[{"title":"","description":"","estimatedCostUSD":0,"timeOfDay":"Morning"}]}],"hotels":[{"name":"","tier":"","estimatedCostNightUSD":0,"rating":""}],"estimatedBudget":{"transport":0,"accommodation":0,"food":0,"activities":0,"total":0},"packingList":[{"item":"","category":"Documents","isPacked":false}]}

Rules:
- itinerary must contain exactly ${durationDays} day objects, dayNumber 1 through ${durationDays}.
- timeOfDay must be one of: Morning, Afternoon, Evening.
- category in packingList must be one of: Documents, Clothing, Gear, Other.
- All cost figures must be realistic numbers for the ${budgetTier} budget tier in ${destination}.
- estimatedBudget.total must equal the sum of transport + accommodation + food + activities.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
  };

  const data = await callGeminiWithBackoff(payload);
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return extractJSON(rawText);
}

async function regenerateDayActivities({ destination, budgetTier, dayNumber, totalDays, rewriteText }) {
  const prompt = `${JSON_ENFORCEMENT_RULES}

This is day ${dayNumber} of ${totalDays} of an existing ${budgetTier}-budget trip to ${destination}.
The traveler wants this single day rewritten with this note: "${rewriteText || 'make it more interesting'}".

Return ONLY a minified JSON array (not an object) of activities for just this one day, matching exactly:
[{"title":"","description":"","estimatedCostUSD":0,"timeOfDay":"Morning"}]

Rules:
- Return 2 to 5 activities.
- timeOfDay must be one of: Morning, Afternoon, Evening.
- Costs must be realistic for the ${budgetTier} budget tier in ${destination}.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.8 }
  };

  const data = await callGeminiWithBackoff(payload);
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return extractJSON(rawText);
}

module.exports = { generateTripPlan, regenerateDayActivities, extractJSON };
