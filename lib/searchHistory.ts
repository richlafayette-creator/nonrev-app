export const searchHistoryStorageKey = 'nonrevy.searchHistory.v1'

export type SearchHistoryItem = {
  id: string
  query: string
  origin?: string
  date?: string
  carrier?: string
  maxLegs?: string
  createdAt: string
}

function storageAvailable() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function loadSearchHistory(): SearchHistoryItem[] {
  if (!storageAvailable()) return []
  try {
    const stored = window.localStorage.getItem(searchHistoryStorageKey)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed)
      ? parsed.filter((item): item is SearchHistoryItem => Boolean(item && typeof item.query === 'string' && typeof item.createdAt === 'string')).slice(0, 10)
      : []
  } catch {
    return []
  }
}

export function saveSearchHistoryItem(input: Omit<SearchHistoryItem, 'id' | 'createdAt'>) {
  if (!storageAvailable()) return []
  const query = normalize(input.query)
  if (!query && !input.origin) return loadSearchHistory()
  const createdAt = new Date().toISOString()
  const id = `${query.toLowerCase()}-${input.origin || ''}-${input.date || ''}-${input.carrier || ''}-${input.maxLegs || ''}`
  const item: SearchHistoryItem = { ...input, query: query || input.origin || 'Airport search', id, createdAt }
  const deduped = loadSearchHistory().filter((historyItem) => historyItem.id !== id)
  const next = [item, ...deduped].slice(0, 10)
  window.localStorage.setItem(searchHistoryStorageKey, JSON.stringify(next))
  window.dispatchEvent(new Event('nonrevy-search-history-updated'))
  return next
}

export function clearSearchHistory() {
  if (!storageAvailable()) return []
  window.localStorage.removeItem(searchHistoryStorageKey)
  window.dispatchEvent(new Event('nonrevy-search-history-updated'))
  return []
}
