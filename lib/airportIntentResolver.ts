import { airports as airportRows } from '@nwpr/airport-codes'
import { findFromCityStateProvince, lookupViaCity, type CityData } from 'city-timezones'

export type AirportResolutionType = 'airport' | 'city' | 'metro' | 'country' | 'region' | 'place' | 'unknown'

export type AirportCandidate = {
  code: string
  name: string
  city: string
  country: string
  latitude: number
  longitude: number
  timeZone?: string
  distanceMiles?: number
}

export type AirportIntentResolution = {
  originalText: string
  normalizedText: string
  type: AirportResolutionType
  candidates: AirportCandidate[]
  confidence: 'high' | 'medium' | 'low'
  explanation: string
}

export type RouteIntentResolution = {
  origin: AirportIntentResolution
  destination: AirportIntentResolution
}

type AirportRow = {
  name?: string
  city?: string
  country?: string
  iata?: string
  latitude?: number
  longitude?: number
  type?: string
  tz?: string
}

const metroAirportMap: Record<string, string[]> = {
  NYC: ['JFK', 'EWR', 'LGA'],
  LON: ['LHR', 'LGW', 'LCY', 'STN', 'LTN'],
  PAR: ['CDG', 'ORY'],
  TYO: ['HND', 'NRT'],
  WAS: ['DCA', 'IAD', 'BWI'],
  CHI: ['ORD', 'MDW']
}

const regionAirportMap: Record<string, string[]> = {
  EUROPE: ['CDG', 'FCO', 'AMS', 'FRA', 'MUC', 'ZRH', 'LHR', 'MAD'],
  JAPAN: ['HND', 'NRT', 'KIX'],
  ASIA: ['ICN', 'TPE', 'SIN', 'HKG', 'BKK'],
  CARIBBEAN: ['AUA', 'NAS', 'CUN', 'SJU']
}

const countryGatewayMap: Record<string, string[]> = {
  MALDIVES: ['MLE'],
  ITALY: ['FCO', 'MXP', 'VCE', 'NAP'],
  FRANCE: ['CDG', 'ORY', 'NCE'],
  JAPAN: ['HND', 'NRT', 'KIX'],
  UNITEDKINGDOM: ['LHR', 'LGW', 'MAN', 'EDI'],
  UNITEDSTATES: ['JFK', 'EWR', 'LAX', 'ORD', 'DFW', 'ATL']
}

const airportByCode = new Map<string, AirportCandidate>()
const airportsByCity = new Map<string, AirportCandidate[]>()
const airportsByCountry = new Map<string, AirportCandidate[]>()
const searchableAirports: AirportCandidate[] = []

function normalizeSearchText(value: unknown) {
  return typeof value === 'string'
    ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
    : ''
}

function compactKey(value: unknown) {
  return normalizeSearchText(value).replace(/\s+/g, '')
}

function airportCode(value: unknown) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(code) ? code : ''
}

function practicalAirport(row: AirportRow) {
  const code = airportCode(row.iata)
  if (!code || row.type !== 'airport') return false
  const name = row.name || ''
  if (/(heliport|seaplane|military|air base|airbase|naval|army|private|closed)/i.test(name)) return false
  return typeof row.latitude === 'number' && typeof row.longitude === 'number'
}

function toCandidate(row: AirportRow): AirportCandidate | undefined {
  if (!practicalAirport(row)) return undefined
  return {
    code: airportCode(row.iata),
    name: row.name || airportCode(row.iata),
    city: row.city || '',
    country: row.country || '',
    latitude: row.latitude!,
    longitude: row.longitude!,
    ...(row.tz ? { timeZone: row.tz } : {})
  }
}

function airportRelevanceScore(candidate: AirportCandidate) {
  let score = 0
  const gatewayPriority = gatewayCodePriority(candidate.code)
  if (gatewayPriority !== undefined) score += Math.max(0, 80 - gatewayPriority * 4)
  if (/international/i.test(candidate.name)) score += 50
  if (/\b(airport|aeropuerto|aeroport)\b/i.test(candidate.name)) score += 10
  if (/\bmunicipal|regional|county\b/i.test(candidate.name)) score -= 8
  if (/\bexecutive|general aviation|municipal seaplane\b/i.test(candidate.name)) score -= 20
  if (/^[A-Z]{3}$/.test(candidate.code)) score += 10
  return score
}

