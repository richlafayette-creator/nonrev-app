import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'nonrevy',
    short_name: 'nonrevy',
    description: 'Nonrev flight search and itinerary planning.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#020617',
    theme_color: '#38bdf8',
    categories: ['travel', 'utilities'],
    icons: [
      {
        src: '/brand/nonrevy-logo.png',
        sizes: '500x500',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/nonrevy-icon.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any'
      },
      {
        src: '/icons/nonrevy-maskable-icon.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable'
      }
    ],
    shortcuts: [
      {
        name: 'Plan a trip',
        short_name: 'Plan',
        description: 'Open the nonrevy itinerary planner.',
        url: '/plan?source=pwa-shortcut'
      },
      {
        name: 'Watchlist',
        short_name: 'Watchlist',
        description: 'Review watched routes and saved itinerary alerts.',
        url: '/watchlist?source=pwa-shortcut'
      }
    ]
  }
}
