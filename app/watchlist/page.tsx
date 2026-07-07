'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { removeTripWatch, loadSavedTripWatchlist, saveGenericWatch, saveTripWatch, watchTargetOptions, type SavedTripWatch, type WatchTargetType } from '../../lib/watchlist'
import { syncPersistentWatchlist } from '../../lib/persistentTripClient'
import { loadSavedItineraryComparisons, type SavedItineraryComparison } from '../../lib/savedItineraryComparisons'
import { loadLoadReports, loadReportSignal, type LoadReport } from '../../lib/loadReports'
import { buildDisruptionIntelligence } from '../../lib/disruptionIntelligence'
import { calculateRouteConfidence, confidenceBadgeColor, confidenceTrendColor, confidenceUpdateTriggerLabel, type ConfidenceUpdateTrigger, type RouteConfidence } from '../../lib/routeConfidence'
import { defaultTravelerProfile, loadTravelerProfileFromStorage, type TravelerProfileScaffold } from '../../lib/travelerProfile'
import { loadTripOutcomes, type TripOutcome } from '../../lib/tripOutcomes'
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
  if (value >= 80) return 'var(--color-green-500)'
  if (value >= 70) return 'var(--color-sky-400)'
  if (value >= 60) return 'var(--color-yellow-400)'
  return 'var(--color-red-400)'
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

function routeMatchesRoute(reportOrOutcomeRoute: string, selectedRoute: string) {
  const normalizedSource = normalizeRoute(reportOrOutcomeRoute)
  const normalizedSelected = normalizeRoute(selectedRoute)
  return normalizedSource === normalizedSelected || normalizedSelected.includes(normalizedSource) || normalizedSource.includes(normalizedSelected)
}

function outcomeSuccessRate(outcomes: TripOutcome[], fallback: number) {
  if (!outcomes.length) return fallback
  const successful = outcomes.filter((outcome) => outcome.status === 'Yes, got on').length
  return Math.round((successful / outcomes.length) * 100)
}

function confidenceForRoute(route: SavedTripWatch | SavedItineraryComparison, travelerProfile: TravelerProfileScaffold, loadReports: LoadReport[] = [], outcomes: TripOutcome[] = [], updateTrigger: ConfidenceUpdateTrigger = 'watchlist-viewed'): RouteConfidence {
  const selectedRoute = 'selectedItinerary' in route ? route.selectedItinerary : route.route
  const disruption = buildDisruptionIntelligence({ route: selectedRoute })
  const matchingReports = loadReports.filter((report) => routeMatchesRoute(report.route, selectedRoute))
  const matchingOutcomes = outcomes.filter((outcome) => routeMatchesRoute(outcome.route, selectedRoute))
  const loadAdjustment = Math.max(-8, Math.min(8, matchingReports.reduce((total, report) => total + loadReportSignal(report), 0)))
  return calculateRouteConfidence({
    route: selectedRoute,
    successProbability: outcomeSuccessRate(matchingOutcomes, route.successProbability),
    historicalScore: route.score,
    historicalSuccessRate: route.successProbability,
    historicalReportCount: 0,
    communityReportCount: matchingReports.length,
    communityLoadAdjustment: loadAdjustment,
    travelerProfile,
    disruption,
    previousConfidenceScore: 'routeConfidenceScore' in route ? route.routeConfidenceScore : undefined,
    updateTrigger
  })
}

