'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { removeTripWatch, loadSavedTripWatchlist, saveTripWatch, type SavedTripWatch } from '../../lib/watchlist'
import { loadSavedItineraryComparisons, type SavedItineraryComparison } from '../../lib/savedItineraryComparisons'
import { buildDisruptionIntelligence } from '../../lib/disruptionIntelligence'
import { calculateRouteConfidence, confidenceBadgeColor, confidenceTrendColor, type RouteConfidence } from '../../lib/routeConfidence'
import { defaultTravelerProfile, loadTravelerProfileFromStorage, type TravelerProfileScaffold } from '../../lib/travelerProfile'
import {
  enabledTripAlertLabels,
  getTripAlertPreference,
  loadTripAlertPreferences,
  removeTripAlertPreference,
  saveTripAlertPreference,
  tripAlertPreferenceOptions,
  type TripAlertPreference,
  type TripAlertPreferenceKey,
  type TripAlertTargetType
} from '../../lib/tripAlertPreferences'

function metricColor(value: number) {
  if (value >= 80) return '#22c55e'
  if (value >= 70) return '#38bdf8'
  if (value >= 60) return '#facc15'
  return '#f87171'
}

function normalizeRoute(value: string) {
  return value.trim().toUpperCase().replace(/\s+TO\s+/g, ' → ').replace(/\s*-\s*/g, ' → ')
}

function routeEndpoints(route: string) {
  const airports = route.match(/\b[A-Z]{3}\b/g) || []
  return {
    origin: airports[0] || 'TBD',
    destination: airports[airports.length - 1] || 'TBD'
  }
}

function confidenceForRoute(route: SavedTripWatch | SavedItineraryComparison, travelerProfile: TravelerProfileScaffold): RouteConfidence {
  const selectedRoute = 'selectedItinerary' in route ? route.selectedItinerary : route.route
  const disruption = buildDisruptionIntelligence({ route: selectedRoute })
  return calculateRouteConfidence({
    route: selectedRoute,
    successProbability: route.successProbability,
    historicalScore: route.score,
    historicalSuccessRate: route.successProbability,
    historicalReportCount: 0,
    communityReportCount: 0,
    communityLoadAdjustment: 0,
    travelerProfile,
    disruption,
    previousConfidenceScore: 'routeConfidenceScore' in route ? route.routeConfidenceScore : undefined
  })
}

