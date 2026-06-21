// backend/controllers/tripController.js
//
// SECURITY: every handler in this file filters by { _id, userId: req.user.id }
// (via the getOwnedTrip helper below). This is what guarantees User B can
// never read, intercept, or modify a trip belonging to User A — a trip ID
// alone is never sufficient to access or mutate a record.
const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const { generateTripPlan, regenerateDayActivities } = require('../utils/geminiClient');
const { recalcActivitiesBudget } = require('../utils/budget');
const { sendServerError } = require('../utils/respondError');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Tenant isolation guard reused by every mutating/reading endpoint that
// targets a specific trip. Returns null if the trip doesn't exist OR
// belongs to a different user — callers respond 404 either way so trip
// existence is never leaked to non-owners.
async function getOwnedTrip(tripId, userId) {
  if (!isValidId(tripId)) return null;
  return Trip.findOne({ _id: tripId, userId });
}

const ALLOWED_UPDATE_FIELDS = [
  'destination',
  'durationDays',
  'budgetTier',
  'interests',
  'itinerary',
  'hotels',
  'estimatedBudget',
  'packingList'
];

function buildFallbackTrip({ destination, durationDays, budgetTier }) {
  // Deterministic fail-safe used whenever the Gemini API is unavailable,
  // misconfigured, rate-limited past the retry budget, or returns
  // something that doesn't parse as valid JSON.
  const accommodation = durationDays * 120;
  const food = durationDays * 80;
  const transport = 150;
  const activities = durationDays * 50;

  return {
    itinerary: Array.from({ length: durationDays }, (_, index) => ({
      dayNumber: index + 1,
      activities: [
        {
          title: 'Arrival and local orientation',
          description: `Explore the main sights and get settled in ${destination}.`,
          estimatedCostUSD: 50,
          timeOfDay: 'Morning'
        }
      ]
    })),
    hotels: [{ name: `${budgetTier} Tier Hotel`, tier: budgetTier, estimatedCostNightUSD: 120, rating: '4.0/5' }],
    estimatedBudget: {
      transport,
      accommodation,
      food,
      activities,
      total: transport + accommodation + food + activities
    },
    packingList: [
      { item: 'Passport', category: 'Documents', isPacked: false },
      { item: 'Phone charger', category: 'Gear', isPacked: false }
    ]
  };
}

// POST /api/trips/generate
exports.createTripAI = async (req, res) => {
  const { destination, durationDays, budgetTier, interests = [] } = req.body;
  const userId = req.user.id;

  if (!destination || !durationDays || !budgetTier) {
    return res.status(400).json({ message: 'destination, durationDays, and budgetTier are required.' });
  }

  let aiResult = null;
  let usedFallback = false;
  let aiError = null;

  try {
    aiResult = await generateTripPlan({ destination, durationDays, budgetTier, interests });
    if (!aiResult || !Array.isArray(aiResult.itinerary) || aiResult.itinerary.length === 0) {
      aiError = 'Gemini responded, but the output could not be parsed as the expected itinerary JSON.';
    }
  } catch (err) {
    aiError =
      err.code === 'NO_API_KEY'
        ? 'GEMINI_API_KEY is not configured on the server. Add it to backend/.env and restart, ' +
          'then run "node scripts/checkGeminiKey.js" to verify it works.'
        : err.message;
    console.error('Gemini generation failed, using fallback itinerary:', err.message);
  }

  if (!aiResult || !Array.isArray(aiResult.itinerary) || aiResult.itinerary.length === 0) {
    aiResult = buildFallbackTrip({ destination, durationDays, budgetTier });
    usedFallback = true;
  }

  try {
    const trip = await Trip.create({
      userId,
      destination,
      durationDays,
      budgetTier,
      interests,
      itinerary: aiResult.itinerary,
      hotels: aiResult.hotels || [],
      estimatedBudget:
        aiResult.estimatedBudget || { transport: 0, accommodation: 0, food: 0, activities: 0, total: 0 },
      packingList: aiResult.packingList || []
    });
    return res.status(201).json({ trip, usedFallback, aiError: usedFallback ? aiError : null });
  } catch (err) {
    return sendServerError(res, err, 'Fail-safe: could not save the generated trip. Please try again.');
  }
};

