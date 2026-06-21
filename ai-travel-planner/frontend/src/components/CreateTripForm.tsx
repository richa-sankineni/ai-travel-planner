'use client';

import { useState } from 'react';
import { createTripAI } from '../utils/api';
import type { Trip } from '../types';

export default function CreateTripForm({ onCreated }: { onCreated: (trip: Trip) => void }) {
  const [destination, setDestination] = useState('');
  const [durationDays, setDurationDays] = useState(5);
  const [budgetTier, setBudgetTier] = useState('Medium');
  const [interests, setInterests] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiWarning, setAiWarning] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAiWarning('');

    if (!destination.trim()) {
      setError('Please enter a destination.');
      return;
    }

    setLoading(true);
    try {
      const res = await createTripAI({
        destination,
        durationDays,
        budgetTier,
        interests: interests
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      });
      onCreated(res.data.trip);
      setDestination('');
      setInterests('');
      if (res.data.usedFallback) {
        setAiWarning(
          res.data.aiError ||
            'The AI engine was unavailable, so this trip uses a placeholder itinerary.'
        );
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err?.response?.data?.error || 'Failed to create trip'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">Destination</label>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="e.g. Lisbon, Portugal"
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Duration (days)</label>
          <input
            type="number"
            min={1}
            max={30}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Budget</label>
          <select
            value={budgetTier}
            onChange={(e) => setBudgetTier(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
          >
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">
          Interests (comma separated)
        </label>
        <input
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          placeholder="food, history, hiking"
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg text-sm transition"
      >
        {loading ? 'Generating itinerary…' : 'Generate Trip'}
      </button>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {aiWarning && (
        <p className="text-amber-400 text-xs bg-amber-950/40 border border-amber-900 rounded-lg px-3 py-2">
          ⚠️ {aiWarning}
        </p>
      )}
    </form>
  );
}
