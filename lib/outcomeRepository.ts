import { accountPersistenceFetch } from './accountPersistenceClient'
import { supabase } from './supabase'
import { defaultTravelerProfile, loadTravelerProfileFromStorage, type TravelerProfileScaffold } from './travelerProfile'

export const tripOutcomeStorageKey = 'nonrevy.tripOutcomes'
export const tripOutcomeDatabaseMirrorStorageKey = 'nonrevy.tripOutcomes.databaseMirror'
export const tripOutcomeRepositoryHealthStorageKey = 'nonrevy.tripOutcomes.repositoryHealth'

export type OutcomeSource = 'Local' | 'Database'
export type TripOutcomeStatus = 'Yes, got on' | 'No, did not get on' | 'Cancelled trip'
export type TripOutcomeSubjectType = 'route-recommendation' | 'saved-itinerary' | 'outcome-reminder'

export type TripOutcome = {
  id: string
  subjectType: TripOutcomeSubjectType
  subjectId: string
  title: string
  route: string
  routeOutcome: 'Route outcome'
  status: TripOutcomeStatus
  success: boolean | null
  cancelled: boolean
  notes: string
  timestamp: string
  createdAt: string
  travelerProfileSnapshot: TravelerProfileScaffold
  source: OutcomeSource
}

export type CreateTripOutcomeInput = Omit<TripOutcome, 'id' | 'createdAt' | 'timestamp' | 'routeOutcome' | 'success' | 'cancelled' | 'source' | 'travelerProfileSnapshot'> & {
  travelerProfileSnapshot?: TravelerProfileScaffold
}

export type OutcomeRepository = {
  source: OutcomeSource
  isAvailable: () => boolean
  list: () => TripOutcome[]
  create: (outcome: CreateTripOutcomeInput) => TripOutcome | null
}

export type OutcomeRepositoryDiagnostics = {
  activeSource: OutcomeSource
  localFallbackEnabled: boolean
  databaseReady: boolean
  databaseConfigured: boolean
  localOutcomeCount: number
  databaseOutcomeCount: number
  mergedOutcomeCount: number
  migrationPendingCount: number
  migrationCompletedCount: number
  lastSyncAt?: string
  lastSyncStatus: 'idle' | 'synced' | 'syncing' | 'error' | 'fallback'
  lastError?: string
  detail: string
}

type TripOutcomeDatabaseRow = {
  id: string
  user_id: string | null
  subject_type: TripOutcomeSubjectType
  subject_id: string
  title: string
  route: string
  route_outcome: 'Route outcome'
  status: TripOutcomeStatus
  success: boolean | null
  cancelled: boolean
  notes: string
  traveler_profile_snapshot: TravelerProfileScaffold
  source: OutcomeSource
  occurred_at: string
  created_at: string
  updated_at?: string
}

type OutcomeRepositoryHealthRecord = {
  lastSyncAt?: string
  lastSyncStatus: 'idle' | 'synced' | 'syncing' | 'error' | 'fallback'
  lastError?: string
  migrationCompletedFingerprints: string[]
}

export const tripOutcomeStatuses: TripOutcomeStatus[] = [
  'Yes, got on',
  'No, did not get on',
  'Cancelled trip'
]

let syncInFlight = false
let lastAutoSyncStartedAt = 0

function isBrowser() {
  return typeof window !== 'undefined'
}

function statusToSuccess(status: TripOutcomeStatus) {
  if (status === 'Yes, got on') return true
  if (status === 'No, did not get on') return false
  return null
}

function normalizeTravelerSnapshot(snapshot?: TravelerProfileScaffold): TravelerProfileScaffold {
  if (snapshot) return snapshot
  if (isBrowser()) return loadTravelerProfileFromStorage()
  return defaultTravelerProfile
}

