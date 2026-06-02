export const savedItineraryComparisonsStorageKey = 'nonrevy.savedItineraryComparisons'

export type SavedItineraryComparison = {
  id: string
  route: string
  carrier: string
  score: number
  successProbability: number
  riskLevel: string
  connections: number
  totalTravelTime: string
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
