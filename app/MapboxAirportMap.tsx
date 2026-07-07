'use client'

import { airportScaffoldFor, mapboxStaticImageUrl } from '../lib/airportMapScaffold'

type MapboxAirportMapProps = {
  airportCode?: string | null
  title?: string
  compact?: boolean
}

export default function MapboxAirportMap({ airportCode, title, compact = false }: MapboxAirportMapProps) {
  const airport = airportScaffoldFor(airportCode)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const imageUrl = airport ? mapboxStaticImageUrl(airport, token) : ''

  return (
    <article className="mapbox-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 16, padding: compact ? 12 : 16, background: 'var(--color-slate-950)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0 }}>{title || `${airportCode || 'Airport'} map`}</h4>
        <span style={{ color: airport ? 'var(--color-sky-400)' : 'var(--color-yellow-400)', fontWeight: 'bold' }}>{airport?.code || 'Pending data'}</span>
      </div>

      {airport && imageUrl ? (
        <div
          aria-label={`${airport.name} Mapbox preview`}
          style={{
            minHeight: compact ? 120 : 180,
            marginTop: 12,
            borderRadius: 12,
            backgroundImage: `linear-gradient(rgba(2, 6, 23, 0.1), rgba(2, 6, 23, 0.35)), url(${imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '1px solid var(--color-slate-700)'
          }}
        />
      ) : (
        <div style={{ minHeight: compact ? 100 : 160, marginTop: 12, borderRadius: 12, border: '1px dashed var(--color-slate-600)', display: 'grid', placeItems: 'center', color: 'var(--color-slate-400)', textAlign: 'center', padding: 12 }}>
          {airport ? 'Mapbox token unavailable; showing map placeholder.' : 'Airport map data unavailable; showing graceful placeholder.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 12, color: 'var(--color-slate-300)' }}>
        <p style={{ margin: 0 }}><strong>Terminal:</strong> {airport?.terminalPlaceholder || 'Terminal unavailable'}</p>
        <p style={{ margin: 0 }}><strong>Gate:</strong> {airport?.gatePlaceholder || 'Gate unavailable'}</p>
        <p style={{ margin: 0 }}><strong>Lounges:</strong> {airport?.loungePlaceholder || 'Lounges unavailable'}</p>
        <p style={{ margin: 0 }}><strong>GPS:</strong> {airport ? `${airport.latitude}, ${airport.longitude}` : 'GPS unavailable'}</p>
        <p style={{ margin: 0 }}><strong>Navigation:</strong> {airport?.navigationPlaceholder || 'Airport navigation unavailable'}</p>
      </div>
    </article>
  )
}
