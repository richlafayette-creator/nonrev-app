export const travelerProfileStorageKey = 'nonrevy.travelerProfile'

export type TravelerType = 'Employee' | 'Retiree' | 'Companion' | 'Buddy Pass'
export type SupportedCarrierEligibilityKey = 'united' | 'delta' | 'alaska-group'
export type BookingPlatform = 'ID90' | 'myIDTravel' | 'Airline Portal' | 'Other'
export type AgreementVerificationStatus = 'employer_verified' | 'platform_verified' | 'user_verified' | 'community_reported' | 'unverified' | 'expired'
export type EligibleTravelerType = 'employee' | 'spouse' | 'dependent_child' | 'parent' | 'companion' | 'buddy_pass'

export type ZedAgreementRecord = {
  id: string
  airlineCode: string
  airlineName: string
  agreementType: 'ZED' | 'Interline' | 'Other'
  fareLevel?: string
  bookingPlatform: BookingPlatform
  eligibleTravelerTypes: EligibleTravelerType[]
  cabinAccess: string[]
  notes?: string
  verificationStatus: AgreementVerificationStatus
  verifiedAt?: string
  expiresAt?: string
  active: boolean
}

export type TravelerProfileScaffold = {
  employeeAirline: string
  travelerType: TravelerType
  passPriority: string
  homeAirport: string
  preferredAirports: string[]
  supportedCarrierEligibility: Record<SupportedCarrierEligibilityKey, string>
  bookingPlatforms: BookingPlatform[]
  travelingParty: Array<{ id: string; travelerType: EligibleTravelerType; displayName?: string }>
  zedAgreements: ZedAgreementRecord[]
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
  },
  bookingPlatforms: [],
  travelingParty: [{ id: 'employee', travelerType: 'employee', displayName: 'Employee' }],
  zedAgreements: []
}

export function parseAirportList(value: string) {
  return value.split(',').map((airport) => airport.trim().toUpperCase()).filter(Boolean)
}

const bookingPlatforms: BookingPlatform[] = ['ID90', 'myIDTravel', 'Airline Portal', 'Other']
const agreementVerificationStatuses: AgreementVerificationStatus[] = ['employer_verified', 'platform_verified', 'user_verified', 'community_reported', 'unverified', 'expired']
const eligibleTravelerTypes: EligibleTravelerType[] = ['employee', 'spouse', 'dependent_child', 'parent', 'companion', 'buddy_pass']
const agreementTypes: ZedAgreementRecord['agreementType'][] = ['ZED', 'Interline', 'Other']

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function normalizeAirlineCode(value: unknown) {
  return stringValue(value).trim().toUpperCase()
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return allowed.includes(value as T) ? value as T : fallback
}

function stringArray(value: unknown, options: { uppercase?: boolean } = {}) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => options.uppercase ? item.trim().toUpperCase() : item.trim())
    .filter(Boolean)
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)]
}

function normalizeBookingPlatforms(value: unknown) {
  return uniqueStrings(stringArray(value))
    .filter((platform): platform is BookingPlatform => bookingPlatforms.includes(platform as BookingPlatform))
}

function normalizeTravelingParty(value: unknown): TravelerProfileScaffold['travelingParty'] {
  if (!Array.isArray(value)) return defaultTravelerProfile.travelingParty
  const party = value.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = objectValue(item)
    const travelerType = enumValue(record.travelerType, eligibleTravelerTypes, 'employee')
    const id = stringValue(record.id).trim() || `traveler-${index + 1}`
    const displayName = optionalString(record.displayName)
    return [{ id, travelerType, ...(displayName ? { displayName } : {}) }]
  })
  return party.length ? party : defaultTravelerProfile.travelingParty
}

