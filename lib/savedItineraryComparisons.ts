import { deliverNotification } from './notificationDelivery'

export const savedItineraryComparisonsStorageKey = 'nonrevy.savedItineraryComparisons'

export type SavedItineraryComparison = {
  id: string
  route: string
  carrier: string
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
  travelDate?: string
  why: string[]
  sourceLabel: string
  savedAt: string
}

export function loadSavedItineraryComparisons() {
  if (typeof window === 'undefined') return []

  try {
    const storedComparisons = window.localStorage.getItem(savedItineraryComparisonsStorageKey)
    if (!storedComparisons) return []
    const comparisons = JSON.parse(storedComparisons)
    return Array.isArray(comparisons) ? comparisons as SavedItineraryComparison[] : []
  } catch {
    return []
  }
}

function routeEndpoints(route: string) {
  const airports = route.toUpperCase().match(/\b[A-Z]{3}\b/g) || []
  return {
    origin: airports[0] || 'TBD',
    destination: airports[airports.length - 1] || 'TBD'
  }
}

function sameMarket(a: string, b: string) {
  const left = routeEndpoints(a)
  const right = routeEndpoints(b)
  return left.origin === right.origin && left.destination === right.destination
}

export function saveItineraryComparison(comparison: Omit<SavedItineraryComparison, 'id' | 'savedAt'>) {
  if (typeof window === 'undefined') return null

  const nextComparison: SavedItineraryComparison = {
    ...comparison,
    id: `${comparison.carrier}-${comparison.route}-${Date.now()}`,
    savedAt: new Date().toISOString()
  }
  const existing = loadSavedItineraryComparisons()
  const deduped = existing.filter((item) => !(item.route === nextComparison.route && item.carrier === nextComparison.carrier))
  const comparisons = [nextComparison, ...deduped]
  window.localStorage.setItem(savedItineraryComparisonsStorageKey, JSON.stringify(comparisons))

  const previousBest = existing
    .filter((item) => sameMarket(item.route, nextComparison.route) && item.id !== nextComparison.id)
    .sort((a, b) => Math.max(b.routeConfidenceScore || 0, b.successProbability, b.score) - Math.max(a.routeConfidenceScore || 0, a.successProbability, a.score))[0]
  const nextScore = Math.max(nextComparison.routeConfidenceScore || 0, nextComparison.successProbability, nextComparison.score)
  const previousScore = previousBest ? Math.max(previousBest.routeConfidenceScore || 0, previousBest.successProbability, previousBest.score) : 0

  deliverNotification({
    eventType: previousBest && nextScore >= previousScore + 4 ? 'better-route-found' : 'watchlist',
    title: previousBest && nextScore >= previousScore + 4 ? `Better itinerary saved: ${nextComparison.route}` : `Itinerary saved: ${nextComparison.route}`,
    body: previousBest && nextScore >= previousScore + 4
      ? `${nextComparison.route} now scores ${nextScore}/100 versus ${previousScore}/100 for ${previousBest.route}.`
      : `${nextComparison.carrier} itinerary saved with ${nextComparison.successProbability}% success probability and ${nextComparison.score}/100 score.`,
    targetId: nextComparison.id,
    targetLabel: nextComparison.route,
    source: previousBest && nextScore >= previousScore + 4 ? 'better-route' : 'watchlist',
    eventKey: `${previousBest && nextScore >= previousScore + 4 ? 'better-itinerary' : 'saved-itinerary'}:${nextComparison.id}`,
    details: [
      `Carrier: ${nextComparison.carrier}`,
      `Risk level: ${nextComparison.riskLevel}`,
      `Connections: ${nextComparison.connections}`,
      `Source: ${nextComparison.sourceLabel}`
    ]
  })
  window.dispatchEvent(new Event('nonrevy-itinerary-comparisons-updated'))
  return nextComparison
}

export function removeSavedItineraryComparison(id: string) {
  if (typeof window === 'undefined') return []

  const comparisons = loadSavedItineraryComparisons().filter((item) => item.id !== id)
  window.localStorage.setItem(savedItineraryComparisonsStorageKey, JSON.stringify(comparisons))
  window.dispatchEvent(new Event('nonrevy-itinerary-comparisons-updated'))
  return comparisons
}

export function clearSavedItineraryComparisons() {
  if (typeof window === 'undefined') return []

  window.localStorage.setItem(savedItineraryComparisonsStorageKey, JSON.stringify([]))
  window.dispatchEvent(new Event('nonrevy-itinerary-comparisons-updated'))
  return []
}
