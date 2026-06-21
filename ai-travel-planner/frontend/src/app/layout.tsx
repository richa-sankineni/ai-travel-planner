import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trao — AI Travel Planner',
  description: 'AI-generated itineraries, budgets, and packing lists for your next trip.'
};

// Using the system font stack (defined in globals.css / tailwind.config.js)
// instead of next/font/google so the build never depends on reaching
// fonts.googleapis.com — keeps local/offline and restricted-network builds
// working out of the box. Swap in next/font/google here if you want a
// custom webfont and have unrestricted network access at build time.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 font-sans">{children}</body>
    </html>
  );
}