function gatewayCodePriority(code: string) {
  const gatewayLists = [...Object.values(countryGatewayMap), ...Object.values(regionAirportMap)]
  let priority: number | undefined
  gatewayLists.forEach((codes) => {
    const index = codes.indexOf(code)
    if (index === -1) return
    priority = priority === undefined ? index : Math.min(priority, index)
  })
  return priority
}

for (const row of airportRows as AirportRow[]) {
  const candidate = toCandidate(row)
  if (!candidate || airportByCode.has(candidate.code)) continue
  airportByCode.set(candidate.code, candidate)
  searchableAirports.push(candidate)
  const city = compactKey(candidate.city)
  if (city) airportsByCity.set(city, [...(airportsByCity.get(city) || []), candidate])
  const country = compactKey(candidate.country)
  if (country) airportsByCountry.set(country, [...(airportsByCountry.get(country) || []), candidate])
}

function uniqueCandidates(candidates: AirportCandidate[], limit = 6) {
  const seen = new Set<string>()
  return candidates
    .filter((candidate) => {
      if (seen.has(candidate.code)) return false
      seen.add(candidate.code)
      return true
    })
    .sort((a, b) => airportRelevanceScore(b) - airportRelevanceScore(a) || a.code.localeCompare(b.code))
    .slice(0, limit)
}

function candidatesForCodes(codes: string[], limit = codes.length) {
  const seen = new Set<string>()
  return codes
    .map((code) => airportByCode.get(code))
    .filter((item): item is AirportCandidate => Boolean(item))
    .filter((candidate) => {
      if (seen.has(candidate.code)) return false
      seen.add(candidate.code)
      return true
    })
    .slice(0, limit)
}

function cityCandidates(text: string) {
  const candidates = uniqueCandidates(airportsByCity.get(compactKey(text)) || [])
  const primary = candidates[0]
  if (!primary || gatewayCodePriority(primary.code) === undefined) return candidates
  return candidates.filter((candidate) => candidate.country === primary.country)
}

function airportNameCandidates(text: string) {
  const normalized = normalizeSearchText(text)
  if (!normalized || normalized.length < 4) return []
  return uniqueCandidates(searchableAirports.filter((airport) =>
    normalizeSearchText(airport.name) === normalized ||
    normalizeSearchText(airport.name).includes(normalized)
  ))
}

function countryCandidates(text: string) {
  const key = compactKey(text)
  if (countryGatewayMap[key]) return candidatesForCodes(countryGatewayMap[key], 6)
  return uniqueCandidates(airportsByCountry.get(key) || [], 6)
}

function regionCandidates(text: string) {
  return candidatesForCodes(regionAirportMap[compactKey(text)] || [], 8)
}

function cityLookup(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const matches = findFromCityStateProvince(normalized)
  if (matches.length) return matches
  const cityOnly = normalized.split(',')[0]?.trim()
  return cityOnly ? lookupViaCity(cityOnly) : []
}

function stateHint(text: string) {
  return text.match(/,\s*([A-Za-z]{2})\b/)?.[1]?.toUpperCase() || text.match(/\b([A-Za-z]{2})$/)?.[1]?.toUpperCase()
}

function bestPlaceMatch(text: string) {
  const hint = stateHint(text)
  const matches = cityLookup(text)
    .filter((item) => !hint || item.state_ansi === hint || item.iso2 === hint || compactKey(item.province) === compactKey(hint))
    .sort((a, b) => (b.pop || 0) - (a.pop || 0))
  return matches[0]
}

