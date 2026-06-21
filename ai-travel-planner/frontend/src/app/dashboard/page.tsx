'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTrips, deleteTrip, clearToken, getToken, getHealth } from '../../utils/api';
import type { Trip } from '../../types';
import CreateTripForm from '../../components/CreateTripForm';
import ItineraryCard from '../../components/ItineraryCard';
import PackingList from '../../components/PackingList';

export default function Dashboard() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    fetchUserTrips();
    checkAiHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAiHealth = async () => {
    try {
      const res = await getHealth();
      setAiConfigured(res.data.aiConfigured);
    } catch {
      // Health check is best-effort — if the backend itself is unreachable
      // the trip fetch below will surface that more clearly.
      setAiConfigured(null);
    }
  };

  const fetchUserTrips = async () => {
    try {
      const res = await getTrips();
      setTrips(res.data);
      if (res.data.length > 0) setSelectedTrip(res.data[0]);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        clearToken();
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTripCreated = (trip: Trip) => {
    setTrips((prev) => [trip, ...prev]);
    setSelectedTrip(trip);
  };

  const handleTripUpdate = (trip: Trip) => {
    setSelectedTrip(trip);
    setTrips((prev) => prev.map((t) => (t._id === trip._id ? trip : t)));
  };

  const handleDeleteTrip = async (tripId: string) => {
    await deleteTrip(tripId);
    const remaining = trips.filter((t) => t._id !== tripId);
    setTrips(remaining);
    setSelectedTrip(remaining[0] || null);
  };

  const handleSignOut = () => {
    clearToken();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">Loading your trips…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <header className="max-w-7xl mx-auto flex justify-between items-center border-b border-slate-800 pb-5 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            AI Travel Dashboard
          </h1>
          <p className="text-sm text-slate-400">Your trips, visible only to you.</p>
        </div>
        <button
          onClick={handleSignOut}
          className="bg-red-500 hover:bg-red-600 transition text-white px-4 py-2 rounded-lg text-sm"
        >
          Sign Out
        </button>
      </header>

      {aiConfigured === false && (
        <div className="max-w-7xl mx-auto mb-8 bg-amber-950/40 border border-amber-900 text-amber-300 text-sm rounded-xl px-4 py-3">
          ⚠️ <span className="font-semibold">AI engine not configured.</span> Trips are being
          generated from a deterministic fallback planner, not Gemini. Set{' '}
          <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-200">GEMINI_API_KEY</code>{' '}
          in <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-200">backend/.env</code>,
          restart the server, then refresh this page.
        </div>
      )}

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Trip Creation & Selector */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">Create a New Trip</h2>
            <CreateTripForm onCreated={handleTripCreated} />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">Your Active Trips</h2>
            {trips.length === 0 ? (
              <p className="text-slate-500 text-sm">No itineraries found. Create one to begin!</p>
            ) : (
              <div className="space-y-3">
                {trips.map((trip) => (
                  <div key={trip._id} className="flex items-stretch gap-2">
                    <button
                      onClick={() => setSelectedTrip(trip)}
                      className={`flex-1 text-left p-4 rounded-xl transition ${
                        selectedTrip?._id === trip._id
                          ? 'bg-blue-600 border border-blue-500 text-white'
                          : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <p className="font-bold">{trip.destination}</p>
                      <p className="text-xs opacity-80">
                        {trip.durationDays} Days • {trip.budgetTier} Budget
                      </p>
                    </button>
                    <button
                      onClick={() => handleDeleteTrip(trip._id)}
                      className="px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-500 text-xs"
                      title="Delete trip"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedTrip && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">Financial Cost Ledger</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Lodging & Accommodations:</span>
                  <span className="font-semibold">${selectedTrip.estimatedBudget.accommodation}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Culinary & Dining:</span>
                  <span className="font-semibold">${selectedTrip.estimatedBudget.food}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Activities & Sightseeing:</span>
                  <span className="font-semibold">${selectedTrip.estimatedBudget.activities}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Transport:</span>
                  <span className="font-semibold">${selectedTrip.estimatedBudget.transport}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-800 pt-3 text-white font-bold">
                  <span>Grand Total Estimated Budget:</span>
                  <span>${selectedTrip.estimatedBudget.total}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Itinerary Board & Editor */}
        <div className="lg:col-span-2 space-y-6">
          {selectedTrip ? (
            <>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-2xl font-bold mb-6 text-white border-b border-slate-800 pb-3">
                  Day-by-Day Timeline: {selectedTrip.destination}
                </h2>
                <div className="space-y-6">
                  {selectedTrip.itinerary.map((day) => (
                    <ItineraryCard
                      key={day.dayNumber}
                      trip={selectedTrip}
                      day={day}
                      onTripUpdate={handleTripUpdate}
                    />
                  ))}
                </div>
              </div>

              <PackingList trip={selectedTrip} onTripUpdate={handleTripUpdate} />
            </>
          ) : (
            <div className="flex flex-col justify-center items-center h-96 bg-slate-900 border border-slate-800 rounded-2xl">
              <span className="text-6xl mb-4">✈️</span>
              <p className="text-slate-400">
                Select an existing itinerary or create a new trip to begin exploring.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
