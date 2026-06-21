// backend/models/Trip.js
//
// Matches the Trao reference schema exactly:
// userId, destination, durationDays, budgetTier, itinerary[], hotels[],
// estimatedBudget{}, packingList[].
const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    estimatedCostUSD: { type: Number, default: 0, min: 0 },
    timeOfDay: {
      type: String,
      enum: ['Morning', 'Afternoon', 'Evening'],
      default: 'Morning'
    }
  },
  { _id: false }
);

const ItineraryDaySchema = new mongoose.Schema(
  {
    dayNumber: { type: Number, required: true, min: 1 },
    activities: { type: [ActivitySchema], default: [] }
  },
  { _id: false }
);

const HotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    tier: { type: String, default: '' },
    estimatedCostNightUSD: { type: Number, default: 0, min: 0 },
    rating: { type: String, default: '' }
  },
  { _id: false }
);

const PackingItemSchema = new mongoose.Schema({
  item: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['Documents', 'Clothing', 'Gear', 'Other'],
    default: 'Other'
  },
  isPacked: { type: Boolean, default: false }
});

const TripSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true // every trip lookup is filtered by userId — index it
    },
    destination: { type: String, required: true, trim: true },
    durationDays: { type: Number, required: true, min: 1 },
    budgetTier: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      required: true
    },
    interests: { type: [String], default: [] },
    itinerary: { type: [ItineraryDaySchema], default: [] },
    hotels: { type: [HotelSchema], default: [] },
    estimatedBudget: {
      transport: { type: Number, default: 0, min: 0 },
      accommodation: { type: Number, default: 0, min: 0 },
      food: { type: Number, default: 0, min: 0 },
      activities: { type: Number, default: 0, min: 0 },
      total: { type: Number, default: 0, min: 0 }
    },
    packingList: { type: [PackingItemSchema], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Trip', TripSchema);