function safeParseArray<T>(storageKey: string): T[] {
  if (!isBrowser()) return []
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function readHealth(): OutcomeRepositoryHealthRecord {
  if (!isBrowser()) return { lastSyncStatus: 'idle', migrationCompletedFingerprints: [] }
  try {
    const stored = window.localStorage.getItem(tripOutcomeRepositoryHealthStorageKey)
    if (!stored) return { lastSyncStatus: 'idle', migrationCompletedFingerprints: [] }
    const parsed = JSON.parse(stored) as Partial<OutcomeRepositoryHealthRecord>
    return {
      lastSyncAt: parsed.lastSyncAt,
      lastSyncStatus: parsed.lastSyncStatus || 'idle',
      lastError: parsed.lastError,
      migrationCompletedFingerprints: Array.isArray(parsed.migrationCompletedFingerprints) ? parsed.migrationCompletedFingerprints : []
    }
  } catch {
    return { lastSyncStatus: 'idle', migrationCompletedFingerprints: [] }
  }
}

function writeHealth(patch: Partial<OutcomeRepositoryHealthRecord>) {
  if (!isBrowser()) return readHealth()
  const next = { ...readHealth(), ...patch }
  window.localStorage.setItem(tripOutcomeRepositoryHealthStorageKey, JSON.stringify(next))
  window.dispatchEvent(new Event('nonrevy-trip-outcome-health-updated'))
  return next
}

function databaseConfigured() {
  return isBrowser()
}

export function normalizeTripOutcome(outcome: Partial<TripOutcome> & CreateTripOutcomeInput): TripOutcome {
  const timestamp = outcome.timestamp || outcome.createdAt || new Date().toISOString()
  const status = outcome.status || 'Cancelled trip'
  return {
    id: outcome.id || `${outcome.subjectType}-${outcome.subjectId}-${Date.now()}`,
    subjectType: outcome.subjectType,
    subjectId: outcome.subjectId,
    title: outcome.title,
    route: outcome.route,
    routeOutcome: 'Route outcome',
    status,
    success: typeof outcome.success === 'boolean' ? outcome.success : statusToSuccess(status),
    cancelled: typeof outcome.cancelled === 'boolean' ? outcome.cancelled : status === 'Cancelled trip',
    notes: outcome.notes || '',
    timestamp,
    createdAt: timestamp,
    travelerProfileSnapshot: normalizeTravelerSnapshot(outcome.travelerProfileSnapshot),
    source: outcome.source || 'Local'
  }
}

function outcomeFingerprint(outcome: Pick<TripOutcome, 'subjectType' | 'subjectId' | 'route' | 'status' | 'createdAt' | 'title'>) {
  return [outcome.subjectType, outcome.subjectId, outcome.route, outcome.status, outcome.createdAt, outcome.title]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('|')
}

function mergeOutcomeLists(databaseOutcomes: TripOutcome[], localOutcomes: TripOutcome[]) {
  const seen = new Set<string>()
  const merged: TripOutcome[] = []

  databaseOutcomes.forEach((outcome) => {
    const fingerprint = outcomeFingerprint(outcome)
    if (seen.has(fingerprint)) return
    seen.add(fingerprint)
    merged.push(outcome)
  })

  localOutcomes.forEach((outcome) => {
    const fingerprint = outcomeFingerprint(outcome)
    if (seen.has(fingerprint)) return
    seen.add(fingerprint)
    merged.push(outcome)
  })

  return merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

function mapDatabaseRow(row: TripOutcomeDatabaseRow): TripOutcome {
  return normalizeTripOutcome({
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    title: row.title,
    route: row.route,
    status: row.status,
    success: row.success,
    cancelled: row.cancelled,
    notes: row.notes,
    timestamp: row.occurred_at || row.created_at,
    createdAt: row.created_at || row.occurred_at,
    travelerProfileSnapshot: row.traveler_profile_snapshot,
    source: 'Database'
  })
}

function mapOutcomeToInsert(outcome: TripOutcome, userId: string | null) {
  return {
    user_id: userId,
    subject_type: outcome.subjectType,
    subject_id: outcome.subjectId,
    title: outcome.title,
    route: outcome.route,
    route_outcome: 'Route outcome',
    status: outcome.status,
    success: outcome.success,
    cancelled: outcome.cancelled,
    notes: outcome.notes,
    traveler_profile_snapshot: outcome.travelerProfileSnapshot,
    source: 'Database',
    occurred_at: outcome.timestamp,
    created_at: outcome.createdAt
  }
}

class LocalOutcomeRepository implements OutcomeRepository {
  source: OutcomeSource = 'Local'

  isAvailable() {
    return isBrowser()
  }

  list() {
    return safeParseArray<TripOutcome>(tripOutcomeStorageKey)
      .map((outcome) => normalizeTripOutcome({ ...outcome, source: 'Local' } as TripOutcome))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  create(outcome: CreateTripOutcomeInput) {
    if (!this.isAvailable()) return null

    const nextOutcome = normalizeTripOutcome({
      ...outcome,
      id: `${outcome.subjectType}-${outcome.subjectId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: 'Local'
    })
    const outcomes = [nextOutcome, ...this.list()]
    window.localStorage.setItem(tripOutcomeStorageKey, JSON.stringify(outcomes))
    window.dispatchEvent(new Event('nonrevy-trip-outcomes-updated'))
    return nextOutcome
  }
}

class DatabaseOutcomeRepository implements OutcomeRepository {
  source: OutcomeSource = 'Database'

  isAvailable() {
    return isBrowser() && databaseConfigured()
  }

  list() {
    if (!this.isAvailable()) return []
    return safeParseArray<TripOutcome>(tripOutcomeDatabaseMirrorStorageKey)
      .map((outcome) => normalizeTripOutcome({ ...outcome, source: 'Database' } as TripOutcome))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  create(outcome: CreateTripOutcomeInput) {
    if (!this.isAvailable()) return null

    const nextOutcome = normalizeTripOutcome({
      ...outcome,
      id: `pending-database-${outcome.subjectType}-${outcome.subjectId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: 'Database'
    })
    persistDatabaseMirror(mergeOutcomeLists([nextOutcome], this.list()))
    window.dispatchEvent(new Event('nonrevy-trip-outcomes-updated'))
    void syncOutcomeRepository({ reason: 'create', optimisticOutcome: nextOutcome })
    return nextOutcome
  }
}

export const localOutcomeRepository = new LocalOutcomeRepository()
export const databaseOutcomeRepository = new DatabaseOutcomeRepository()

function persistDatabaseMirror(outcomes: TripOutcome[]) {
  if (!isBrowser()) return []
  const normalized = outcomes
    .map((outcome) => normalizeTripOutcome({ ...outcome, source: 'Database' } as TripOutcome))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  window.localStorage.setItem(tripOutcomeDatabaseMirrorStorageKey, JSON.stringify(normalized))
  return normalized
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getUser()
    return data.user?.id || null
  } catch {
    return null
  }
}

async function insertOutcomeToDatabase(outcome: TripOutcome, userId: string | null) {
  const payload = mapOutcomeToInsert(outcome, userId)
  const { error } = await supabase.from('trip_outcomes').insert(payload)
  if (error) throw error
}

async function fetchDatabaseOutcomes(userId: string | null) {
  let query = supabase
    .from('trip_outcomes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (userId) query = query.eq('user_id', userId)
  else query = query.is('user_id', null)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map((row) => mapDatabaseRow(row as TripOutcomeDatabaseRow))
}

export function activeOutcomeRepository(): OutcomeRepository {
  return databaseOutcomeRepository.isAvailable() ? databaseOutcomeRepository : localOutcomeRepository
}

export function loadTripOutcomesFromRepository() {
  if (databaseOutcomeRepository.isAvailable()) {
    maybeSyncOutcomeRepository()
    return mergeOutcomeLists(databaseOutcomeRepository.list(), localOutcomeRepository.list())
  }
  return localOutcomeRepository.list()
}

export function saveTripOutcomeToRepository(outcome: CreateTripOutcomeInput) {
  const localOutcome = localOutcomeRepository.create(outcome)
  if (databaseOutcomeRepository.isAvailable()) {
    if (localOutcome) void syncOutcomeRepository({ reason: 'create', optimisticOutcome: { ...localOutcome, source: 'Database' } })
    return localOutcome
  }
  return localOutcome
}

export function maybeSyncOutcomeRepository() {
  if (!databaseOutcomeRepository.isAvailable()) {
    writeHealth({ lastSyncStatus: 'fallback', lastError: databaseConfigured() ? undefined : 'Supabase environment variables are not configured.' })
    return
  }
  const now = Date.now()
  if (syncInFlight || now - lastAutoSyncStartedAt < 30_000) return
  lastAutoSyncStartedAt = now
  void syncOutcomeRepository({ reason: 'auto' })
}

export async function syncOutcomeRepository(options: { reason?: 'auto' | 'manual' | 'create'; optimisticOutcome?: TripOutcome } = {}) {
  if (!databaseOutcomeRepository.isAvailable()) {
    writeHealth({ lastSyncAt: new Date().toISOString(), lastSyncStatus: 'fallback', lastError: 'Database repository is not configured; local fallback is active.' })
    return outcomeRepositoryDiagnostics()
  }
  if (syncInFlight) return outcomeRepositoryDiagnostics()

  syncInFlight = true
  writeHealth({ lastSyncStatus: 'syncing', lastError: undefined })

  try {
    const localOutcomes = localOutcomeRepository.list()
    const optimistic = options.optimisticOutcome ? [options.optimisticOutcome] : []
    const candidates = mergeOutcomeLists(optimistic, localOutcomes)
    const result = await accountPersistenceFetch<{ outcomes?: TripOutcome[]; storageMode?: string; status?: string; detail?: string }>('/api/outcomes', {
      method: 'POST',
      body: JSON.stringify({ outcomes: candidates })
    })
    if (!result || result.storageMode !== 'supabase') throw new Error(result?.detail || 'Account outcome persistence is using local fallback.')

    const refreshedDatabaseOutcomes = (result.outcomes || []).map((outcome) => normalizeTripOutcome({ ...outcome, source: 'Database' } as TripOutcome))
    const databaseFingerprints = new Set(refreshedDatabaseOutcomes.map(outcomeFingerprint))
    persistDatabaseMirror(refreshedDatabaseOutcomes)
    writeHealth({
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: 'synced',
      lastError: undefined,
      migrationCompletedFingerprints: Array.from(databaseFingerprints).slice(-1000)
    })
    window.dispatchEvent(new Event('nonrevy-trip-outcomes-updated'))
  } catch (error) {
    writeHealth({
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: 'error',
      lastError: error instanceof Error ? error.message : 'Unknown database outcome sync error.'
    })
  } finally {
    syncInFlight = false
  }

  return outcomeRepositoryDiagnostics()
}

export function outcomeRepositoryDiagnostics(): OutcomeRepositoryDiagnostics {
  const health = readHealth()
  const localOutcomes = localOutcomeRepository.list()
  const databaseOutcomes = databaseOutcomeRepository.list()
  const mergedOutcomes = mergeOutcomeLists(databaseOutcomes, localOutcomes)
  const databaseFingerprints = new Set(databaseOutcomes.map(outcomeFingerprint))
  const migrationPendingCount = databaseOutcomeRepository.isAvailable()
    ? localOutcomes.filter((outcome) => !databaseFingerprints.has(outcomeFingerprint(outcome))).length
    : localOutcomes.length
  const databaseReady = databaseOutcomeRepository.isAvailable() && health.lastSyncStatus !== 'error'

  return {
    activeSource: databaseReady && databaseOutcomes.length ? 'Database' : 'Local',
    localFallbackEnabled: true,
    databaseReady,
    databaseConfigured: databaseConfigured(),
    localOutcomeCount: localOutcomes.length,
    databaseOutcomeCount: databaseOutcomes.length,
    mergedOutcomeCount: mergedOutcomes.length,
    migrationPendingCount,
    migrationCompletedCount: health.migrationCompletedFingerprints.length,
    lastSyncAt: health.lastSyncAt,
    lastSyncStatus: syncInFlight ? 'syncing' : health.lastSyncStatus,
    lastError: health.lastError,
    detail: databaseReady
      ? `Database outcome repository is configured with ${databaseOutcomes.length} mirrored database outcome${databaseOutcomes.length === 1 ? '' : 's'}; ${migrationPendingCount} local fallback record${migrationPendingCount === 1 ? '' : 's'} still need migration.`
      : databaseConfigured()
        ? `Database outcome repository is configured but currently using local fallback${health.lastError ? `: ${health.lastError}` : '.'}`
        : 'Database outcome repository is not configured, so outcomes are stored locally with database-ready fields.'
  }
}

export function outcomesForCommunityProbability(outcomes: TripOutcome[]) {
  return outcomes
    .map((outcome) => normalizeTripOutcome(outcome))
    .filter((outcome) => !outcome.cancelled)
}

export function outcomeHealthDiagnostics() {
  const diagnostics = outcomeRepositoryDiagnostics()
  const outcomes = loadTripOutcomesFromRepository()
  const probabilityOutcomes = outcomesForCommunityProbability(outcomes)
  const successful = probabilityOutcomes.filter((outcome) => outcome.success === true).length
  const failed = probabilityOutcomes.filter((outcome) => outcome.success === false).length
  const routeCount = new Set(outcomes.map((outcome) => outcome.route)).size
  const successRate = probabilityOutcomes.length ? Math.round((successful / probabilityOutcomes.length) * 100) : 0

  return {
    ...diagnostics,
    routeCount,
    probabilityOutcomeCount: probabilityOutcomes.length,
    successful,
    failed,
    successRate,
    communityIntelligenceReady: probabilityOutcomes.length > 0,
    routeConfidenceReady: outcomes.length > 0,
    successProbabilityReady: probabilityOutcomes.length > 0
  }
}