function AlertPreferenceChecklist({ preference, onToggle }: { preference: TripAlertPreference; onToggle: (key: TripAlertPreferenceKey, enabled: boolean) => void }) {
  return (
    <div style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)', marginTop: 14 }}>
      <strong style={{ color: 'var(--color-pink-400)' }}>Alert preferences</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 10 }}>
        {tripAlertPreferenceOptions.map((option) => (
          <label key={option.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--color-slate-800)', borderRadius: 12, padding: 10, color: 'var(--color-slate-300)' }}>
            <input
              type="checkbox"
              checked={preference.flags[option.key]}
              onChange={(event) => onToggle(option.key, event.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ display: 'block', color: 'var(--color-slate-50)', fontWeight: 'bold' }}>{option.label}</span>
              <small style={{ color: 'var(--color-slate-400)' }}>{option.description}</small>
            </span>
          </label>
        ))}
      </div>
      <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>
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
  const [loadReports, setLoadReports] = useState<LoadReport[]>([])
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])
  const [confidenceUpdateTrigger, setConfidenceUpdateTrigger] = useState<ConfidenceUpdateTrigger>('watchlist-viewed')
  const [watchType, setWatchType] = useState<WatchTargetType>('route')
  const [routeText, setRouteText] = useState('')
  const [travelDate, setTravelDate] = useState('')
  const [carrier, setCarrier] = useState('United')
  const [saveStatus, setSaveStatus] = useState('Saved trip watchlist syncs across signed-in devices when Supabase persistence is configured.')

  useEffect(() => {
    function refreshWatchlist(trigger: ConfidenceUpdateTrigger = 'watchlist-viewed') {
      setConfidenceUpdateTrigger(trigger)
      setWatchlist(loadSavedTripWatchlist())
      setSavedItineraries(loadSavedItineraryComparisons())
      setAlertPreferences(loadTripAlertPreferences())
      setTravelerProfile(loadTravelerProfileFromStorage())
      setLoadReports(loadLoadReports())
      setOutcomes(loadTripOutcomes())
    }

    refreshWatchlist()
    syncPersistentWatchlist(loadSavedTripWatchlist()).then((syncedWatchlist) => {
      setWatchlist(syncedWatchlist)
      if (syncedWatchlist.length) setSaveStatus('Watchlist synced for this device.')
    })
    const refreshForViewed = () => refreshWatchlist('watchlist-viewed')
    const refreshForWeather = () => refreshWatchlist('weather-risk-changed')
    const refreshForDisruption = () => refreshWatchlist('disruption-status-changed')
    const refreshForLoadReports = () => refreshWatchlist('community-load-report-updated')
    const refreshForOutcomes = () => refreshWatchlist('outcome-history-changed')

    window.addEventListener('nonrevy-watchlist-updated', refreshForViewed)
    window.addEventListener('nonrevy-itinerary-comparisons-updated', refreshForViewed)
    window.addEventListener('nonrevy-trip-alert-preferences-updated', refreshForViewed)
    window.addEventListener('nonrevy-weather-risk-updated', refreshForWeather)
    window.addEventListener('nonrevy-disruption-status-updated', refreshForDisruption)
    window.addEventListener('nonrevy-load-reports-updated', refreshForLoadReports)
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshForOutcomes)
    window.addEventListener('storage', refreshForViewed)
    return () => {
      window.removeEventListener('nonrevy-watchlist-updated', refreshForViewed)
      window.removeEventListener('nonrevy-itinerary-comparisons-updated', refreshForViewed)
      window.removeEventListener('nonrevy-trip-alert-preferences-updated', refreshForViewed)
      window.removeEventListener('nonrevy-weather-risk-updated', refreshForWeather)
      window.removeEventListener('nonrevy-disruption-status-updated', refreshForDisruption)
      window.removeEventListener('nonrevy-load-reports-updated', refreshForLoadReports)
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshForOutcomes)
      window.removeEventListener('storage', refreshForViewed)
    }
  }, [])

  const summary = useMemo(() => {
    const averageScore = watchlist.length ? Math.round(watchlist.reduce((total, route) => total + route.score, 0) / watchlist.length) : 0
    const averageProbability = watchlist.length ? Math.round(watchlist.reduce((total, route) => total + route.successProbability, 0) / watchlist.length) : 0
    const averageConfidence = watchlist.length ? Math.round(watchlist.reduce((total, route) => total + confidenceForRoute(route, travelerProfile, loadReports, outcomes, confidenceUpdateTrigger).score, 0) / watchlist.length) : 0
    const enabledAlertCount = alertPreferences.reduce((total, preference) => total + Object.values(preference.flags).filter(Boolean).length, 0)
    return { averageScore, averageProbability, averageConfidence, enabledAlertCount }
  }, [watchlist, alertPreferences, travelerProfile, loadReports, outcomes, confidenceUpdateTrigger])

  function addRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const selectedItinerary = watchType === 'route' ? normalizeRoute(routeText) : routeText.trim().toUpperCase().replace(/\s+/g, ' ')
    if (!selectedItinerary) return

    if (watchType !== 'route') {
      const saved = saveGenericWatch({ watchType, query: selectedItinerary, travelDate: travelDate || 'Flexible', carrier })
      if (saved) {
        setWatchlist(loadSavedTripWatchlist())
        setSaveStatus(`Watching ${saved.watchLabel || saved.selectedItinerary}.`)
        setRouteText('')
        setTravelDate('')
      }
      return
    }

    const endpoints = routeEndpoints(selectedItinerary)
    const routeConfidence = confidenceForRoute({
      id: 'draft',
      watchType,
      watchQuery: selectedItinerary,
      watchLabel: selectedItinerary,
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
    }, travelerProfile, loadReports, outcomes, 'watchlist-viewed')
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
      lastConfidenceUpdate: routeConfidence.lastUpdated,
      confidenceUpdateExplanation: routeConfidence.updateExplanation,
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
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Flights</a>
        <a href="/best-routes" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Best Routes</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/intelligence" style={{ marginRight: 16, color: 'var(--color-purple-400)' }}>Intelligence</a>
        <a href="/reminders" style={{ marginRight: 16, color: 'var(--color-pink-400)' }}>Reminders</a>
        <a href="/agent" style={{ color: 'var(--color-violet-400)' }}>Agent</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-yellow-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Saved trip watchlists</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Route Watchlist</h1>
        <p style={{ color: 'var(--color-slate-400)', fontSize: 18, maxWidth: 780 }}>
          Watch flight numbers, routes, destinations, airports, regions, or premium-cabin opportunities so NONREVY has something useful to monitor even when you are not actively searching.
        </p>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {[
            ['Saved Routes', watchlist.length, 'var(--color-sky-400)'],
            ['Avg Current Score', summary.averageScore, 'var(--color-yellow-400)'],
            ['Avg Success Probability', `${summary.averageProbability}%`, 'var(--color-green-500)'],
            ['Avg Route Confidence', `${summary.averageConfidence}/100`, summary.averageConfidence >= 72 ? 'var(--color-sky-400)' : summary.averageConfidence >= 58 ? 'var(--color-yellow-400)' : 'var(--color-red-400)'],
            ['Enabled Alerts', summary.enabledAlertCount, 'var(--color-pink-400)']
          ].map(([label, value, color]) => (
            <article key={label} className="mini-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
              <strong style={{ color: String(color), fontSize: 32 }}>{value}</strong>
              <h2 style={{ fontSize: 18, marginBottom: 0 }}>{label}</h2>
            </article>
          ))}
        </section>

        <form onSubmit={addRoute} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 24 }}>
          <label style={{ color: 'var(--color-slate-300)' }}>
            Watch type
            <select
              value={watchType}
              onChange={(event) => setWatchType(event.target.value as WatchTargetType)}
              style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
            >
              {watchTargetOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <label style={{ color: 'var(--color-slate-300)' }}>
            Watch target
            <input
              value={routeText}
              onChange={(event) => setRouteText(event.target.value)}
              placeholder={watchTargetOptions.find((option) => option.key === watchType)?.hint || 'LAX-HND'}
              style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
            />
          </label>
          <label style={{ color: 'var(--color-slate-300)' }}>
            Travel date
            <input
              type="date"
              value={travelDate}
              onChange={(event) => setTravelDate(event.target.value)}
              style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
            />
          </label>
          <label style={{ color: 'var(--color-slate-300)' }}>
            Carrier
            <select
              value={carrier}
              onChange={(event) => setCarrier(event.target.value)}
              style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
            >
              <option>United</option>
              <option>Delta</option>
              <option>Alaska Group</option>
            </select>
          </label>
          <button type="submit" style={{ alignSelf: 'end', padding: '14px 18px', borderRadius: 12, border: 'none', background: 'var(--color-yellow-400)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
            Add watch
          </button>
        </form>
        <p style={{ color: 'var(--color-slate-400)' }}>{saveStatus}</p>

        <div style={{ display: 'grid', gap: 14, marginTop: 24 }}>
          <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 16, background: 'var(--color-slate-950)' }}>
            <strong style={{ color: 'var(--color-sky-400)' }}>Watchlist Center examples</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {['UA39', 'LAX-HND', 'Any Japan route', 'HND airport', 'Any Polaris opportunity'].map((example) => (
                <button key={example} type="button" onClick={() => setRouteText(example)} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 999, padding: '8px 10px', background: 'var(--color-slate-850)', color: 'var(--color-slate-300)', fontWeight: 'bold' }}>{example}</button>
              ))}
            </div>
          </section>
          {watchlist.length === 0 && (
            <article className="flight-card" style={{ background: 'var(--color-slate-850)', border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18 }}>
              <h2 style={{ marginTop: 0 }}>No watched routes yet</h2>
              <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>
                Add one here or use the Watch button on the itinerary comparison cards in the planner.
              </p>
            </article>
          )}
          {watchlist.map((route) => {
            const routeConfidence = confidenceForRoute(route, travelerProfile, loadReports, outcomes, confidenceUpdateTrigger)
            return (
            <article key={route.id} className="flight-card" style={{ background: 'var(--color-slate-850)', border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ color: 'var(--color-yellow-400)', textTransform: 'uppercase', letterSpacing: 1 }}>{route.watchType || 'route'} watch · {route.carrier}</strong>
                  <h2 style={{ margin: '8px 0', color: 'var(--color-slate-50)' }}>{route.watchLabel || `${route.origin} → ${route.destination}`}</h2>
                  <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', margin: '6px 0' }}>{route.selectedItinerary}</p>
                  <p style={{ color: 'var(--color-slate-400)', margin: 0 }}>Travel date: {route.travelDate} · Last updated: {new Date(route.lastUpdated).toLocaleString()}</p>
                </div>
                <button type="button" onClick={() => removeWatch(route.id)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--color-red-400)', background: 'var(--color-slate-800)', color: 'var(--color-red-200)', fontWeight: 'bold' }}>
                  Remove
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 14 }}>
                {[
                  ['Current score', route.score, metricColor(route.score)],
                  ['Success probability', `${route.successProbability}%`, metricColor(route.successProbability)],
                  ['Route confidence', `${routeConfidence.score}/100 · ${routeConfidence.badge}`, confidenceBadgeColor(routeConfidence.badge)],
                  ['Confidence trend', routeConfidence.trend, confidenceTrendColor(routeConfidence.trend)],
                  ['Last confidence update', new Date(routeConfidence.lastUpdated).toLocaleString(), 'var(--color-slate-400)'],
                  ['Risk level', route.riskLevel, route.riskLevel.includes('Low') ? 'var(--color-green-500)' : route.riskLevel.includes('Medium') ? 'var(--color-yellow-400)' : 'var(--color-red-400)'],
                  ['Connections', route.connections, route.connections === 0 ? 'var(--color-green-500)' : 'var(--color-yellow-400)'],
                  ['Travel time', route.totalTravelTime, 'var(--color-sky-400)']
                ].map(([label, value, color]) => (
                  <div key={`${route.id}-${label}`} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 12, padding: 10, background: 'var(--color-slate-950)' }}>
                    <small style={{ color: 'var(--color-slate-400)' }}>{label}</small>
                    <p style={{ margin: '4px 0 0', color: String(color), fontWeight: 'bold' }}>{value}</p>
                  </div>
                ))}
              </div>
              <p style={{ color: 'var(--color-slate-300)', margin: '12px 0 0' }}>{routeConfidence.updateExplanation}</p>
              <p style={{ color: 'var(--color-slate-400)', margin: '6px 0 0' }}>Update trigger: {confidenceUpdateTriggerLabel(routeConfidence.updateTrigger)}</p>
              <AlertPreferenceChecklist
                preference={preferenceFor(route.id, 'watched-route', route.watchLabel || `${route.origin} → ${route.destination}`)}
                onToggle={(key, enabled) => updatePreference(route.id, 'watched-route', route.watchLabel || `${route.origin} → ${route.destination}`, key, enabled)}
              />
            </article>
            )
          })}
        </div>

        <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginTop: 28 }}>
          <p style={{ color: 'var(--color-pink-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Saved itinerary alert preferences</p>
          <h2 style={{ margin: '8px 0' }}>Alerts for saved itinerary comparisons</h2>
          <p style={{ color: 'var(--color-slate-400)' }}>
            These preferences apply to itinerary options saved from /plan. Watchlist alerts are persisted when Supabase sync is configured.
          </p>
          {savedItineraries.length === 0 ? (
            <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)' }}>
              <p style={{ color: 'var(--color-slate-300)', margin: 0 }}>No saved itinerary comparisons yet. Save options from /plan to configure itinerary-specific alerts.</p>
            </article>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {savedItineraries.map((itinerary) => {
                const routeConfidence = confidenceForRoute(itinerary, travelerProfile, loadReports, outcomes, confidenceUpdateTrigger)
                return (
                <article key={itinerary.id} className="flight-card" style={{ background: 'var(--color-slate-950)', border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ color: 'var(--color-purple-400)', textTransform: 'uppercase', letterSpacing: 1 }}>{itinerary.sourceLabel}</strong>
                      <h3 style={{ color: 'var(--color-slate-50)', margin: '8px 0' }}>{itinerary.route}</h3>
                      <p style={{ color: 'var(--color-slate-400)', margin: 0 }}>{itinerary.carrier} · Score {itinerary.score} · Success {itinerary.successProbability}% · Confidence {routeConfidence.score}/100</p>
                      <p style={{ color: 'var(--color-slate-400)', margin: '6px 0 0' }}>Last confidence update: {new Date(routeConfidence.lastUpdated).toLocaleString()}</p>
                      <p style={{ color: 'var(--color-slate-300)', margin: '6px 0 0' }}>{routeConfidence.updateExplanation}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'inline-block', border: `1px solid ${confidenceBadgeColor(routeConfidence.badge)}`, borderRadius: 999, padding: '5px 9px', color: confidenceBadgeColor(routeConfidence.badge), fontWeight: 'bold', marginBottom: 8 }}>
                        {routeConfidence.badge} · {routeConfidence.trend}
                      </span>
                      <br />
                      <a href="/plan" style={{ color: 'var(--color-sky-400)', fontWeight: 'bold' }}>Open planner</a>
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