// GET /api/trips
exports.getTrips = async (req, res) => {
  try {
    const trips = await Trip.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(trips);
  } catch (err) {
    sendServerError(res, err, 'Failed to fetch trips');
  }
};

// GET /api/trips/:id
exports.getTripById = async (req, res) => {
  try {
    const trip = await getOwnedTrip(req.params.id, req.user.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    res.json(trip);
  } catch (err) {
    sendServerError(res, err, 'Failed to fetch trip');
  }
};

// PUT /api/trips/:id
exports.updateTrip = async (req, res) => {
  try {
    const trip = await getOwnedTrip(req.params.id, req.user.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    // Whitelist fields — userId can never be overwritten by the client.
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) trip[field] = req.body[field];
    }

    recalcActivitiesBudget(trip);
    const saved = await trip.save();
    res.json(saved);
  } catch (err) {
    sendServerError(res, err, 'Failed to update trip');
  }
};

// DELETE /api/trips/:id
exports.deleteTrip = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ message: 'Trip not found' });
    const trip = await Trip.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    res.json({ message: 'Trip deleted', id: trip._id });
  } catch (err) {
    sendServerError(res, err, 'Failed to delete trip');
  }
};

// POST /api/trips/:id/activities  { dayNumber, activity }
exports.addActivity = async (req, res) => {
  const { dayNumber, activity } = req.body;

  if (!dayNumber || !activity?.title) {
    return res.status(400).json({ message: 'dayNumber and activity.title are required' });
  }

  try {
    const trip = await getOwnedTrip(req.params.id, req.user.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    let day = trip.itinerary.find((d) => d.dayNumber === Number(dayNumber));
    if (!day) {
      trip.itinerary.push({ dayNumber: Number(dayNumber), activities: [] });
      day = trip.itinerary[trip.itinerary.length - 1];
    }

    day.activities.push({
      title: activity.title,
      description: activity.description || '',
      estimatedCostUSD: Number(activity.estimatedCostUSD) || 0,
      timeOfDay: activity.timeOfDay || 'Afternoon'
    });

    recalcActivitiesBudget(trip);
    const saved = await trip.save();
    return res.status(201).json(saved);
  } catch (err) {
    return sendServerError(res, err, 'Failed to add activity');
  }
};

// DELETE /api/trips/:id/activities/:dayNumber/:activityIndex
exports.removeActivity = async (req, res) => {
  const { dayNumber, activityIndex } = req.params;

  try {
    const trip = await getOwnedTrip(req.params.id, req.user.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    const day = trip.itinerary.find((d) => d.dayNumber === Number(dayNumber));
    if (!day || !day.activities[activityIndex]) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    day.activities.splice(Number(activityIndex), 1);

    recalcActivitiesBudget(trip);
    const saved = await trip.save();
    return res.json(saved);
  } catch (err) {
    return sendServerError(res, err, 'Failed to remove activity');
  }
};

// POST /api/trips/:id/days/:dayNumber/regenerate  { rewriteText }
//
// Single Day Regeneration: takes the localized target day index and a
// partial user rewrite, patches ONLY that day's activities array inside
// the document (the rest of the itinerary is left untouched), then
// safely recalculates the partial budget ledger.
exports.regenerateDay = async (req, res) => {
  const { dayNumber } = req.params;
  const { rewriteText } = req.body;

  try {
    const trip = await getOwnedTrip(req.params.id, req.user.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    const dayIndex = trip.itinerary.findIndex((d) => d.dayNumber === Number(dayNumber));
    if (dayIndex === -1) return res.status(404).json({ message: 'Day not found in itinerary' });

    let newActivities = null;
    let usedFallback = false;
    let aiError = null;

    try {
      newActivities = await regenerateDayActivities({
        destination: trip.destination,
        budgetTier: trip.budgetTier,
        dayNumber: Number(dayNumber),
        totalDays: trip.durationDays,
        rewriteText: rewriteText || ''
      });
      if (!Array.isArray(newActivities) || newActivities.length === 0) {
        aiError = 'Gemini responded, but the output could not be parsed as the expected activities JSON.';
      }
    } catch (err) {
      aiError =
        err.code === 'NO_API_KEY'
          ? 'GEMINI_API_KEY is not configured on the server. Add it to backend/.env and restart, ' +
            'then run "node scripts/checkGeminiKey.js" to verify it works.'
          : err.message;
      console.error('Gemini single-day regeneration failed, falling back:', err.message);
    }

    if (!Array.isArray(newActivities) || newActivities.length === 0) {
      usedFallback = true;
      newActivities = [
        {
          title: 'Free exploration time',
          description: rewriteText
            ? `Could not reach the AI engine — placeholder day based on your note: "${rewriteText}"`
            : 'Could not reach the AI engine — placeholder activity. Please try regenerating again shortly.',
          estimatedCostUSD: 0,
          timeOfDay: 'Afternoon'
        }
      ];
    }

    // Patch only the targeted chunk of the document.
    trip.itinerary[dayIndex].activities = newActivities;

    // Safely recalculate the budget ledger now that this day changed.
    recalcActivitiesBudget(trip);

    const saved = await trip.save();
    res.json({ trip: saved, usedFallback, aiError: usedFallback ? aiError : null });
  } catch (err) {
    sendServerError(res, err, 'Failed to regenerate day');
  }
};

// POST /api/trips/:id/packing/generate  { season }
// Weather-Aware Packing Assistant — deterministic season-based checklist.
exports.generatePackingList = async (req, res) => {
  const { season } = req.body;

  try {
    const trip = await getOwnedTrip(req.params.id, req.user.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    const items = [
      { item: 'Passport', category: 'Documents', isPacked: false },
      { item: 'Travel insurance printout', category: 'Documents', isPacked: false },
      { item: 'Phone charger', category: 'Gear', isPacked: false },
      { item: 'Universal power adapter', category: 'Gear', isPacked: false },
      { item: 'Comfortable walking shoes', category: 'Clothing', isPacked: false }
    ];

    const normalizedSeason = (season || '').toLowerCase();
    if (normalizedSeason === 'winter') {
      items.push(
        { item: 'Insulated jacket', category: 'Clothing', isPacked: false },
        { item: 'Thermal base layers', category: 'Clothing', isPacked: false }
      );
    } else if (normalizedSeason === 'summer') {
      items.push(
        { item: 'Sunscreen SPF 50', category: 'Other', isPacked: false },
        { item: 'Lightweight breathable clothing', category: 'Clothing', isPacked: false }
      );
    } else if (normalizedSeason === 'rainy' || normalizedSeason === 'monsoon') {
      items.push(
        { item: 'Compact umbrella', category: 'Gear', isPacked: false },
        { item: 'Waterproof jacket', category: 'Clothing', isPacked: false }
      );
    }

    trip.packingList = items;
    const saved = await trip.save();
    res.json(saved);
  } catch (err) {
    sendServerError(res, err, 'Failed to generate packing list');
  }
};

// PATCH /api/trips/:id/packing/:itemIndex  { isPacked }
// Real-time checkbox toggle, persisted straight to MongoDB.
exports.updatePackingItem = async (req, res) => {
  const { itemIndex } = req.params;
  const { isPacked } = req.body;

  try {
    const trip = await getOwnedTrip(req.params.id, req.user.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    const item = trip.packingList[itemIndex];
    if (!item) return res.status(404).json({ message: 'Packing item not found' });

    item.isPacked = Boolean(isPacked);
    const saved = await trip.save();
    res.json(saved);
  } catch (err) {
    sendServerError(res, err, 'Failed to update packing item');
  }
};
