'use client';

import { useState } from 'react';
import type { PackingItem, Trip } from '../types';
import { generatePackingList, updatePackingItem } from '../utils/api';

export default function PackingList({
  trip,
  onTripUpdate
}: {
  trip: Trip;
  onTripUpdate: (trip: Trip) => void;
}) {
  const [season, setSeason] = useState('Summer');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await generatePackingList(trip._id, season);
      onTripUpdate(res.data);
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = async (index: number, item: PackingItem) => {
    // Optimistic update so the checkbox feels instant, then reconcile
    // with whatever MongoDB actually persisted.
    const optimistic: Trip = {
      ...trip,
      packingList: trip.packingList.map((p, i) =>
        i === index ? { ...p, isPacked: !p.isPacked } : p
      )
    };
    onTripUpdate(optimistic);

    try {
      const res = await updatePackingItem(trip._id, index, !item.isPacked);
      onTripUpdate(res.data);
    } catch {
      onTripUpdate(trip); // revert on failure
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="text-xl font-bold text-white">⛈️ AI Weather-Aware Packing Assistant</h3>
        <div className="flex items-center gap-2">
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg text-xs px-2 py-1.5 text-slate-200"
          >
            <option>Summer</option>
            <option>Winter</option>
            <option>Rainy</option>
          </select>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Generating…' : 'Generate List'}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-6">
        Based on your destination and the season you pick, here&apos;s what to pack:
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {trip.packingList && trip.packingList.length > 0 ? (
          trip.packingList.map((item, idx) => (
            <div
              key={idx}
              onClick={() => toggleItem(idx, item)}
              className="flex items-center gap-3 p-3 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-700 transition"
            >
              <input
                type="checkbox"
                checked={item.isPacked}
                readOnly
                className="h-4 w-4 rounded bg-slate-950 border-slate-800 accent-emerald-500 cursor-pointer"
              />
              <span
                className={`text-sm ${item.isPacked ? 'line-through text-slate-500' : 'text-slate-200'}`}
              >
                {item.item}
              </span>
              <span className="ml-auto text-[10px] uppercase bg-slate-900 text-slate-400 px-2 py-0.5 rounded font-mono">
                {item.category}
              </span>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-500">
            No packing list yet — choose a season and click &quot;Generate List&quot;.
          </p>
        )}
      </div>
    </div>
  );
}
