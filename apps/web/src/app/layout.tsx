import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CineSense-Agent — emotion-driven cinema',
  description:
    'CineSense analyzes your emotional state in real time and synthesizes a bespoke cinematic piece for the mood you are in.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
