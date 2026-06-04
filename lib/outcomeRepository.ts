import { defaultTravelerProfile, loadTravelerProfileFromStorage, type TravelerProfileScaffold } from './travelerProfile'

export const tripOutcomeStorageKey = 'nonrevy.tripOutcomes'

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
  detail: string
}

export const tripOutcomeStatuses: TripOutcomeStatus[] = [
  'Yes, got on',
  'No, did not get on',
  'Cancelled trip'
]

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

class LocalOutcomeRepository implements OutcomeRepository {
  source: OutcomeSource = 'Local'

  isAvailable() {
    return isBrowser()
  }

  list() {
    if (!this.isAvailable()) return []

    try {
      const storedOutcomes = window.localStorage.getItem(tripOutcomeStorageKey)
      if (!storedOutcomes) return []
      const outcomes = JSON.parse(storedOutcomes)
      return Array.isArray(outcomes)
        ? outcomes.map((outcome) => normalizeTripOutcome({ ...outcome, source: 'Local' } as TripOutcome))
        : []
    } catch {
      return []
    }
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
    return false
  }

  list() {
    return []
  }

  create() {
    return null
  }
}

export const localOutcomeRepository = new LocalOutcomeRepository()
export const databaseOutcomeRepository = new DatabaseOutcomeRepository()

export function activeOutcomeRepository(): OutcomeRepository {
  return databaseOutcomeRepository.isAvailable() ? databaseOutcomeRepository : localOutcomeRepository
}

export function loadTripOutcomesFromRepository() {
  return activeOutcomeRepository().list()
}

export function saveTripOutcomeToRepository(outcome: CreateTripOutcomeInput) {
  const activeRepository = activeOutcomeRepository()
  const savedOutcome = activeRepository.create(outcome)
  if (savedOutcome) return savedOutcome
  return localOutcomeRepository.create(outcome)
}

export function outcomeRepositoryDiagnostics(): OutcomeRepositoryDiagnostics {
  const databaseReady = databaseOutcomeRepository.isAvailable()
  return {
    activeSource: databaseReady ? 'Database' : 'Local',
    localFallbackEnabled: true,
    databaseReady,
    detail: databaseReady
      ? 'Database outcome repository is ready; local storage remains available as a fallback.'
      : 'Database outcome repository scaffold is not configured yet, so outcomes are stored locally with database-ready fields.'
  }
}

export function outcomesForCommunityProbability(outcomes: TripOutcome[]) {
  return outcomes
    .map((outcome) => normalizeTripOutcome(outcome))
    .filter((outcome) => !outcome.cancelled)
}
