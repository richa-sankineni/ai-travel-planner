# Trao — AI Travel Planner

A multi-user travel planner where an LLM agent (Gemini 2.5 Flash) generates
structured day-by-day itineraries and budget estimates, which users can then
edit, regenerate, and pack for — with strict per-user data isolation.

Monorepo: `backend/` (Node.js + Express + Mongoose) and `frontend/`
(Next.js 14 App Router + Tailwind CSS).

---

## Tech stack & why

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind | Matches the brief's preferred stack. App Router gives file-based routing with real server/client component separation, which keeps auth-gated pages (`dashboard`) simple as client components while the landing page stays a server component. |
| Backend | Node.js + Express | Matches the brief's preferred stack; minimal, well-understood, easy to reason about for a focused review. |
| Database | MongoDB + Mongoose | Matches the brief; the trip document (itinerary/hotels/budget/packing list all nested) maps naturally onto a single Mongo document rather than a normalized relational schema. |
| AI | Gemini 2.5 Flash (REST, `generateContent`) | Specified by the project's reference guide. Called directly via `fetch` rather than the SDK, to keep the resiliency wrapper (retries, JSON-forcing, fallback) fully visible and auditable in one file (`utils/geminiClient.js`). |
| Auth | JWT (HS256), bcrypt password hashing | Stateless auth is enough for this scope and keeps the API horizontally scalable without a session store. |

No part of the suggested stack was changed.

---

## Setup — local

### Backend

```bash
cd backend
cp .env.example .env   # fill in MONGO_URI, JWT_SECRET, GEMINI_API_KEY
npm install
npm run dev             # http://localhost:5000
```

If `MONGO_URI` is left blank, an in-memory MongoDB instance starts
automatically for local development (data does not persist across restarts —
set a real `MONGO_URI` for anything you want to keep).

### Frontend

```bash
cd frontend
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL
npm install
npm run dev             # http://localhost:3000
```

### Getting AI generation working (`GEMINI_API_KEY`)

The app **runs without a Gemini key** — every AI endpoint has a deterministic
fallback planner so the app never hard-fails a request — but itineraries will
look generic ("Arrival and local orientation" placeholders) until a key is
set. If you saw `GEMINI_API_KEY is not configured` in the server logs, that's
why.

