import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';

import './globals.css';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { ShortcutsSheet } from '@/components/layout/ShortcutsSheet';
import { ScrollProgress } from '@/components/layout/ScrollProgress';
import { PageShell } from '@/components/layout/PageShell';
import { PlayerHost } from '@/components/player/PlayerHost';
import { Cursor } from '@/components/ui/Cursor';
import { Toaster } from '@/components/ui/Toaster';
import { SITE_URL } from '@/lib/site';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'PRISM — Everything worth watching',
    template: '%s · PRISM',
  },
  description:
    'A cinematic viewing surface for the open web’s video library. Continuous playback, synced watch parties, and a library that remembers exactly where you stopped.',
  applicationName: 'PRISM',
  keywords: ['video streaming', 'youtube client', 'watch party', 'video discovery', 'playlists'],
  authors: [{ name: 'PRISM' }],
  openGraph: {
    type: 'website',
    siteName: 'PRISM',
    title: 'PRISM — Everything worth watching',
    description:
      'Continuous playback that follows you across the app, synced watch parties, and a library that remembers exactly where you stopped.',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PRISM — Everything worth watching',
    description: 'A cinematic viewing surface for the open web’s video library.',
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#08080a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}>
      <head>
        {/* The player and thumbnails come from these origins on every page —
            warming the connections shaves ~150ms off first playback. */}
        <link rel="preconnect" href="https://i.ytimg.com" />
        <link rel="preconnect" href="https://www.youtube-nocookie.com" />
        <link rel="dns-prefetch" href="https://www.googleapis.com" />
      </head>
      <body className="grain antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:rounded-lg focus:bg-cream focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-950"
        >
          Skip to content
        </a>

        <AuthProvider>
          <ScrollProgress />
          <Header />
          <PageShell>{children}</PageShell>
          <Footer />

          <PlayerHost />
          <CommandPalette />
          <ShortcutsSheet />
          <Toaster />
          <Cursor />
        </AuthProvider>
      </body>
    </html>
  );
}
