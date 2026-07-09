'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { cabinOptions } from './preferenceOptions'
import { defaultUserPreferences, loadUserPreferences, parsePreferenceList, saveUserPreferences } from '../../lib/userPreferences'

export default function PreferencesPage() {
  const [preferredAirlines, setPreferredAirlines] = useState(defaultUserPreferences.preferredAirlines.join(', '))
  const [maximumStops, setMaximumStops] = useState(String(defaultUserPreferences.maximumStops))
  const [minimumConnectionMinutes, setMinimumConnectionMinutes] = useState(String(defaultUserPreferences.minimumConnectionMinutes))
  const [favoriteAirports, setFavoriteAirports] = useState(defaultUserPreferences.favoriteAirports.join(', '))
  const [cabinPreference, setCabinPreference] = useState(defaultUserPreferences.cabinPreference)
  const [status, setStatus] = useState('Preferences are stored locally until backend account storage is connected.')

  useEffect(() => {
    const stored = loadUserPreferences()
    setPreferredAirlines(stored.preferredAirlines.join(', '))
    setMaximumStops(String(stored.maximumStops))
    setMinimumConnectionMinutes(String(stored.minimumConnectionMinutes))
    setFavoriteAirports(stored.favoriteAirports.join(', '))
    setCabinPreference(stored.cabinPreference)
  }, [])

  const preview = useMemo(() => ({
    preferredAirlines: parsePreferenceList(preferredAirlines),
    maximumStops: Number(maximumStops),
    minimumConnectionMinutes: Number(minimumConnectionMinutes),
    favoriteAirports: parsePreferenceList(favoriteAirports).map((airport) => airport.toUpperCase()),
    cabinPreference
  }), [preferredAirlines, maximumStops, minimumConnectionMinutes, favoriteAirports, cabinPreference])

  function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = saveUserPreferences(preview)
    setPreferredAirlines(saved.preferredAirlines.join(', '))
    setMaximumStops(String(saved.maximumStops))
    setMinimumConnectionMinutes(String(saved.minimumConnectionMinutes))
    setFavoriteAirports(saved.favoriteAirports.join(', '))
    setCabinPreference(saved.cabinPreference)
    setStatus('Preferences saved locally for route ranking and planning defaults.')
  }

  function resetPreferences() {
    const saved = saveUserPreferences(defaultUserPreferences)
    setPreferredAirlines(saved.preferredAirlines.join(', '))
    setMaximumStops(String(saved.maximumStops))
    setMinimumConnectionMinutes(String(saved.minimumConnectionMinutes))
    setFavoriteAirports(saved.favoriteAirports.join(', '))
    setCabinPreference(saved.cabinPreference)
    setStatus('Preferences reset to MVP defaults.')
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#fbfcff', color: '#111827', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#2563eb' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: '#2563eb' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: '#2563eb' }}>Profile</a>
        <a href="/preferences" style={{ color: '#4f46e5', fontWeight: 900 }}>Preferences</a>
      </nav>

      <section style={{ maxWidth: 960, margin: '0 auto' }}>
        <p style={{ color: '#4f46e5', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>MVP preferences</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Tune Nonrevy around how you actually travel.</h1>
        <p style={{ color: '#4B5563', fontSize: 18, maxWidth: 760, lineHeight: 1.55 }}>
          Store preferred airlines, stop limits, connection buffers, favorite airports, and cabin preference locally. Backend sync can adopt the same shape later.
        </p>

        <form onSubmit={savePreferences} style={{ display: 'grid', gap: 16, border: '1px solid #e5e7eb', borderRadius: 24, padding: 22, background: '#ffffff', boxShadow: '0 18px 48px rgba(15, 23, 42, 0.08)', marginTop: 24 }}>
          <label style={{ color: '#374151', fontWeight: 800 }}>
            Preferred airlines
            <input value={preferredAirlines} onChange={(event) => setPreferredAirlines(event.target.value)} placeholder="United, Delta" style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #d1d5db', background: '#ffffff', color: '#111827' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <label style={{ color: '#374151', fontWeight: 800 }}>
              Maximum stops
              <input type="number" min="0" max="4" value={maximumStops} onChange={(event) => setMaximumStops(event.target.value)} style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #d1d5db', background: '#ffffff', color: '#111827' }} />
            </label>
            <label style={{ color: '#374151', fontWeight: 800 }}>
              Minimum connection time (minutes)
              <input type="number" min="30" max="240" value={minimumConnectionMinutes} onChange={(event) => setMinimumConnectionMinutes(event.target.value)} style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #d1d5db', background: '#ffffff', color: '#111827' }} />
            </label>
            <label style={{ color: '#374151', fontWeight: 800 }}>
              Cabin preference
              <select value={cabinPreference} onChange={(event) => setCabinPreference(event.target.value as typeof cabinPreference)} style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #d1d5db', background: '#ffffff', color: '#111827' }}>
                {cabinOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          </div>

          <label style={{ color: '#374151', fontWeight: 800 }}>
            Favorite airports
            <input value={favoriteAirports} onChange={(event) => setFavoriteAirports(event.target.value)} placeholder="LAX, SFO, DEN" style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #d1d5db', background: '#ffffff', color: '#111827' }} />
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" style={{ padding: '13px 18px', borderRadius: 999, border: 'none', background: '#4f46e5', color: '#ffffff', fontWeight: 900 }}>Save preferences</button>
            <button type="button" onClick={resetPreferences} style={{ padding: '13px 18px', borderRadius: 999, border: '1px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 900 }}>Reset</button>
          </div>
          <p style={{ color: '#4B5563', marginBottom: 0 }}>{status}</p>
        </form>

        <section style={{ marginTop: 18, border: '1px solid #e5e7eb', borderRadius: 20, padding: 18, background: '#ffffff' }}>
          <strong style={{ color: '#111827' }}>Current preference preview</strong>
          <p style={{ color: '#4B5563', lineHeight: 1.6, marginBottom: 0 }}>
            Airlines: {preview.preferredAirlines.join(', ') || 'Any'} · Max stops: {Number.isFinite(preview.maximumStops) ? preview.maximumStops : defaultUserPreferences.maximumStops} · Min connection: {Number.isFinite(preview.minimumConnectionMinutes) ? preview.minimumConnectionMinutes : defaultUserPreferences.minimumConnectionMinutes}m · Airports: {preview.favoriteAirports.join(', ') || 'Any'} · Cabin: {preview.cabinPreference}
          </p>
        </section>
      </section>
    </main>
  )
}
