import { deliverNotification } from './notificationDelivery'
import { persistWatch, removePersistentWatch } from './persistentTripClient'

export const savedTripWatchlistStorageKey = 'nonrevy.savedTripWatchlist'

export type WatchTargetType = 'flight' | 'route' | 'destination' | 'airport' | 'region' | 'opportunity'

export const watchTargetOptions: Array<{ key: WatchTargetType; label: string; hint: string }> = [
  { key: 'flight', label: 'Flight number', hint: 'UA39' },
  { key: 'route', label: 'Route', hint: 'LAX-HND' },
  { key: 'destination', label: 'Destination', hint: 'HND or Japan' },
  { key: 'airport', label: 'Airport', hint: 'SFO' },
  { key: 'region', label: 'Region', hint: 'Any Japan route' },
  { key: 'opportunity', label: 'Opportunity', hint: 'Any Polaris opportunity' }
]

export type SavedTripWatch = {
  id: string
  watchType?: WatchTargetType
  watchLabel?: string
  watchQuery?: string
  origin: string
  destination: string
  travelDate: string
  carrier: string
  selectedItinerary: string
  score: number
  successProbability: number
  routeConfidenceScore?: number
  confidenceBadge?: string
  confidenceTrend?: string
  lastConfidenceUpdate?: string
  confidenceUpdateExplanation?: string
  riskLevel: string
  connections: number
  totalTravelTime: string
  lastUpdated: string
}

function normalizeWatchQuery(value: string) {
  return value.trim().toUpperCase().replace(/\s+TO\s+/g, ' → ').replace(/\s*-\s*/g, ' → ').replace(/\s+/g, ' ')
}

function routeEndpoints(route: string) {
  const airports = route.toUpperCase().match(/\b[A-Z]{3}\b/g) || []
  return {
    origin: airports[0] || 'TBD',
    destination: airports[airports.length - 1] || 'TBD'
  }
}

export function loadSavedTripWatchlist() {
  if (typeof window === 'undefined') return []

  try {
    const storedWatchlist = window.localStorage.getItem(savedTripWatchlistStorageKey)
    if (!storedWatchlist) return []
    const watchlist = JSON.parse(storedWatchlist)
    return Array.isArray(watchlist) ? watchlist as SavedTripWatch[] : []
  } catch {
    return []
  }
}

export function saveTripWatch(watch: Omit<SavedTripWatch, 'id' | 'origin' | 'destination' | 'lastUpdated'> & Partial<Pick<SavedTripWatch, 'origin' | 'destination'>>) {
  if (typeof window === 'undefined') return null

  const watchType = watch.watchType || 'route'
  const watchQuery = normalizeWatchQuery(watch.watchQuery || watch.selectedItinerary)
  const endpoints = routeEndpoints(watch.selectedItinerary || watchQuery)
  const nextWatch: SavedTripWatch = {
    ...watch,
    watchType,
    watchQuery,
    watchLabel: watch.watchLabel || watchTargetLabel(watchType, watchQuery),
    selectedItinerary: watch.selectedItinerary || watchQuery,
    id: `${watchType}-${watch.carrier}-${watchQuery}-${watch.travelDate || 'flexible'}-${Date.now()}`,
    origin: watch.origin || endpoints.origin,
    destination: watch.destination || endpoints.destination,
    lastUpdated: new Date().toISOString()
  }
  const existing = loadSavedTripWatchlist()
  const deduped = existing.filter((item) =>
    !(
      item.origin === nextWatch.origin &&
      item.destination === nextWatch.destination &&
      item.travelDate === nextWatch.travelDate &&
      item.carrier === nextWatch.carrier &&
      (item.watchType || 'route') === nextWatch.watchType &&
      (item.watchQuery || item.selectedItinerary) === nextWatch.watchQuery &&
      item.selectedItinerary === nextWatch.selectedItinerary
    )
  )
  const watchlist = [nextWatch, ...deduped]
  window.localStorage.setItem(savedTripWatchlistStorageKey, JSON.stringify(watchlist))
  void persistWatch(nextWatch)
  deliverNotification({
    eventType: 'watchlist',
    title: `Watchlist added: ${nextWatch.watchLabel || `${nextWatch.origin} → ${nextWatch.destination}`}`,
    body: `${nextWatch.watchLabel || nextWatch.selectedItinerary} is now watched for ${nextWatch.travelDate || 'flexible dates'} with ${nextWatch.successProbability}% success probability and ${nextWatch.score}/100 score.`,
    targetId: nextWatch.id,
    targetLabel: nextWatch.watchLabel || `${nextWatch.origin} → ${nextWatch.destination}`,
    source: 'watchlist',
    eventKey: `watchlist-added:${nextWatch.id}`,
    details: [
      `Carrier: ${nextWatch.carrier}`,
      `Risk level: ${nextWatch.riskLevel}`,
      `Connections: ${nextWatch.connections}`,
      `Total travel time: ${nextWatch.totalTravelTime}`
    ]
  })
  window.dispatchEvent(new Event('nonrevy-watchlist-updated'))
  return nextWatch
}


export function watchTargetLabel(type: WatchTargetType, query: string) {
  const normalized = normalizeWatchQuery(query)
  if (type === 'flight') return `Flight ${normalized}`
  if (type === 'route') return normalized
  if (type === 'destination') return `Destination ${normalized}`
  if (type === 'airport') return `Airport ${normalized}`
  if (type === 'region') return normalized.toLowerCase().includes('route') ? normalized : `${normalized} routes`
  return normalized.toLowerCase().includes('opportunity') ? normalized : `${normalized} opportunity`
}

export function saveGenericWatch(input: { watchType: WatchTargetType; query: string; travelDate?: string; carrier?: string }) {
  const query = normalizeWatchQuery(input.query)
  if (!query) return null
  const endpoints = routeEndpoints(query)
  return saveTripWatch({
    watchType: input.watchType,
    watchQuery: query,
    watchLabel: watchTargetLabel(input.watchType, query),
    origin: endpoints.origin,
    destination: endpoints.destination,
    travelDate: input.travelDate || 'Flexible',
    carrier: input.carrier || 'All carriers',
    selectedItinerary: query,
    score: 68,
    successProbability: 66,
    riskLevel: 'Medium',
    connections: Math.max(0, (query.match(/→/g) || []).length - 1),
    totalTravelTime: 'Pending schedule data'
  })
}

export function watchMatchesText(watch: SavedTripWatch, text: string) {
  const haystack = normalizeWatchQuery(text)
  const query = normalizeWatchQuery(watch.watchQuery || watch.selectedItinerary || watch.destination || '')
  if (!query) return false
  if ((watch.watchType || 'route') === 'flight') return haystack.replace(/\s/g, '').includes(query.replace(/\s/g, ''))
  if ((watch.watchType || 'route') === 'airport') return Boolean(query.match(/^[A-Z]{3}$/)) && haystack.includes(query)
  if ((watch.watchType || 'route') === 'destination') return haystack.includes(query) || haystack.includes(watch.destination)
  return haystack.includes(query) || query.includes(haystack)
}

export function removeTripWatch(id: string) {
  if (typeof window === 'undefined') return []

  const watchlist = loadSavedTripWatchlist().filter((item) => item.id !== id)
  window.localStorage.setItem(savedTripWatchlistStorageKey, JSON.stringify(watchlist))
  void removePersistentWatch(id)
  window.dispatchEvent(new Event('nonrevy-watchlist-updated'))
  return watchlist
}