function AlertPreferenceChecklist({ preference, onToggle }: { preference: TripAlertPreference; onToggle: (key: TripAlertPreferenceKey, enabled: boolean) => void }) {
  return (
    <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617', marginTop: 14 }}>
      <strong style={{ color: '#f472b6' }}>Alert preferences</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 10 }}>
        {tripAlertPreferenceOptions.map((option) => (
          <label key={option.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid #1e293b', borderRadius: 12, padding: 10, color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={preference.flags[option.key]}
              onChange={(event) => onToggle(option.key, event.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ display: 'block', color: '#f8fafc', fontWeight: 'bold' }}>{option.label}</span>
              <small style={{ color: '#94a3b8' }}>{option.description}</small>
            </span>
          </label>
        ))}
      </div>
      <p style={{ color: '#94a3b8', marginBottom: 0 }}>
        Enabled: {enabledTripAlertLabels(preference).join(', ') || 'No alerts enabled'} · Saved locally
      </p>
    </div>
  )
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<SavedTripWatch[]>([])
  const [savedItineraries, setSavedItineraries] = useState<SavedItineraryComparison[]>([])
  const [alertPreferences, setAlertPreferences] = useState<TripAlertPreference[]>([])
  const [travelerProfile, setTravelerProfile] = useState(defaultTravelerProfile)
  const [routeText, setRouteText] = useState('')
  const [travelDate, setTravelDate] = useState('')
  const [carrier, setCarrier] = useState('United')
  const [saveStatus, setSaveStatus] = useState('Saved trip watchlist is stored locally in this browser.')

  useEffect(() => {
    function refreshWatchlist() {
      setWatchlist(loadSavedTripWatchlist())
      setSavedItineraries(loadSavedItineraryComparisons())
      setAlertPreferences(loadTripAlertPreferences())
      setTravelerProfile(loadTravelerProfileFromStorage())
    }

    refreshWatchlist()
    window.addEventListener('nonrevy-watchlist-updated', refreshWatchlist)
    window.addEventListener('nonrevy-itinerary-comparisons-updated', refreshWatchlist)
    window.addEventListener('nonrevy-trip-alert-preferences-updated', refreshWatchlist)
    window.addEventListener('storage', refreshWatchlist)
    return () => {
      window.removeEventListener('nonrevy-watchlist-updated', refreshWatchlist)
      window.removeEventListener('nonrevy-itinerary-comparisons-updated', refreshWatchlist)
      window.removeEventListener('nonrevy-trip-alert-preferences-updated', refreshWatchlist)
      window.removeEventListener('storage', refreshWatchlist)
    }
  }, [])

  const summary = useMemo(() => {
    const averageScore = watchlist.length ? Math.round(watchlist.reduce((total, route) => total + route.score, 0) / watchlist.length) : 0
    const averageProbability = watchlist.length ? Math.round(watchlist.reduce((total, route) => total + route.successProbability, 0) / watchlist.length) : 0
    const averageConfidence = watchlist.length ? Math.round(watchlist.reduce((total, route) => total + confidenceForRoute(route, travelerProfile).score, 0) / watchlist.length) : 0
    const enabledAlertCount = alertPreferences.reduce((total, preference) => total + Object.values(preference.flags).filter(Boolean).length, 0)
    return { averageScore, averageProbability, averageConfidence, enabledAlertCount }
  }, [watchlist, alertPreferences, travelerProfile])

  function addRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selectedItinerary = normalizeRoute(routeText)
    if (!selectedItinerary) return

    const endpoints = routeEndpoints(selectedItinerary)
    const routeConfidence = confidenceForRoute({
      id: 'draft',
      origin: endpoints.origin,
      destination: endpoints.destination,
      travelDate: travelDate || 'Flexible',
      carrier,
      selectedItinerary,
      score: 68,
      successProbability: 66,
      riskLevel: 'Medium',
      connections: Math.max(0, (selectedItinerary.match(/→/g) || []).length - 1),
      totalTravelTime: 'Pending schedule data',
      lastUpdated: new Date().toISOString()
    }, travelerProfile)
    const saved = saveTripWatch({
      origin: endpoints.origin,
      destination: endpoints.destination,
      travelDate: travelDate || 'Flexible',
      carrier,
      selectedItinerary,
      score: 68,
      successProbability: 66,
      routeConfidenceScore: routeConfidence.score,
      confidenceBadge: routeConfidence.badge,
      confidenceTrend: routeConfidence.trend,
      riskLevel: 'Medium',
      connections: Math.max(0, (selectedItinerary.match(/→/g) || []).length - 1),
      totalTravelTime: 'Pending schedule data'
    })

    if (saved) {
      setWatchlist(loadSavedTripWatchlist())
      setSaveStatus(`Watching ${saved.origin} → ${saved.destination} for ${saved.travelDate}.`)
      setRouteText('')
      setTravelDate('')
    }
  }

  function removeWatch(id: string) {
    setWatchlist(removeTripWatch(id))
    setAlertPreferences(removeTripAlertPreference(id, 'watched-route'))
    setSaveStatus('Removed watched route.')
  }

  function preferenceFor(targetId: string, targetType: TripAlertTargetType, targetLabel: string) {
    return alertPreferences.find((preference) => preference.targetId === targetId && preference.targetType === targetType) || getTripAlertPreference(targetId, targetType, targetLabel)
  }

  function updatePreference(targetId: string, targetType: TripAlertTargetType, targetLabel: string, key: TripAlertPreferenceKey, enabled: boolean) {
    const current = preferenceFor(targetId, targetType, targetLabel)
    const savedPreference = saveTripAlertPreference({
      ...current,
      targetLabel,
      flags: {
        ...current.flags,
        [key]: enabled
      }
    })

    if (savedPreference) {
      setAlertPreferences(loadTripAlertPreferences())
      setSaveStatus(`Updated alert preferences for ${targetLabel}.`)
    }
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/intelligence" style={{ marginRight: 16, color: '#c084fc' }}>Intelligence</a>
        <a href="/reminders" style={{ marginRight: 16, color: '#f472b6' }}>Reminders</a>
        <a href="/agent" style={{ color: '#a78bfa' }}>Agent</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#facc15', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Saved trip watchlists</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Route Watchlist</h1>
        <p style={{ color: '#94a3b8', fontSize: 18, maxWidth: 780 }}>
          Watch route recommendations from the planner, track their current score and success probability, and remove routes when you no longer need them. Local-only storage for now.
        </p>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {[
            ['Saved Routes', watchlist.length, '#38bdf8'],
            ['Avg Current Score', summary.averageScore, '#facc15'],
            ['Avg Success Probability', `${summary.averageProbability}%`, '#22c55e'],
            ['Avg Route Confidence', `${summary.averageConfidence}/100`, summary.averageConfidence >= 72 ? '#38bdf8' : summary.averageConfidence >= 58 ? '#facc15' : '#f87171'],
            ['Enabled Alerts', summary.enabledAlertCount, '#f472b6']
          ].map(([label, value, color]) => (
            <article key={label} className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
              <strong style={{ color: String(color), fontSize: 32 }}>{value}</strong>
              <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
            </article>
          ))}
        </section>

        <form onSubmit={addRoute} style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 24 }}>
          <label style={{ color: '#cbd5e1' }}>
            Selected itinerary
            <input
              value={routeText}
              onChange={(event) => setRouteText(event.target.value)}
              placeholder="LAX-HNL or LAX → SFO → HNL"
              style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
            />
          </label>
          <label style={{ color: '#cbd5e1' }}>
            Travel date
            <input
              type="date"
              value={travelDate}
              onChange={(event) => setTravelDate(event.target.value)}
              style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
            />
          </label>
          <label style={{ color: '#cbd5e1' }}>
            Carrier
            <select
              value={carrier}
              onChange={(event) => setCarrier(event.target.value)}
              style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
            >
              <option>United</option>
              <option>Delta</option>
              <option>Alaska Group</option>
            </select>
          </label>
          <button type="submit" style={{ alignSelf: 'end', padding: '14px 18px', borderRadius: 12, border: 'none', background: '#facc15', color: '#020617', fontWeight: 'bold' }}>
            Add watch
          </button>
        </form>
        <p style={{ color: '#94a3b8' }}>{saveStatus}</p>

        <div style={{ display: 'grid', gap: 14, marginTop: 24 }}>
          {watchlist.length === 0 && (
            <article className="flight-card" style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 18, padding: 18 }}>
              <h2 style={{ marginTop: 0 }}>No watched routes yet</h2>
              <p style={{ color: '#cbd5e1', marginBottom: 0 }}>
                Add one here or use the Watch button on the itinerary comparison cards in the planner.
              </p>
            </article>
          )}
          {watchlist.map((route) => {
            const routeConfidence = confidenceForRoute(route, travelerProfile)
            return (
            <article key={route.id} className="flight-card" style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 18, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ color: '#facc15', textTransform: 'uppercase', letterSpacing: 1 }}>{route.carrier}</strong>
                  <h2 style={{ margin: '8px 0', color: '#f8fafc' }}>{route.origin} → {route.destination}</h2>
                  <p style={{ color: '#38bdf8', fontWeight: 'bold', margin: '6px 0' }}>{route.selectedItinerary}</p>
                  <p style={{ color: '#94a3b8', margin: 0 }}>Travel date: {route.travelDate} · Last updated: {new Date(route.lastUpdated).toLocaleString()}</p>
                </div>
                <button type="button" onClick={() => removeWatch(route.id)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #f87171', background: '#1f2937', color: '#fecaca', fontWeight: 'bold' }}>
                  Remove
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 14 }}>
                {[
                  ['Current score', route.score, metricColor(route.score)],
                  ['Success probability', `${route.successProbability}%`, metricColor(route.successProbability)],
                  ['Route confidence', `${routeConfidence.score}/100 · ${routeConfidence.badge}`, confidenceBadgeColor(routeConfidence.badge)],
                  ['Confidence trend', routeConfidence.trend, confidenceTrendColor(routeConfidence.trend)],
                  ['Risk level', route.riskLevel, route.riskLevel.includes('Low') ? '#22c55e' : route.riskLevel.includes('Medium') ? '#facc15' : '#f87171'],
                  ['Connections', route.connections, route.connections === 0 ? '#22c55e' : '#facc15'],
                  ['Travel time', route.totalTravelTime, '#38bdf8']
                ].map(([label, value, color]) => (
                  <div key={`${route.id}-${label}`} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#020617' }}>
                    <small style={{ color: '#94a3b8' }}>{label}</small>
                    <p style={{ margin: '4px 0 0', color: String(color), fontWeight: 'bold' }}>{value}</p>
                  </div>
                ))}
              </div>
              <AlertPreferenceChecklist
                preference={preferenceFor(route.id, 'watched-route', `${route.origin} → ${route.destination}`)}
                onToggle={(key, enabled) => updatePreference(route.id, 'watched-route', `${route.origin} → ${route.destination}`, key, enabled)}
              />
            </article>
            )
          })}
        </div>

        <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', marginTop: 28 }}>
          <p style={{ color: '#f472b6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Saved itinerary alert preferences</p>
          <h2 style={{ margin: '8px 0' }}>Alerts for saved itinerary comparisons</h2>
          <p style={{ color: '#94a3b8' }}>
            These preferences apply to itinerary options saved from /plan. They stay local until the realtime alert engine is connected.
          </p>
          {savedItineraries.length === 0 ? (
            <article style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
              <p style={{ color: '#cbd5e1', margin: 0 }}>No saved itinerary comparisons yet. Save options from /plan to configure itinerary-specific alerts.</p>
            </article>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {savedItineraries.map((itinerary) => {
                const routeConfidence = confidenceForRoute(itinerary, travelerProfile)
                return (
                <article key={itinerary.id} className="flight-card" style={{ background: '#020617', border: '1px solid #334155', borderRadius: 18, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ color: '#c084fc', textTransform: 'uppercase', letterSpacing: 1 }}>{itinerary.sourceLabel}</strong>
                      <h3 style={{ color: '#f8fafc', margin: '8px 0' }}>{itinerary.route}</h3>
                      <p style={{ color: '#94a3b8', margin: 0 }}>{itinerary.carrier} · Score {itinerary.score} · Success {itinerary.successProbability}% · Confidence {routeConfidence.score}/100</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', border: `1px solid ${confidenceBadgeColor(routeConfidence.badge)}`, borderRadius: 999, padding: '5px 9px', color: confidenceBadgeColor(routeConfidence.badge), fontWeight: 'bold', marginBottom: 8 }}>
                        {routeConfidence.badge} · {routeConfidence.trend}
                      </span>
                      <br />
                      <a href="/plan" style={{ color: '#38bdf8', fontWeight: 'bold' }}>Open planner</a>
                    </div>
                  </div>
              <AlertPreferenceChecklist
                    preference={preferenceFor(itinerary.id, 'saved-itinerary', itinerary.route)}
                    onToggle={(key, enabled) => updatePreference(itinerary.id, 'saved-itinerary', itinerary.route, key, enabled)}
                  />
                </article>
                )
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
