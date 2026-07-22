import { type BetaSearchRequest } from './searchRequest'
import { type SearchTripType } from './searchPipeline'

export type SearchValidationIssue = {
  field: string
  message: string
}

export type SearchValidationResult =
  | { ok: true; request: BetaSearchRequest }
  | { ok: false; status: 400 | 422; code: 'missing_required_field' | 'validation_failed'; issues: SearchValidationIssue[] }

const tripTypes: SearchTripType[] = ['one_way', 'round_trip', 'open_jaw']
const airportCodeBlocklist = new Set(['ZED'])

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedAirport(value: unknown) {
  const code = stringValue(value).toUpperCase()
  return /^[A-Z]{3}$/.test(code) && !airportCodeBlocklist.has(code) ? code : ''
}

function strictDate(value: unknown) {
  const text = stringValue(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const parsed = Date.parse(`${text}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return ''
  const normalized = new Date(parsed).toISOString().slice(0, 10)
  return normalized === text ? text : ''
}

function optionalStringArray(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function missingRequiredFields(record: Record<string, unknown>) {
  return ['origin', 'destination', 'departureDate', 'travelerCount', 'tripMission', 'travelerProfile', 'preferences']
    .filter((field) => record[field] === undefined || record[field] === null || record[field] === '')
    .map((field) => ({ field, message: `${field} is required.` }))
}

export function validateSearchRequest(body: unknown): SearchValidationResult {
  const record = objectValue(body)
  if (!Object.keys(record).length) {
    return {
      ok: false,
      status: 400,
      code: 'missing_required_field',
      issues: [{ field: 'body', message: 'Request body must be a JSON object.' }]
    }
  }

  const missing = missingRequiredFields(record)
  if (missing.length) {
    return { ok: false, status: 400, code: 'missing_required_field', issues: missing }
  }

  const issues: SearchValidationIssue[] = []
  const origin = normalizedAirport(record.origin)
  const destination = normalizedAirport(record.destination)
  if (!origin) issues.push({ field: 'origin', message: 'origin must be a valid three-letter airport code.' })
  if (!destination) issues.push({ field: 'destination', message: 'destination must be a valid three-letter airport code.' })
  if (origin && destination && origin === destination) issues.push({ field: 'destination', message: 'destination must differ from origin.' })

  const departureDate = strictDate(record.departureDate)
  const returnDate = record.returnDate === undefined || record.returnDate === null || record.returnDate === ''
    ? undefined
    : strictDate(record.returnDate)
  if (!departureDate) issues.push({ field: 'departureDate', message: 'departureDate must be a valid YYYY-MM-DD date.' })
  if (record.returnDate !== undefined && record.returnDate !== null && record.returnDate !== '' && !returnDate) {
    issues.push({ field: 'returnDate', message: 'returnDate must be a valid YYYY-MM-DD date when provided.' })
  }
  if (departureDate && returnDate && Date.parse(`${returnDate}T00:00:00Z`) < Date.parse(`${departureDate}T00:00:00Z`)) {
    issues.push({ field: 'returnDate', message: 'returnDate must be on or after departureDate.' })
  }

  const travelerCount = Number(record.travelerCount)
  if (!Number.isInteger(travelerCount) || travelerCount < 1 || travelerCount > 99) {
    issues.push({ field: 'travelerCount', message: 'travelerCount must be an integer from 1 to 99.' })
  }

  const tripMission = record.tripMission
  if (!(typeof tripMission === 'string' || (tripMission && typeof tripMission === 'object' && !Array.isArray(tripMission)))) {
    issues.push({ field: 'tripMission', message: 'tripMission must be an object or non-empty string.' })
  } else if (typeof tripMission === 'string' && !tripMission.trim()) {
    issues.push({ field: 'tripMission', message: 'tripMission must not be blank.' })
  }

  if (!(record.travelerProfile && typeof record.travelerProfile === 'object' && !Array.isArray(record.travelerProfile))) {
    issues.push({ field: 'travelerProfile', message: 'travelerProfile must be an object.' })
  }

  const preferences = objectValue(record.preferences)
  if (!Object.keys(preferences).length && (record.preferences === undefined || record.preferences === null || typeof record.preferences !== 'object' || Array.isArray(record.preferences))) {
    issues.push({ field: 'preferences', message: 'preferences must be an object.' })
  }

  const tripType = preferences.tripType
  if (tripType !== undefined && !tripTypes.includes(tripType as SearchTripType)) {
    issues.push({ field: 'preferences.tripType', message: 'tripType must be one_way, round_trip, or open_jaw.' })
  }
  if (tripType === 'round_trip' && !returnDate) {
    issues.push({ field: 'returnDate', message: 'returnDate is required for round_trip searches.' })
  }
  if (tripType === 'one_way' && returnDate) {
    issues.push({ field: 'returnDate', message: 'returnDate cannot be supplied for one_way searches.' })
  }

  const preferredDepartureAirports = optionalStringArray(preferences.preferredDepartureAirports)
  preferredDepartureAirports?.forEach((airport, index) => {
    if (!normalizedAirport(airport)) issues.push({ field: `preferences.preferredDepartureAirports.${index}`, message: 'preferred departure airports must be valid three-letter airport codes.' })
  })

  if (issues.length) return { ok: false, status: 422, code: 'validation_failed', issues }

  return {
    ok: true,
    request: {
      origin,
      destination,
      departureDate,
      ...(returnDate ? { returnDate } : {}),
      travelerCount,
      tripMission: tripMission as BetaSearchRequest['tripMission'],
      travelerProfile: record.travelerProfile as BetaSearchRequest['travelerProfile'],
      preferences: {
        ...preferences,
        ...(tripType ? { tripType: tripType as SearchTripType } : {}),
        ...(preferredDepartureAirports ? { preferredDepartureAirports: preferredDepartureAirports.map((airport) => airport.toUpperCase()) } : {})
      }
    }
  }
}
