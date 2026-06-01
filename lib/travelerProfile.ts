export const travelerProfileStorageKey = 'nonrevy.travelerProfile'

export type TravelerType = 'Employee' | 'Retiree' | 'Companion' | 'Buddy Pass'
export type SupportedCarrierEligibilityKey = 'united' | 'delta' | 'alaska-group'

export type TravelerProfileScaffold = {
  employeeAirline: string
  travelerType: TravelerType
  passPriority: string
  homeAirport: string
  preferredAirports: string[]
  supportedCarrierEligibility: Record<SupportedCarrierEligibilityKey, string>
}

export const defaultTravelerProfile: TravelerProfileScaffold = {
  employeeAirline: 'United',
  travelerType: 'Employee',
  passPriority: 'SA2',
  homeAirport: 'LAX',
  preferredAirports: ['LAX', 'SFO', 'DEN'],
  supportedCarrierEligibility: {
    united: 'Primary employee eligibility',
    delta: 'Interline eligibility placeholder',
    'alaska-group': 'Partner eligibility placeholder'
  }
}

export function parseAirportList(value: string) {
  return value.split(',').map((airport) => airport.trim().toUpperCase()).filter(Boolean)
}

export function normalizeTravelerProfile(value: Partial<TravelerProfileScaffold>): TravelerProfileScaffold {
  return {
    ...defaultTravelerProfile,
    ...value,
    employeeAirline: value.employeeAirline || defaultTravelerProfile.employeeAirline,
    travelerType: value.travelerType || defaultTravelerProfile.travelerType,
    passPriority: value.passPriority || defaultTravelerProfile.passPriority,
    homeAirport: (value.homeAirport || defaultTravelerProfile.homeAirport).toUpperCase(),
    preferredAirports: value.preferredAirports?.length
      ? value.preferredAirports.map((airport) => airport.toUpperCase())
      : defaultTravelerProfile.preferredAirports,
    supportedCarrierEligibility: {
      ...defaultTravelerProfile.supportedCarrierEligibility,
      ...value.supportedCarrierEligibility
    }
  }
}

export function loadTravelerProfileFromStorage() {
  if (typeof window === 'undefined') return defaultTravelerProfile

  try {
    const storedProfile = window.localStorage.getItem(travelerProfileStorageKey)
    if (!storedProfile) return defaultTravelerProfile
    return normalizeTravelerProfile(JSON.parse(storedProfile))
  } catch {
    return defaultTravelerProfile
  }
}

export function saveTravelerProfileToStorage(profile: TravelerProfileScaffold) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(travelerProfileStorageKey, JSON.stringify(normalizeTravelerProfile(profile)))
}

export function travelerProfileAssumptions(profile: TravelerProfileScaffold) {
  return [
    `Employee airline: ${profile.employeeAirline}`,
    `Traveler type: ${profile.travelerType}`,
    `Pass priority: ${profile.passPriority}`,
    `Home airport: ${profile.homeAirport}`,
    `Preferred airports: ${profile.preferredAirports.join(', ')}`,
    `Supported carrier eligibility: United - ${profile.supportedCarrierEligibility.united}; Delta - ${profile.supportedCarrierEligibility.delta}; Alaska Group - ${profile.supportedCarrierEligibility['alaska-group']}`
  ]
}
