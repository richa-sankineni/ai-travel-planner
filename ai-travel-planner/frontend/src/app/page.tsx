import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen space-y-6 bg-slate-950 text-slate-100 px-4 text-center">
      <h1 className="text-4xl font-bold">Welcome to Trao AI Travel Planner</h1>
      <p className="text-lg text-slate-400 max-w-xl">
        Plan smarter trips with AI-generated itineraries, live budget ledgers, and a weather-aware
        packing assistant.
      </p>
      <div className="space-x-4">
        <Link
          href="/register"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
        >
          Create Account
        </Link>
        <Link
          href="/login"
          className="px-4 py-2 border border-slate-700 hover:border-slate-500 rounded-lg transition"
        >
          Login
        </Link>
      </div>
    </main>
  );
}