function normalizeZedAgreement(value: unknown, index: number): ZedAgreementRecord | null {
  const record = objectValue(value)
  const airlineCode = normalizeAirlineCode(record.airlineCode)
  if (!airlineCode) return null
  const airlineName = stringValue(record.airlineName).trim() || airlineCode
  const fareLevel = optionalString(record.fareLevel)
  const notes = optionalString(record.notes)
  const verifiedAt = optionalString(record.verifiedAt)
  const expiresAt = optionalString(record.expiresAt)
  return {
    id: stringValue(record.id).trim() || `zed-${airlineCode}-${index + 1}`,
    airlineCode,
    airlineName,
    agreementType: enumValue(record.agreementType, agreementTypes, 'ZED'),
    ...(fareLevel !== undefined ? { fareLevel } : {}),
    bookingPlatform: enumValue(record.bookingPlatform, bookingPlatforms, 'Other'),
    eligibleTravelerTypes: uniqueStrings(stringArray(record.eligibleTravelerTypes))
      .filter((travelerType): travelerType is EligibleTravelerType => eligibleTravelerTypes.includes(travelerType as EligibleTravelerType)),
    cabinAccess: uniqueStrings(stringArray(record.cabinAccess)),
    ...(notes !== undefined ? { notes } : {}),
    verificationStatus: enumValue(record.verificationStatus, agreementVerificationStatuses, 'unverified'),
    ...(verifiedAt !== undefined ? { verifiedAt } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    active: typeof record.active === 'boolean' ? record.active : true
  }
}

function zedAgreementDedupeKey(agreement: ZedAgreementRecord) {
  const { id, ...withoutId } = agreement
  return JSON.stringify(withoutId)
}

function normalizeZedAgreements(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((item, index) => {
    const agreement = normalizeZedAgreement(item, index)
    if (!agreement) return []
    const key = zedAgreementDedupeKey(agreement)
    if (seen.has(key)) return []
    seen.add(key)
    return [agreement]
  })
}

function normalizeSupportedCarrierEligibility(value: unknown) {
  const record = objectValue(value)
  return {
    ...defaultTravelerProfile.supportedCarrierEligibility,
    ...Object.fromEntries(Object.entries(record).filter(([, eligibility]) => typeof eligibility === 'string'))
  }
}

export function normalizeTravelerProfile(value: Partial<TravelerProfileScaffold> = {}): TravelerProfileScaffold {
  const profile = objectValue(value)
  return {
    ...defaultTravelerProfile,
    ...profile,
    employeeAirline: stringValue(profile.employeeAirline, defaultTravelerProfile.employeeAirline) || defaultTravelerProfile.employeeAirline,
    travelerType: enumValue(profile.travelerType, ['Employee', 'Retiree', 'Companion', 'Buddy Pass'], defaultTravelerProfile.travelerType),
    passPriority: stringValue(profile.passPriority, defaultTravelerProfile.passPriority) || defaultTravelerProfile.passPriority,
    homeAirport: (stringValue(profile.homeAirport, defaultTravelerProfile.homeAirport) || defaultTravelerProfile.homeAirport).toUpperCase(),
    preferredAirports: Array.isArray(profile.preferredAirports) && profile.preferredAirports.length
      ? stringArray(profile.preferredAirports, { uppercase: true })
      : defaultTravelerProfile.preferredAirports,
    supportedCarrierEligibility: normalizeSupportedCarrierEligibility(profile.supportedCarrierEligibility),
    bookingPlatforms: normalizeBookingPlatforms(profile.bookingPlatforms),
    travelingParty: normalizeTravelingParty(profile.travelingParty),
    zedAgreements: normalizeZedAgreements(profile.zedAgreements)
  }
}

export function findActiveZedAgreement(profile: TravelerProfileScaffold, airlineCode: string) {
  const normalizedAirlineCode = normalizeAirlineCode(airlineCode)
  return normalizeTravelerProfile(profile).zedAgreements.find((agreement) => agreement.active && agreement.airlineCode === normalizedAirlineCode)
}

export function isTravelerTypeEligibleForAgreement(agreement: ZedAgreementRecord, travelerType: EligibleTravelerType) {
  return agreement.eligibleTravelerTypes.includes(travelerType)
}

export function isEntireTravelingPartyEligible(profile: TravelerProfileScaffold, airlineCode: string) {
  const normalized = normalizeTravelerProfile(profile)
  const agreement = findActiveZedAgreement(normalized, airlineCode)
  if (!agreement) return false
  return normalized.travelingParty.every((traveler) => isTravelerTypeEligibleForAgreement(agreement, traveler.travelerType))
}

export function zedAgreementVerificationIsFresh(agreement: ZedAgreementRecord, maxAgeDays = 180) {
  if (agreement.verificationStatus === 'expired' || agreement.verificationStatus === 'unverified') return false
  const verifiedAt = Date.parse(agreement.verifiedAt || '')
  if (!Number.isFinite(verifiedAt) || verifiedAt > Date.now()) return false
  const expiresAt = Date.parse(agreement.expiresAt || '')
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return false
  return Date.now() - verifiedAt <= maxAgeDays * 86400000
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
  window.dispatchEvent(new Event('nonrevy-traveler-profile-updated'))
  window.dispatchEvent(new Event('nonrevy-activation-progress-updated'))
}

export function travelerProfileAssumptions(profile: TravelerProfileScaffold) {
  const normalized = normalizeTravelerProfile(profile)
  const activeZedAgreements = normalized.zedAgreements.filter((agreement) => agreement.active)
  const verificationSummary = activeZedAgreements.reduce<Record<string, number>>((summary, agreement) => {
    summary[agreement.verificationStatus] = (summary[agreement.verificationStatus] || 0) + 1
    return summary
  }, {})
  return [
    `Employee airline: ${normalized.employeeAirline}`,
    `Traveler type: ${normalized.travelerType}`,
    `Pass priority: ${normalized.passPriority}`,
    `Home airport: ${normalized.homeAirport}`,
    `Preferred airports: ${normalized.preferredAirports.join(', ')}`,
    `Supported carrier eligibility: United - ${normalized.supportedCarrierEligibility.united}; Delta - ${normalized.supportedCarrierEligibility.delta}; Alaska Group - ${normalized.supportedCarrierEligibility['alaska-group']}`,
    `Booking platforms: ${normalized.bookingPlatforms.join(', ') || 'not set'}`,
    `Traveling party count: ${normalized.travelingParty.length}`,
    `Active ZED airline codes: ${activeZedAgreements.map((agreement) => agreement.airlineCode).join(', ') || 'none'}`,
    `ZED verification status summary: ${Object.entries(verificationSummary).map(([status, count]) => `${status}: ${count}`).join('; ') || 'none'}`
  ]
}
