export const tripOutcomeStorageKey = 'nonrevy.tripOutcomes'

export type TripOutcomeStatus = 'Yes, got on' | 'No, did not get on' | 'Cancelled trip'

export type TripOutcome = {
  id: string
  subjectType: 'route-recommendation' | 'saved-itinerary' | 'outcome-reminder'
  subjectId: string
  title: string
  route: string
  status: TripOutcomeStatus
  notes: string
  createdAt: string
}

export const tripOutcomeStatuses: TripOutcomeStatus[] = [
  'Yes, got on',
  'No, did not get on',
  'Cancelled trip'
]

export function loadTripOutcomes() {
  if (typeof window === 'undefined') return []

  try {
    const storedOutcomes = window.localStorage.getItem(tripOutcomeStorageKey)
    if (!storedOutcomes) return []
    const outcomes = JSON.parse(storedOutcomes)
    return Array.isArray(outcomes) ? outcomes as TripOutcome[] : []
  } catch {
    return []
  }
}

export function saveTripOutcome(outcome: Omit<TripOutcome, 'id' | 'createdAt'>) {
  if (typeof window === 'undefined') return null

  const nextOutcome: TripOutcome = {
    ...outcome,
    id: `${outcome.subjectType}-${outcome.subjectId}-${Date.now()}`,
    createdAt: new Date().toISOString()
  }
  const outcomes = [nextOutcome, ...loadTripOutcomes()]
  window.localStorage.setItem(tripOutcomeStorageKey, JSON.stringify(outcomes))
  window.dispatchEvent(new Event('nonrevy-trip-outcomes-updated'))
  return nextOutcome
}

export function tripOutcomeStats(outcomes: TripOutcome[]) {
  const outcomeCount = outcomes.length
  const successCount = outcomes.filter((outcome) => outcome.status === 'Yes, got on').length
  const successRate = outcomeCount ? Math.round((successCount / outcomeCount) * 100) : 0

  return {
    outcomeCount,
    successCount,
    successRate
  }
}
