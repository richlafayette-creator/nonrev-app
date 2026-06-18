import { accountPersistenceFetch } from './accountPersistenceClient'

export const savedSearchesStorageKey = 'nonrevy_saved_searches_v1'

export type SavedSearchKind = 'route-search' | 'ai-trip'

export type SavedSearch = {
  id: string
  label: string
  kind: SavedSearchKind
  query: string
  carrier?: string
  createdAt: string
  updatedAt: string
  lastRunAt?: string
  runCount: number
}

function storageAvailable() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function normalizeQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function defaultLabel(query: string, kind: SavedSearchKind) {
  const prefix = kind === 'ai-trip' ? 'AI trip' : 'Route search'
  const shortQuery = normalizeQuery(query).slice(0, 42)
  return `${prefix}: ${shortQuery || 'Untitled'}`
}

function stableSearchId(kind: SavedSearchKind, query: string, carrier?: string) {
  const base = `${kind}:${normalizeQuery(query).toLowerCase()}:${carrier || ''}`
  let hash = 0
  for (let index = 0; index < base.length; index += 1) {
    hash = ((hash << 5) - hash + base.charCodeAt(index)) | 0
  }
  return `saved-search-${Math.abs(hash)}`
}

export function loadSavedSearches(): SavedSearch[] {
  if (!storageAvailable()) return []
  try {
    const stored = window.localStorage.getItem(savedSearchesStorageKey)
    const parsed = stored ? JSON.parse(stored) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is SavedSearch => Boolean(item && typeof item === 'object' && typeof item.query === 'string' && typeof item.kind === 'string'))
      .map((item) => ({
        ...item,
        label: item.label || defaultLabel(item.query, item.kind),
        runCount: typeof item.runCount === 'number' ? item.runCount : 0,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
      }))
  } catch {
    return []
  }
}

function persistSavedSearches(searches: SavedSearch[]) {
  if (!storageAvailable()) return searches
  const saved = searches
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))
    .slice(0, 25)
  window.localStorage.setItem(savedSearchesStorageKey, JSON.stringify(saved))
  window.dispatchEvent(new Event('nonrevy-saved-searches-updated'))
  return saved
}

function mergeSavedSearches(searches: SavedSearch[]) {
  const merged = new Map<string, SavedSearch>()
  searches
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))
    .forEach((search) => {
      if (!merged.has(search.id)) merged.set(search.id, search)
    })
  return [...merged.values()].slice(0, 25)
}

export function saveSavedSearch(input: { query: string; kind: SavedSearchKind; carrier?: string; label?: string }): SavedSearch | null {
  if (!storageAvailable()) return null
  const query = normalizeQuery(input.query)
  if (!query) return null

  const now = new Date().toISOString()
  const id = stableSearchId(input.kind, query, input.carrier)
  const existing = loadSavedSearches()
  const previous = existing.find((item) => item.id === id)
  const next: SavedSearch = {
    id,
    kind: input.kind,
    query,
    carrier: input.carrier,
    label: input.label?.trim() || previous?.label || defaultLabel(query, input.kind),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    lastRunAt: previous?.lastRunAt,
    runCount: previous?.runCount || 0
  }

  persistSavedSearches([next, ...existing.filter((item) => item.id !== id)])
  void syncSavedSearch(next)
  return next
}

export function removeSavedSearch(id: string) {
  if (!storageAvailable()) return []
  const searches = persistSavedSearches(loadSavedSearches().filter((item) => item.id !== id))
  void accountPersistenceFetch<{ removed?: boolean }>(`/api/saved-searches/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return searches
}

export function markSavedSearchRun(id: string) {
  if (!storageAvailable()) return null
  const now = new Date().toISOString()
  let updatedSearch: SavedSearch | null = null
  const searches = loadSavedSearches().map((item) => {
    if (item.id !== id) return item
    updatedSearch = {
      ...item,
      lastRunAt: now,
      updatedAt: now,
      runCount: item.runCount + 1
    }
    return updatedSearch
  })
  persistSavedSearches(searches)
  if (updatedSearch) void syncSavedSearch(updatedSearch)
  return updatedSearch
}

export async function syncSavedSearch(search: SavedSearch) {
  return accountPersistenceFetch<{ search?: SavedSearch; searches?: SavedSearch[]; storageMode?: string; status?: string; detail?: string }>('/api/saved-searches', {
    method: 'POST',
    body: JSON.stringify({ search })
  })
}

export async function syncSavedSearches() {
  const localSearches = loadSavedSearches()
  const result = await accountPersistenceFetch<{ searches?: SavedSearch[]; storageMode?: string; status?: string; detail?: string }>('/api/saved-searches', {
    method: 'POST',
    body: JSON.stringify({ searches: localSearches })
  })
  const merged = persistSavedSearches(mergeSavedSearches([...(result?.searches || []), ...localSearches]))
  return { searches: merged, storageMode: result?.storageMode || 'local-fallback', status: result?.status || 'local-fallback', detail: result?.detail || 'Local saved search fallback is active.' }
}

export function savedSearchRunUrl(search: SavedSearch) {
  if (search.kind === 'ai-trip') return `/plan?aiTrip=${encodeURIComponent(search.query)}`
  const params = new URLSearchParams({ q: search.query })
  if (search.carrier && search.carrier !== 'all') params.set('carrier', search.carrier)
  return `/plan?${params.toString()}`
}
