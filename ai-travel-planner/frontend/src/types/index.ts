// frontend/src/types/index.ts
// Mirrors the backend Trip/User Mongoose schemas exactly so the client
// never drifts from what the API actually returns.

export type TimeOfDay = 'Morning' | 'Afternoon' | 'Evening';
export type BudgetTier = 'Low' | 'Medium' | 'High';
export type PackingCategory = 'Documents' | 'Clothing' | 'Gear' | 'Other';

export interface Activity {
  title: string;
  description?: string;
  estimatedCostUSD: number;
  timeOfDay: TimeOfDay;
}

export interface ItineraryDay {
  dayNumber: number;
  activities: Activity[];
}

export interface Hotel {
  name: string;
  tier?: string;
  estimatedCostNightUSD?: number;
  rating?: string;
}

export interface EstimatedBudget {
  transport: number;
  accommodation: number;
  food: number;
  activities: number;
  total: number;
}

export interface PackingItem {
  _id?: string;
  item: string;
  category: PackingCategory;
  isPacked: boolean;
}

export interface Trip {
  _id: string;
  userId: string;
  destination: string;
  durationDays: number;
  budgetTier: BudgetTier;
  interests: string[];
  itinerary: ItineraryDay[];
  hotels: Hotel[];
  estimatedBudget: EstimatedBudget;
  packingList: PackingItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  _id: string;
  email: string;
  createdAt?: string;
}
