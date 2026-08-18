import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PRISM — Everything worth watching',
    short_name: 'PRISM',
    description:
      'A cinematic viewing surface for the open web’s video library. Continuous playback, synced watch parties, and a library that remembers where you stopped.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#08080a',
    theme_color: '#08080a',
    categories: ['entertainment', 'video', 'music'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A separate maskable copy: Android crops to a circle, and the 'any'
      // icons would lose their outer strokes to that crop.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Trending', url: '/trending' },
      { name: 'Your library', url: '/library' },
      { name: 'Watch parties', url: '/rooms' },
    ],
  };
}
