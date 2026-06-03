export const savedTripWatchlistStorageKey = 'nonrevy.savedTripWatchlist'

export type SavedTripWatch = {
  id: string
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

  const endpoints = routeEndpoints(watch.selectedItinerary)
  const nextWatch: SavedTripWatch = {
    ...watch,
    id: `${watch.carrier}-${watch.selectedItinerary}-${watch.travelDate || 'flexible'}-${Date.now()}`,
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
      item.selectedItinerary === nextWatch.selectedItinerary
    )
  )
  const watchlist = [nextWatch, ...deduped]
  window.localStorage.setItem(savedTripWatchlistStorageKey, JSON.stringify(watchlist))
  window.dispatchEvent(new Event('nonrevy-watchlist-updated'))
  return nextWatch
}

export function removeTripWatch(id: string) {
  if (typeof window === 'undefined') return []

  const watchlist = loadSavedTripWatchlist().filter((item) => item.id !== id)
  window.localStorage.setItem(savedTripWatchlistStorageKey, JSON.stringify(watchlist))
  window.dispatchEvent(new Event('nonrevy-watchlist-updated'))
  return watchlist
}
