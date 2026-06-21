// frontend/src/utils/api.ts
//
// Central Axios client. Injects the Authorization: Bearer <token> header
// automatically on every request, and exposes typed helpers for every
// backend endpoint so components never hand-build URLs.
'use client';

import axios from 'axios';
import type { Trip, Activity } from '../types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const api = axios.create({ baseURL: `${BASE_URL}/api` });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

// --- Token helpers -----------------------------------------------------
const TOKEN_KEY = 'trao_token';

export const getToken = (): string | null =>
  typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;

export const setToken = (token: string) => {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
};

// --- Auth endpoints ------------------------------------------------------
export const registerUser = (email: string, password: string) =>
  api.post('/auth/register', { email, password });

export const loginUser = (email: string, password: string) =>
  api.post('/auth/login', { email, password });

export const getMe = () => api.get('/auth/me');

// --- Health / diagnostics -------------------------------------------------
export const getHealth = () => api.get<{ status: string; aiConfigured: boolean }>('/health');

// --- Trip endpoints ------------------------------------------------------
export const getTrips = () => api.get<Trip[]>('/trips');

export const getTrip = (tripId: string) => api.get<Trip>(`/trips/${tripId}`);

export const createTripAI = (payload: {
  destination: string;
  durationDays: number;
  budgetTier: string;
  interests?: string[];
}) => api.post<{ trip: Trip; usedFallback: boolean; aiError: string | null }>('/trips/generate', payload);

export const updateTrip = (tripId: string, updates: Partial<Trip>) =>
  api.put<Trip>(`/trips/${tripId}`, updates);

export const deleteTrip = (tripId: string) => api.delete(`/trips/${tripId}`);

export const addActivity = (tripId: string, dayNumber: number, activity: Partial<Activity>) =>
  api.post<Trip>(`/trips/${tripId}/activities`, { dayNumber, activity });

export const removeActivity = (tripId: string, dayNumber: number, activityIndex: number) =>
  api.delete<Trip>(`/trips/${tripId}/activities/${dayNumber}/${activityIndex}`);

export const regenerateDay = (tripId: string, dayNumber: number, rewriteText: string) =>
  api.post<{ trip: Trip; usedFallback: boolean; aiError: string | null }>(
    `/trips/${tripId}/days/${dayNumber}/regenerate`,
    { rewriteText }
  );

export const generatePackingList = (tripId: string, season: string) =>
  api.post<Trip>(`/trips/${tripId}/packing/generate`, { season });

export const updatePackingItem = (tripId: string, itemIndex: number, isPacked: boolean) =>
  api.patch<Trip>(`/trips/${tripId}/packing/${itemIndex}`, { isPacked });
