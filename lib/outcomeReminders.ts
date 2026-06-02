import { loadSavedItineraryComparisons } from './savedItineraryComparisons'
import { loadTripOutcomes, saveTripOutcome, type TripOutcomeStatus } from './tripOutcomes'
import { loadSavedTripWatchlist } from './watchlist'

export const outcomeRemindersStorageKey = 'nonrevy.outcomeReminders'

export type OutcomeReminderStatus = 'pending' | 'completed' | 'dismissed'
export type OutcomeReminderResponse = 'Yes' | 'No' | 'Cancelled Trip'
export type OutcomeReminderSourceType = 'saved-trip' | 'watched-itinerary'

export type OutcomeReminder = {
  id: string
  sourceId: string
  sourceType: OutcomeReminderSourceType
  title: string
  route: string
  carrier: string
  travelDate: string
  prompt: 'Did you get on?'
  status: OutcomeReminderStatus
  notes: string
  outcomeId?: string
  createdAt: string
  completedAt?: string
  dismissedAt?: string
}

export type OutcomeReminderCandidate = {
  sourceId: string
  sourceType: OutcomeReminderSourceType
  title: string
  route: string
  carrier: string
  travelDate: string
  due: boolean
  reason: string
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function normalizeDate(value: string) {
  return value.trim()
}

export function hasPlannedTravelDate(value?: string) {
  if (!value) return false
  const normalized = normalizeDate(value)
  if (!normalized || normalized.toLowerCase() === 'flexible') return false
  return Number.isFinite(Date.parse(`${normalized}T00:00:00`))
}

export function reminderDueForTravelDate(value: string, now = new Date()) {
  if (!hasPlannedTravelDate(value)) return false
  const travelDate = new Date(`${normalizeDate(value)}T23:59:59`)
  return now.getTime() > travelDate.getTime()
}

export function outcomeStatusFromReminderResponse(response: OutcomeReminderResponse): TripOutcomeStatus {
  if (response === 'Yes') return 'Yes, got on'
  if (response === 'No') return 'No, did not get on'
  return 'Cancelled trip'
}

export function loadOutcomeReminders() {
  if (!isBrowser()) return []

  try {
    const storedReminders = window.localStorage.getItem(outcomeRemindersStorageKey)
    if (!storedReminders) return []
    const reminders = JSON.parse(storedReminders)
    return Array.isArray(reminders) ? reminders as OutcomeReminder[] : []
  } catch {
    return []
  }
}

function saveOutcomeReminders(reminders: OutcomeReminder[]) {
  if (!isBrowser()) return reminders
  window.localStorage.setItem(outcomeRemindersStorageKey, JSON.stringify(reminders))
  window.dispatchEvent(new Event('nonrevy-outcome-reminders-updated'))
  return reminders
}

export function loadOutcomeReminderCandidates(): OutcomeReminderCandidate[] {
  if (!isBrowser()) return []

  const watchedTrips = loadSavedTripWatchlist()
    .filter((watch) => hasPlannedTravelDate(watch.travelDate))
    .map((watch) => ({
      sourceId: watch.id,
      sourceType: 'saved-trip' as const,
      title: `${watch.origin} → ${watch.destination}`,
      route: watch.selectedItinerary,
      carrier: watch.carrier,
      travelDate: watch.travelDate,
      due: reminderDueForTravelDate(watch.travelDate),
      reason: 'Saved trip watch with a planned travel date'
    }))

  const watchedItineraries = loadSavedItineraryComparisons()
    .filter((comparison) => hasPlannedTravelDate(comparison.travelDate))
    .map((comparison) => ({
      sourceId: comparison.id,
      sourceType: 'watched-itinerary' as const,
      title: comparison.sourceLabel || 'Saved itinerary option',
      route: comparison.route,
      carrier: comparison.carrier,
      travelDate: comparison.travelDate as string,
      due: reminderDueForTravelDate(comparison.travelDate as string),
      reason: 'Saved itinerary comparison with a planned travel date'
    }))

  return [...watchedTrips, ...watchedItineraries]
}

export function generateOutcomeReminders() {
  if (!isBrowser()) return []

  const existing = loadOutcomeReminders()
  const outcomes = loadTripOutcomes()
  const candidates = loadOutcomeReminderCandidates().filter((candidate) => candidate.due)
  const pendingAdditions = candidates.filter((candidate) => {
    const alreadyReminded = existing.some((reminder) =>
      reminder.sourceId === candidate.sourceId &&
      reminder.sourceType === candidate.sourceType &&
      reminder.travelDate === candidate.travelDate &&
      reminder.status !== 'dismissed'
    )
    const alreadyRecorded = outcomes.some((outcome) =>
      outcome.subjectId === candidate.sourceId &&
      outcome.route === candidate.route
    )
    return !alreadyReminded && !alreadyRecorded
  })

  if (pendingAdditions.length === 0) return existing

  const now = new Date().toISOString()
  const additions: OutcomeReminder[] = pendingAdditions.map((candidate) => ({
    id: `${candidate.sourceType}-${candidate.sourceId}-${candidate.travelDate}-${Date.now()}`,
    sourceId: candidate.sourceId,
    sourceType: candidate.sourceType,
    title: candidate.title,
    route: candidate.route,
    carrier: candidate.carrier,
    travelDate: candidate.travelDate,
    prompt: 'Did you get on?',
    status: 'pending',
    notes: '',
    createdAt: now
  }))

  return saveOutcomeReminders([...additions, ...existing])
}

export function completeOutcomeReminder(reminderId: string, response: OutcomeReminderResponse, notes: string) {
  if (!isBrowser()) return null

  const reminders = loadOutcomeReminders()
  const reminder = reminders.find((item) => item.id === reminderId)
  if (!reminder) return null

  const outcome = saveTripOutcome({
    subjectType: 'outcome-reminder',
    subjectId: reminder.sourceId,
    title: reminder.title,
    route: reminder.route,
    status: outcomeStatusFromReminderResponse(response),
    notes: notes.trim() || `Recorded from automated outcome reminder for ${reminder.travelDate}.`
  })

  const completedAt = new Date().toISOString()
  const updated = reminders.map((item) => item.id === reminderId
    ? {
        ...item,
        status: 'completed' as const,
        notes,
        outcomeId: outcome?.id,
        completedAt
      }
    : item
  )
  saveOutcomeReminders(updated)
  window.dispatchEvent(new Event('nonrevy-historical-routes-updated'))
  window.dispatchEvent(new Event('nonrevy-reputation-updated'))
  window.dispatchEvent(new Event('nonrevy-intelligence-updated'))
  return outcome
}

export function dismissOutcomeReminder(reminderId: string) {
  if (!isBrowser()) return []

  const dismissedAt = new Date().toISOString()
  const updated = loadOutcomeReminders().map((item) => item.id === reminderId
    ? { ...item, status: 'dismissed' as const, dismissedAt }
    : item
  )
  return saveOutcomeReminders(updated)
}

export function outcomeReminderStats(reminders: OutcomeReminder[]) {
  const pending = reminders.filter((reminder) => reminder.status === 'pending').length
  const completed = reminders.filter((reminder) => reminder.status === 'completed').length
  const dismissed = reminders.filter((reminder) => reminder.status === 'dismissed').length

  return {
    total: reminders.length,
    pending,
    completed,
    dismissed
  }
}