1. Get a free key from **[Google AI Studio](https://aistudio.google.com/apikey)**.
2. Add it to `backend/.env`:
   ```
   GEMINI_API_KEY=your_key_here
   ```
3. Restart the backend (env vars are only read at boot).
4. Verify it actually works, independent of the rest of the app:
   ```bash
   cd backend
   node scripts/checkGeminiKey.js
   ```
   This makes one real call to Gemini and tells you exactly what's wrong —
   missing key, invalid key, wrong model, rate limit, or a network/firewall
   issue — instead of you digging through app logs.
5. The dashboard also shows a banner ("⚠️ AI engine not configured…") at the
   top of the page whenever `GET /api/health` reports `aiConfigured: false`,
   so misconfiguration is visible in the UI, not just the server console.

## Setup — deployed

Same two services, deployed separately:

- **Backend**: any Node host (Render, Railway, Fly.io, a VM, etc.). Set
  `MONGO_URI` (a real Atlas cluster — not the in-memory fallback),
  `JWT_SECRET`, `GEMINI_API_KEY`, and `CLIENT_URL` (your deployed frontend
  origin, so CORS isn't wide open) as environment variables on the host.
  Never commit `.env`.
- **Frontend**: Vercel (or any Next.js host). Set `NEXT_PUBLIC_API_URL` to
  the deployed backend's URL.
- All secrets live in the hosting platform's environment variable UI, never
  in the repo — `.env` and `.env.local` are both git-ignored.

---

## Architecture

```
frontend (Next.js)            backend (Express)              MongoDB
┌─────────────────┐  HTTPS    ┌──────────────────┐  Mongoose  ┌────────┐
│ app/ (routes)    │ ───────▶ │ routes/           │ ─────────▶ │ users  │
│ components/      │  JWT in  │ middleware/auth.js│            │ trips  │
│ utils/api.ts ────┼─Bearer──▶│ controllers/      │            └────────┘
│ (axios + token)  │  header  │ utils/geminiClient│
└─────────────────┘           └────────┬─────────┘
                                        │ HTTPS (x-goog-api-key)
                                        ▼
                              Gemini 2.5 Flash API
```

- **`utils/api.ts`** is the single point of contact with the backend — every
  component imports typed helpers from it instead of building URLs/fetch
  calls inline.
- **`controllers/tripController.js`** is the single point of contact with
  MongoDB for trip data — every handler funnels through `getOwnedTrip()` so
  tenant isolation can't be bypassed by a controller forgetting a `userId`
  filter.
- **`utils/geminiClient.js`** is the single point of contact with the AI
  provider — retries, JSON enforcement, and error classification live there
  once, not duplicated per call site.

### Auth design

- Registration hashes the password with bcrypt (cost factor 12) and issues a
  JWT (`{ id, email }`, 7-day expiry) signed with `JWT_SECRET`.
- The token is stored in `localStorage` on the client and attached as
  `Authorization: Bearer <token>` by an axios request interceptor
  (`utils/api.ts`) — components never touch the token directly.
- `middleware/auth.js` is mounted on every `/api/trips/*` route. It verifies
  the token and binds the decoded payload to `req.user`; missing or invalid
  tokens both return 401 (not a mix of 401/403, which would leak which case
  occurred).
- If `JWT_SECRET` isn't set, the server generates a random ephemeral secret
  at boot rather than falling back to a hardcoded default — tokens won't
  survive a restart in that mode, but they also can't be forged by reading
  the source code.

### Data isolation design

Every trip-scoped query — read, update, delete, add/remove activity,
regenerate a day, packing list — goes through one helper:

```js
async function getOwnedTrip(tripId, userId) {
  if (!isValidId(tripId)) return null;
  return Trip.findOne({ _id: tripId, userId });
}
```

A trip ID alone is never sufficient to read or mutate a record; the query
itself enforces ownership. If the trip doesn't exist *or* belongs to a
different user, the handler returns a generic 404 either way, so trip
existence isn't leaked to non-owners by a 403-vs-404 distinction.

### AI design

- `generateTripPlan()` and `regenerateDayActivities()` (in
  `utils/geminiClient.js`) build a system prompt that forces strict,
  minified JSON output (no prose, no markdown fences), set
  `responseMimeType: "application/json"`, and defensively strip any fences
  the model adds anyway before `JSON.parse`.
- `callGeminiWithBackoff()` retries **only** on HTTP 429, with exponential
  backoff (1s → 2s → 4s → 8s → 16s, 5 attempts). Other 4xx/5xx responses fail
  immediately instead of being retried — retrying a malformed request five
  times just delays the real error.
- Every AI call path has a deterministic fallback (`buildFallbackTrip()` for
  generation, a placeholder activity for single-day regeneration) so a
  missing key, exhausted retries, or unparseable output never 500s the
  request — the user gets a usable (if generic) result plus a visible
  `aiError` explaining why, surfaced as a banner in the UI.
- Single Day Regeneration patches only the targeted day's `activities` array
  inside the trip document and recalculates just the `activities` portion
  of the budget ledger (`utils/budget.js`) — it doesn't touch the rest of
  the itinerary or re-roll the whole trip.

---

## Features implemented

- Email/password auth, JWT-protected API, per-user dashboards.
- Trip input form: destination, duration, budget tier, interests.
- AI itinerary generator (day-by-day, Gemini 2.5 Flash) + budget estimator
  (transport, accommodation, food, activities, total).
- Edit operations: add activity, remove activity, regenerate a single day
  with free-text AI instructions (e.g. "more outdoor activities").
- **Creative feature**: an AI-seeded, weather/season-aware packing checklist
  per trip, with real-time checkbox persistence. Problem it solves: generic
  "pack a passport and a charger" lists don't account for climate — picking
  a season tailors the list (insulated jacket for winter, sunscreen for
  summer, an umbrella for monsoon) so travelers don't show up underdressed
  or overpacked.

## Known limitations

- The packing-list generator is season-keyword-based rather than pulling a
  live weather forecast for the destination's actual travel dates — a real
  forecast API would be the natural next step.
- No password reset / email verification flow.
- JWTs are not revocable before expiry (no server-side blocklist) — a
  reasonable trade-off for this scope, but worth flagging.
- In-memory MongoDB fallback (when `MONGO_URI` is unset) does not persist
  data across restarts — fine for local dev, not for anything you want to
  keep.
- Single Day Regeneration replaces a day's activities outright rather than
  doing a diff/merge against the user's manual edits to that day.

---

## What changed in this audit pass

This codebase was audited against the Trao reference guide and corrected
in place. Summary of the fixes, grouped by the same sections as the audit:

**Security & data isolation**
- `middleware/auth.js` now returns 401 (not 403) for both missing and
  invalid tokens, strips debug `console.log`s of raw JWTs, and fails
  closed if `JWT_SECRET` is unset rather than falling back to a
  hardcoded `'default_dev_secret'`.
- `server.js` generates a random ephemeral `JWT_SECRET` at boot if one
  isn't configured, instead of using a guessable default.
- **Tenant isolation was broken** for `addActivity`, `removeActivity`,
  and `regenerateDay` — they trusted a `tripId` from the request body
  with no ownership check, so any authenticated user could read or
  mutate another user's trip by ID. Every trip route now goes through a
  single `getOwnedTrip(tripId, userId)` guard that filters by both
  `_id` and `userId` and returns a generic 404 either way.
- `updateTrip` now whitelists which fields a client can overwrite —
  `userId` can never be reassigned via the API.
- Added `helmet` for baseline security headers and made CORS origin
  configurable via `CLIENT_URL`.

**Schema alignment**
- `models/Trip.js` already matched the reference shape closely; tightened
  it with `min`/`enum` validation, trimmed strings, and an index on
  `userId` since every query filters on it.

**AI engine resiliency & integration (this pass)**
- Switched Gemini auth from the legacy `?key=` query parameter to the
  `x-goog-api-key` header — Google's current docs standardize on the
  header form (keeps the key out of server logs/URLs); the query param
  still works but is no longer what's documented.
- The exponential backoff helper retries **only** on HTTP 429 (1s → 2s →
  4s → 8s → 16s, 5 attempts) — it used to retry on *any* thrown error,
  including non-retryable 4xx failures, which just delayed real errors.
- `createTripAI` and `regenerateDay` now capture *why* a fallback was
  used (`aiError`) — a missing key gets a specific, actionable message
  instead of a generic failure — and return it alongside `usedFallback`.
- The frontend now surfaces that: an inline amber warning on the trip
  creation form and on a regenerated day when a fallback was used, plus
  a persistent dashboard banner driven by `GET /api/health`'s
  `aiConfigured` flag, so a missing/invalid key is visible in the UI
  the moment you load the dashboard — not buried in server logs.
- Added `backend/scripts/checkGeminiKey.js`, a standalone diagnostic
  that makes one real call to Gemini and reports exactly what's wrong.

**Feature operations**
- Added the missing `DELETE /api/trips/:id` and `GET /api/trips/:id`
  endpoints (the audit prompt listed `generate/update/delete/fetch` but
  delete didn't exist).
- **Single Day Regeneration** was previously a stub that just appended a
  "Regenerated suggestion" note. It now calls Gemini with the day's
  context + the user's rewrite text, patches only that day's `activities`
  array, and recalculates the budget ledger (`utils/budget.js`).
- `addActivity` / `removeActivity` / single-day regeneration all now
  recalculate `estimatedBudget.activities` and `.total` so the ledger
  never drifts from the itinerary.
- Packing checkbox toggles persist immediately via
  `PATCH /api/trips/:id/packing/:itemIndex`.

**Backend startup & error-handling fix (this pass)**
- `server.js` called `connectDB()` without awaiting it, then immediately
  called `app.listen()`. Express could start accepting HTTP requests —
  including register/login, which hit MongoDB immediately — before the
  database connection had actually finished (or had silently failed) in
  the background. That race could produce a generic 500 "Server error" on
  the very first request after boot, with no obvious link back to the DB.
  Startup is now wrapped in an `async` function that awaits
  `connectDB()` before binding the port — the process either starts
  fully ready, or exits immediately with a clear reason instead of
  serving requests it can't fulfill.
- `config/db.js` now detects the literal unfilled `.env.example`
  placeholder in `MONGO_URI` (`<user>`, `<password>`,
  `cluster0.example.mongodb.net`) and treats it as unset — falling back
  to in-memory MongoDB with a clear warning — instead of attempting (and
  failing) to connect to a fake host with a confusing DNS error.
- Added `utils/respondError.js`: every 500 response across
  `authController.js` and `tripController.js` now includes a `details`
  field with the real error message when `NODE_ENV !== 'production'`,
  so a server error is diagnosable straight from the browser's network
  tab instead of requiring a trip back to the server terminal every
  time. Production responses stay generic, as before.
- `GET /api/health` now also reports `dbConnected`, so you can confirm
  the database is actually connected without digging through logs.

**Frontend version fix (this pass)**
- `frontend/package.json` had drifted to `next@^16.2.9` while `react`/
  `react-dom` were still pinned at `^18.3.1`. Next.js 15+ hard-requires
  React 19 — that mismatch is what produced a blank/white page with no
  useful error. Upgraded `react`, `react-dom`, `@types/react`, and
  `@types/react-dom` to their React 19 equivalents to match. Verified
  with a clean `npm install` (no peer dependency warnings), `tsc
  --noEmit`, `next build`, and a live `next dev` smoke test confirming
  `/`, `/login`, etc. render real content. If you intentionally pin a
  Next.js major version in the future, pin `react`/`react-dom` to the
  matching major at the same time — they move together.

**Frontend**
- The frontend was actually a Vite + React Router app dressed up with
  Next.js-style file names — `App.tsx`/`main.tsx` drove routing, and
  `src/app/layout.tsx` literally contained a duplicate copy of the
  `PackingList` component instead of a root layout. It's been rebuilt as
  a real Next.js 14 App Router project (`next dev`/`next build`, real
  `app/layout.tsx`, `next/navigation`, `next/link`).
- Removed the duplicate/conflicting `tailwind.config.js` +
  `tailwind.config.cjs` pair (different content globs) in favor of one
  config.
- `types/index.ts` had drifted from the backend schema (`checked` vs.
  `isPacked`, `hotels: string[]` vs. the actual hotel objects) — now
  matches the API responses exactly.
- `ItineraryCard.tsx` existed but was never imported anywhere; the
  dashboard reimplemented its own inline itinerary UI instead. It's now
  the actual component used per day, wired to add/remove/regenerate.
- Removed leftover dev scratch scripts (`tripDebug.js`, `tripDebug2.js`,
  `tripTest.js`, `tripVerify.js`) that printed full JWTs to the console.

`node_modules/` is intentionally not included in this archive — run
`npm install` in both `backend/` and `frontend/` after extracting.
