export const userPreferencesStorageKey = 'nonrevy.userPreferences.v1'

export type CabinPreference = 'Any cabin' | 'Economy' | 'Premium economy' | 'Business' | 'First'

export type UserPreferences = {
  preferredAirlines: string[]
  maximumStops: number
  minimumConnectionMinutes: number
  favoriteAirports: string[]
  cabinPreference: CabinPreference
}

export const defaultUserPreferences: UserPreferences = {
  preferredAirlines: ['United'],
  maximumStops: 2,
  minimumConnectionMinutes: 60,
  favoriteAirports: ['LAX', 'SFO', 'DEN'],
  cabinPreference: 'Any cabin'
}

export function parsePreferenceList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export function normalizeUserPreferences(value: Partial<UserPreferences>): UserPreferences {
  return {
    preferredAirlines: value.preferredAirlines?.length ? value.preferredAirlines.map((airline) => airline.trim()).filter(Boolean) : defaultUserPreferences.preferredAirlines,
    maximumStops: Number.isFinite(value.maximumStops) ? Math.max(0, Math.min(4, Number(value.maximumStops))) : defaultUserPreferences.maximumStops,
    minimumConnectionMinutes: Number.isFinite(value.minimumConnectionMinutes) ? Math.max(30, Math.min(240, Number(value.minimumConnectionMinutes))) : defaultUserPreferences.minimumConnectionMinutes,
    favoriteAirports: value.favoriteAirports?.length ? value.favoriteAirports.map((airport) => airport.trim().toUpperCase()).filter(Boolean) : defaultUserPreferences.favoriteAirports,
    cabinPreference: value.cabinPreference || defaultUserPreferences.cabinPreference
  }
}

export function loadUserPreferences() {
  if (typeof window === 'undefined') return defaultUserPreferences
  try {
    const stored = window.localStorage.getItem(userPreferencesStorageKey)
    return stored ? normalizeUserPreferences(JSON.parse(stored)) : defaultUserPreferences
  } catch {
    return defaultUserPreferences
  }
}

export function saveUserPreferences(preferences: UserPreferences) {
  const normalized = normalizeUserPreferences(preferences)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(userPreferencesStorageKey, JSON.stringify(normalized))
    window.dispatchEvent(new Event('nonrevy-user-preferences-updated'))
  }
  return normalized
}