function distanceMiles(a: { latitude: number; longitude: number }, b: { lat: number; lng: number }) {
  const radius = 3958.8
  const toRad = (value: number) => value * Math.PI / 180
  const dLat = toRad(b.lat - a.latitude)
  const dLon = toRad(b.lng - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

function practicalPlaceAirport(candidate: AirportCandidate) {
  if (gatewayCodePriority(candidate.code) !== undefined) return true
  if (/international/i.test(candidate.name)) return true
  return airportRelevanceScore(candidate) >= 50
}

function nearestAirports(place: CityData, limit = 5) {
  const nearby = searchableAirports
    .map((airport) => ({ ...airport, distanceMiles: Math.round(distanceMiles(airport, { lat: place.lat, lng: place.lng }) * 10) / 10 }))
    .filter((airport) => airport.distanceMiles !== undefined && airport.distanceMiles <= 260)
    .sort((a, b) => {
      const aPracticality = airportRelevanceScore(a) - (a.distanceMiles || 0)
      const bPracticality = airportRelevanceScore(b) - (b.distanceMiles || 0)
      return bPracticality - aPracticality || (a.distanceMiles || 0) - (b.distanceMiles || 0)
    })
  const practical = nearby.filter(practicalPlaceAirport)
  return (practical.length ? practical : nearby).slice(0, limit)
}

function withResolution(originalText: string, type: AirportResolutionType, candidates: AirportCandidate[], explanation: string, confidence: AirportIntentResolution['confidence'] = 'high'): AirportIntentResolution {
  return {
    originalText,
    normalizedText: normalizeSearchText(originalText),
    type,
    candidates,
    confidence: candidates.length ? confidence : 'low',
    explanation: candidates.length ? explanation : `No supported commercial airport could be resolved from "${originalText}".`
  }
}

export function resolveAirportIntent(text: string): AirportIntentResolution {
  const originalText = text.trim()
  const cleaned = stripDateNoise(originalText)
  const exactCode = airportCode(cleaned)
  if (exactCode && airportByCode.has(exactCode)) {
    return withResolution(originalText, 'airport', candidatesForCodes([exactCode], 1), `${exactCode} is an exact IATA airport match.`)
  }

  const closestMatch = cleaned.match(/^closest\s+airport\s+to\s+(.+)$/i)
  if (closestMatch) {
    const placeText = closestMatch[1].trim()
    const place = bestPlaceMatch(placeText)
    const candidates = place ? nearestAirports(place, 5) : []
    return withResolution(
      originalText,
      'place',
      candidates,
      place && candidates.length ? `Using nearby commercial airports for ${place.city}, ${place.state_ansi || place.province || place.country}.` : '',
      candidates.length ? 'medium' : 'low'
    )
  }

  const metroCodes = metroAirportMap[compactKey(cleaned)]
  if (metroCodes) {
    return withResolution(originalText, 'metro', candidatesForCodes(metroCodes), `${cleaned.toUpperCase()} resolves to a metro airport set.`)
  }

  const region = regionCandidates(cleaned)
  if (region.length) return withResolution(originalText, 'region', region, `${cleaned} resolves to a region airport set.`, 'medium')

  const country = countryCandidates(cleaned)
  if (country.length) return withResolution(originalText, 'country', country, `${cleaned} resolves to country gateway airports.`, country.length === 1 ? 'high' : 'medium')

  const city = cityCandidates(cleaned)
  if (city.length) return withResolution(originalText, 'city', city, `${cleaned} resolves by airport city name.`, city.length === 1 ? 'high' : 'medium')

  const airportName = airportNameCandidates(cleaned)
  if (airportName.length) return withResolution(originalText, 'airport', airportName, `${cleaned} resolves by airport name.`, airportName.length === 1 ? 'high' : 'medium')

  return withResolution(originalText, 'unknown', [], '')
}

function stripDateNoise(text: string) {
  return text
    .replace(/\b(today|tomorrow|tonight|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi, ' ')
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{2,4})?\b/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, '')
    .trim()
}

export function splitRouteIntent(prompt: string) {
  const text = stripDateNoise(prompt).trim()
  const toClosest = text.match(/^(.+?)\s+to\s+(closest\s+airport\s+to\s+.+)$/i)
  if (toClosest) return { originText: toClosest[1].trim(), destinationText: toClosest[2].trim() }
  const closestTo = text.match(/^(closest\s+airport\s+to\s+.+)\s+to\s+(.+)$/i)
  if (closestTo) return { originText: closestTo[1].trim(), destinationText: closestTo[2].trim() }
  const generic = text.match(/^(.+?)\s+(?:to|into)\s+(.+)$/i)
  if (generic) return { originText: generic[1].replace(/^(from|leaving|departing|out of)\s+/i, '').trim(), destinationText: generic[2].trim() }
  return { originText: '', destinationText: '' }
}

export function resolveRouteIntent(prompt: string): RouteIntentResolution | undefined {
  const split = splitRouteIntent(prompt)
  if (!split.originText || !split.destinationText) return undefined
  return {
    origin: resolveAirportIntent(split.originText),
    destination: resolveAirportIntent(split.destinationText)
  }
}

export const airportIntentCoverage = Object.freeze({
  source: '@nwpr/airport-codes@3.0.3 / OpenFlights + city-timezones@1.3.4',
  airportCount: searchableAirports.length,
  metroCodeCount: Object.keys(metroAirportMap).length,
  cityCount: airportsByCity.size,
  countryCount: airportsByCountry.size
})

export function airportByIata(code: string) {
  return airportByCode.get(airportCode(code))
}
