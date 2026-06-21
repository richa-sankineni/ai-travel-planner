'use client';

import { useState } from 'react';
import type { ItineraryDay, Trip } from '../types';
import { addActivity, removeActivity, regenerateDay } from '../utils/api';

export default function ItineraryCard({
  trip,
  day,
  onTripUpdate
}: {
  trip: Trip;
  day: ItineraryDay;
  onTripUpdate: (trip: Trip) => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [rewriteText, setRewriteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiWarning, setAiWarning] = useState('');

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const res = await addActivity(trip._id, day.dayNumber, {
        title: newTitle,
        description: 'Added by traveler',
        estimatedCostUSD: 0,
        timeOfDay: 'Afternoon'
      });
      onTripUpdate(res.data);
      setNewTitle('');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (index: number) => {
    setBusy(true);
    try {
      const res = await removeActivity(trip._id, day.dayNumber, index);
      onTripUpdate(res.data);
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    setBusy(true);
    setAiWarning('');
    try {
      const res = await regenerateDay(trip._id, day.dayNumber, rewriteText);
      onTripUpdate(res.data.trip);
      setRewriteText('');
      if (res.data.usedFallback) {
        setAiWarning(
          res.data.aiError ||
            'The AI engine was unavailable, so this day uses a placeholder activity.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-l-2 border-indigo-500 pl-6 relative">
      <div className="absolute -left-[9px] top-1 w-4 h-4 bg-indigo-500 rounded-full border-4 border-slate-900" />
      <h3 className="text-lg font-bold text-slate-200 mb-3">Day {day.dayNumber}</h3>

      <div className="space-y-3 mb-4">
        {day.activities.map((act, index) => (
          <div
            key={index}
            className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-start gap-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{act.title}</span>
                <span className="text-xs bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded-full">
                  {act.timeOfDay}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{act.description}</p>
              <p className="text-xs text-emerald-400 mt-1">${act.estimatedCostUSD}</p>
            </div>
            <button
              onClick={() => handleRemove(index)}
              disabled={busy}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 whitespace-nowrap"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 max-w-sm mb-3">
        <input
          type="text"
          placeholder="Add a new activity..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-full"
        />
        <button
          onClick={handleAdd}
          disabled={busy}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <div className="flex items-center gap-2 max-w-md">
        <input
          type="text"
          placeholder="Regenerate this day — tell the AI what to change..."
          value={rewriteText}
          onChange={(e) => setRewriteText(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:border-purple-500 w-full"
        />
        <button
          onClick={handleRegenerate}
          disabled={busy}
          className="bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 whitespace-nowrap"
        >
          Regenerate
        </button>
      </div>

      {aiWarning && (
        <p className="text-amber-400 text-xs bg-amber-950/40 border border-amber-900 rounded-lg px-3 py-2 mt-2 max-w-md">
          ⚠️ {aiWarning}
        </p>
      )}
    </div>
  );
}
