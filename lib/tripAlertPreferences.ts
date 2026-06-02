export const tripAlertPreferencesStorageKey = 'nonrevy.tripAlertPreferences'

export const tripAlertPreferenceOptions = [
  { key: 'scoreChanges', label: 'Score changes', description: 'Notify when the itinerary score moves materially.' },
  { key: 'successProbabilityChanges', label: 'Success probability changes', description: 'Notify when the probability engine estimate changes.' },
  { key: 'delayCancellationUpdates', label: 'Delay/cancellation updates', description: 'Notify when schedule disruption signals appear.' },
  { key: 'betterRouteFound', label: 'New better route found', description: 'Notify when NONREVY finds a stronger route option.' },
  { key: 'didYouGetOnReminder', label: 'Did-you-get-on reminder', description: 'Prompt after travel to capture the outcome.' }
] as const

export type TripAlertPreferenceKey = typeof tripAlertPreferenceOptions[number]['key']

export type TripAlertPreferenceFlags = Record<TripAlertPreferenceKey, boolean>

export type TripAlertTargetType = 'watched-route' | 'saved-itinerary'

export type TripAlertPreference = {
  id: string
  targetId: string
  targetType: TripAlertTargetType
  targetLabel: string
  flags: TripAlertPreferenceFlags
  updatedAt: string
}

export const defaultTripAlertPreferenceFlags: TripAlertPreferenceFlags = {
  scoreChanges: true,
  successProbabilityChanges: true,
  delayCancellationUpdates: true,
  betterRouteFound: false,
  didYouGetOnReminder: true
}

export function createDefaultTripAlertPreference(
  targetId: string,
  targetType: TripAlertTargetType,
  targetLabel: string
): TripAlertPreference {
  return {
    id: `${targetType}-${targetId}`,
    targetId,
    targetType,
    targetLabel,
    flags: { ...defaultTripAlertPreferenceFlags },
    updatedAt: new Date().toISOString()
  }
}

export function loadTripAlertPreferences() {
  if (typeof window === 'undefined') return []

  try {
    const storedPreferences = window.localStorage.getItem(tripAlertPreferencesStorageKey)
    if (!storedPreferences) return []
    const preferences = JSON.parse(storedPreferences)
    return Array.isArray(preferences) ? preferences as TripAlertPreference[] : []
  } catch {
    return []
  }
}

export function getTripAlertPreference(targetId: string, targetType: TripAlertTargetType, targetLabel: string) {
  const existing = loadTripAlertPreferences().find((preference) => preference.targetId === targetId && preference.targetType === targetType)
  return existing || createDefaultTripAlertPreference(targetId, targetType, targetLabel)
}

export function saveTripAlertPreference(preference: TripAlertPreference) {
  if (typeof window === 'undefined') return null

  const nextPreference: TripAlertPreference = {
    ...preference,
    updatedAt: new Date().toISOString()
  }
  const existing = loadTripAlertPreferences()
  const preferences = [
    nextPreference,
    ...existing.filter((item) => !(item.targetId === nextPreference.targetId && item.targetType === nextPreference.targetType))
  ]
  window.localStorage.setItem(tripAlertPreferencesStorageKey, JSON.stringify(preferences))
  window.dispatchEvent(new Event('nonrevy-trip-alert-preferences-updated'))
  return nextPreference
}

export function removeTripAlertPreference(targetId: string, targetType: TripAlertTargetType) {
  if (typeof window === 'undefined') return []

  const preferences = loadTripAlertPreferences().filter((item) => !(item.targetId === targetId && item.targetType === targetType))
  window.localStorage.setItem(tripAlertPreferencesStorageKey, JSON.stringify(preferences))
  window.dispatchEvent(new Event('nonrevy-trip-alert-preferences-updated'))
  return preferences
}

export function enabledTripAlertLabels(preference: TripAlertPreference) {
  return tripAlertPreferenceOptions
    .filter((option) => preference.flags[option.key])
    .map((option) => option.label)
}
