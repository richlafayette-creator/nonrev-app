import { sellableSeatSignalCaution, sellableSeatSignalScoreAdjustment, type SellableSeatSignal } from './sellableSeatSignal'

export type RecoveryStrength = 'Excellent' | 'Good' | 'Fair' | 'Poor'
export type RecoveryRiskLevel = 'Low' | 'Medium' | 'High' | 'Unknown'
export type RecoveryOptionType = 'later-flight' | 'alternate-airport' | 'overnight-hotel' | 'ground-transport' | 'next-day-flight'

/** Placeholder alternate airport candidate for failure recovery. */
export type AlternateAirport = {
  airportCode: string
  relation: 'departure' | 'arrival' | 'connection'
  estimatedGroundMinutes: number | null
  placeholderConfidence: 'placeholder'
  notes: string[]
}

/** Placeholder hotel fallback signal. No hotel API is called in this phase. */
export type HotelRecovery = {
  hotelLikely: boolean
  estimatedNightlyCost: number | null
  riskLevel: RecoveryRiskLevel
  notes: string[]
}

/** Placeholder ground-transport fallback signal. No rideshare, rental car, train, or bus API is called. */
export type GroundRecovery = {
  rentalCarPossible: boolean
  ridesharePossible: boolean
  trainPossible: boolean
  busPossible: boolean
  estimatedCost: number | null
  estimatedHours: number | null
  notes: string[]
}

/** A single recovery path the traveler could consider if the itinerary fails. */
export type RecoveryOption = {
  type: RecoveryOptionType
  label: string
  summary: string
  scoreImpact: number
  estimatedHours: number | null
  estimatedCost: number | null
  placeholder: true
}

/** Full Recovery Intelligence result attached by the Decision Engine. */
export type RecoveryAnalysis = {
  score: number
  strength: RecoveryStrength
  summary: string
  primaryRecoveryOption: RecoveryOption
  backupOptions: RecoveryOption[]
  laterFlightOpportunities: number
  alternateAirportCount: number
  alternateAirports: AlternateAirport[]
  overnightRisk: boolean
  estimatedRecoveryHours: number
  estimatedRecoveryCost: number
  rentalCarPossible: boolean
  hotelLikely: boolean
  strandedRisk: RecoveryRiskLevel
  weatherRisk: RecoveryRiskLevel
  delayRisk: RecoveryRiskLevel
  hotelRecovery: HotelRecovery
  groundRecovery: GroundRecovery
  reasons: string[]
}

type RecoveryLegLike = {
  origin?: string
  destination?: string
  departureTime?: string
  arrivalTime?: string
}

type RecoveryItineraryLike = {
  route: string
  legs?: RecoveryLegLike[]
  departureTime?: string
  arrivalTime?: string
  duration?: string
  status?: string
  dataFreshnessRule?: string
}

const alternateAirportMap: Record<string, string[]> = {
  BOS: ['PVD', 'MHT'],
  LAX: ['BUR', 'SNA', 'ONT', 'LGB'],
  OGG: ['HNL', 'KOA'],
  SBP: ['SBA', 'LAX', 'SFO'],
  NRT: ['HND'],
  HND: ['NRT'],
  SFO: ['OAK', 'SJC'],
  JFK: ['LGA', 'EWR'],
  EWR: ['JFK', 'LGA'],
  ORD: ['MDW'],
  DFW: ['DAL'],
  IAD: ['DCA', 'BWI'],
  SEA: ['PDX']
}

const denseRecoveryAirports = new Set(['ATL', 'BOS', 'DEN', 'DFW', 'EWR', 'HNL', 'JFK', 'LAX', 'ORD', 'SFO', 'SEA'])
const constrainedRecoveryAirports = new Set(['NRT', 'OGG', 'SBP'])
const islandOrInternationalAirports = new Set(['HNL', 'KOA', 'LIH', 'OGG', 'HND', 'NRT'])

/**
 * Scores itinerary recovery using deterministic placeholders only.
 * Future live hooks belong behind this function, not in provider/search code.
 */
export function analyzeRecovery(itinerary: RecoveryItineraryLike, sellableSeatSignal?: SellableSeatSignal): RecoveryAnalysis {
  const path = airportPath(itinerary)
  const origin = path[0] || 'TBD'
  const destination = path[path.length - 1] || 'TBD'
  const connections = Math.max(0, path.length - 2)
  const alternates = alternateAirportsFor(path)
  const laterFlightOpportunities = placeholderLaterFlightOpportunities(path, itinerary)
  const overnightRisk = placeholderOvernightRisk(itinerary, laterFlightOpportunities, destination)
  const rentalCarPossible = !path.some((airport) => islandOrInternationalAirports.has(airport)) || origin === destination
  const hotelLikely = destination !== 'TBD'
  const weatherRisk = placeholderWeatherRisk(path)
  const delayRisk = placeholderDelayRisk(itinerary, connections)
  const strandedRisk = placeholderStrandedRisk(laterFlightOpportunities, alternates.length, overnightRisk, weatherRisk, delayRisk)
  const estimatedRecoveryHours = placeholderRecoveryHours(laterFlightOpportunities, alternates.length, overnightRisk, strandedRisk)
  const estimatedRecoveryCost = placeholderRecoveryCost(overnightRisk, rentalCarPossible, alternates.length, destination)
  const score = clamp(recoveryScore({ laterFlightOpportunities, alternateAirportCount: alternates.length, overnightRisk, rentalCarPossible, hotelLikely, strandedRisk, weatherRisk, delayRisk, connections }) + sellableSeatSignalScoreAdjustment(sellableSeatSignal))
  const strength = recoveryStrength(score)
  const backupOptions = backupOptionsFor({ laterFlightOpportunities, alternates, overnightRisk, rentalCarPossible, hotelLikely, estimatedRecoveryHours, estimatedRecoveryCost })
  const primaryRecoveryOption = backupOptions[0] || recoveryOption('next-day-flight', 'Next-day recovery placeholder', 'Hold a next-day flight option if same-day recovery is unavailable.', -12, estimatedRecoveryHours, estimatedRecoveryCost)
  const reasons = recoveryReasons({ laterFlightOpportunities, alternateAirportCount: alternates.length, overnightRisk, rentalCarPossible, hotelLikely, strandedRisk }, sellableSeatSignal)

  return {
    score,
    strength,
    summary: `${strength} recovery profile: ${reasons.slice(0, 3).join(' ')}`,
    primaryRecoveryOption,
    backupOptions,
    laterFlightOpportunities,
    alternateAirportCount: alternates.length,
    alternateAirports: alternates,
    overnightRisk,
    estimatedRecoveryHours,
    estimatedRecoveryCost,
    rentalCarPossible,
    hotelLikely,
    strandedRisk,
    weatherRisk,
    delayRisk,
    hotelRecovery: {
      hotelLikely,
      estimatedNightlyCost: hotelLikely ? placeholderHotelCost(destination) : null,
      riskLevel: hotelLikely ? 'Low' : 'High',
      notes: ['Placeholder hotel recovery only; no hotel API has been called.']
    },
    groundRecovery: {
      rentalCarPossible,
      ridesharePossible: true,
      trainPossible: alternates.length > 0,
      busPossible: alternates.length > 0,
      estimatedCost: estimatedRecoveryCost,
      estimatedHours: estimatedRecoveryHours,
      notes: ['Placeholder ground recovery only; no rideshare, rental car, train, or bus API has been called.']
    },
    reasons
  }
}

function airportPath(itinerary: RecoveryItineraryLike) {
  const legPath = itinerary.legs?.length
    ? [itinerary.legs[0]?.origin, ...itinerary.legs.map((leg) => leg.destination)]
    : itinerary.route.split('→')
  return legPath.map((code) => normalizeAirportCode(code)).filter((code): code is string => Boolean(code))
}

function normalizeAirportCode(value?: string) {
  const match = String(value || '').toUpperCase().match(/\b[A-Z]{3}\b/)
  return match?.[0]
}

function alternateAirportsFor(path: string[]): AlternateAirport[] {
  return path.flatMap((airport, index) => {
    const relation: AlternateAirport['relation'] = index === 0 ? 'departure' : index === path.length - 1 ? 'arrival' : 'connection'
    return (alternateAirportMap[airport] || []).map((alternate, alternateIndex) => ({
      airportCode: alternate,
      relation,
      estimatedGroundMinutes: 45 + alternateIndex * 20,
      placeholderConfidence: 'placeholder' as const,
      notes: [`Placeholder alternate for ${airport}; no ground transport or live schedule API has been called.`]
    }))
  })
}

function placeholderLaterFlightOpportunities(path: string[], itinerary: RecoveryItineraryLike) {
  if (itinerary.dataFreshnessRule === 'route-framework') return 0
  const denseCount = path.filter((airport) => denseRecoveryAirports.has(airport)).length
  const constrainedPenalty = path.some((airport) => constrainedRecoveryAirports.has(airport)) ? 1 : 0
  return Math.max(0, Math.min(5, denseCount + (path.length <= 2 ? 1 : 0) - constrainedPenalty))
}

function placeholderOvernightRisk(itinerary: RecoveryItineraryLike, laterFlightOpportunities: number, destination: string) {
  const arrivalHour = hourFromTime(itinerary.arrivalTime || itinerary.legs?.[itinerary.legs.length - 1]?.arrivalTime)
  if (arrivalHour !== null && arrivalHour >= 21) return true
  if (constrainedRecoveryAirports.has(destination) && laterFlightOpportunities <= 1) return true
  return laterFlightOpportunities === 0
}

function placeholderWeatherRisk(path: string[]): RecoveryRiskLevel {
  if (path.some((airport) => ['BOS', 'EWR', 'JFK', 'LGA', 'ORD', 'SFO'].includes(airport))) return 'Medium'
  return 'Unknown'
}

function placeholderDelayRisk(itinerary: RecoveryItineraryLike, connections: number): RecoveryRiskLevel {
  if (String(itinerary.status || '').toLowerCase().includes('delay')) return 'High'
  if (connections >= 2) return 'Medium'
  return 'Unknown'
}

function placeholderStrandedRisk(laterFlightOpportunities: number, alternateAirportCount: number, overnightRisk: boolean, weatherRisk: RecoveryRiskLevel, delayRisk: RecoveryRiskLevel): RecoveryRiskLevel {
  if (overnightRisk && laterFlightOpportunities === 0) return 'High'
  if (delayRisk === 'High' || weatherRisk === 'High') return 'High'
  if (overnightRisk || laterFlightOpportunities <= 1 || alternateAirportCount === 0) return 'Medium'
  return 'Low'
}

function placeholderRecoveryHours(laterFlightOpportunities: number, alternateAirportCount: number, overnightRisk: boolean, strandedRisk: RecoveryRiskLevel) {
  const base = overnightRisk ? 14 : laterFlightOpportunities >= 3 ? 3 : laterFlightOpportunities >= 1 ? 6 : 12
  const alternateReduction = Math.min(2, alternateAirportCount * 0.5)
  const riskPenalty = strandedRisk === 'High' ? 4 : strandedRisk === 'Medium' ? 2 : 0
  return Math.max(2, Math.round(base - alternateReduction + riskPenalty))
}

function placeholderRecoveryCost(overnightRisk: boolean, rentalCarPossible: boolean, alternateAirportCount: number, destination: string) {
  const hotelCost = overnightRisk ? placeholderHotelCost(destination) : 0
  const groundCost = alternateAirportCount ? (rentalCarPossible ? 90 : 55) : 30
  return hotelCost + groundCost
}

function placeholderHotelCost(destination: string) {
  if (['HNL', 'OGG', 'NRT', 'HND'].includes(destination)) return 240
  if (['LAX', 'SFO', 'JFK', 'EWR', 'BOS'].includes(destination)) return 190
  return 150
}

function recoveryScore(input: { laterFlightOpportunities: number; alternateAirportCount: number; overnightRisk: boolean; rentalCarPossible: boolean; hotelLikely: boolean; strandedRisk: RecoveryRiskLevel; weatherRisk: RecoveryRiskLevel; delayRisk: RecoveryRiskLevel; connections: number }) {
  const riskPenalty = { Low: 0, Medium: 14, High: 30, Unknown: 6 }[input.strandedRisk]
  const weatherPenalty = { Low: 0, Medium: 8, High: 18, Unknown: 4 }[input.weatherRisk]
  const delayPenalty = { Low: 0, Medium: 8, High: 18, Unknown: 4 }[input.delayRisk]
  return clamp(
    48 + input.laterFlightOpportunities * 8 + Math.min(4, input.alternateAirportCount) * 5 + (input.rentalCarPossible ? 6 : 0) + (input.hotelLikely ? 4 : 0) - (input.overnightRisk ? 16 : 0) - input.connections * 5 - riskPenalty - weatherPenalty - delayPenalty
  )
}

function recoveryStrength(score: number): RecoveryStrength {
  if (score >= 82) return 'Excellent'
  if (score >= 65) return 'Good'
  if (score >= 45) return 'Fair'
  return 'Poor'
}

function backupOptionsFor(input: { laterFlightOpportunities: number; alternates: AlternateAirport[]; overnightRisk: boolean; rentalCarPossible: boolean; hotelLikely: boolean; estimatedRecoveryHours: number; estimatedRecoveryCost: number }): RecoveryOption[] {
  const options: RecoveryOption[] = []
  if (input.laterFlightOpportunities > 0) {
    options.push(recoveryOption('later-flight', 'Later flight placeholder', `${input.laterFlightOpportunities} later departure opportunity${input.laterFlightOpportunities === 1 ? '' : 'ies'} estimated from route density placeholders.`, 14, Math.max(2, input.estimatedRecoveryHours - 2), null))
  }
  if (input.alternates.length) {
    options.push(recoveryOption('alternate-airport', 'Alternate airport placeholder', `Consider ${input.alternates.slice(0, 3).map((airport) => airport.airportCode).join(', ')} if the primary airport fails.`, 10, input.estimatedRecoveryHours, input.rentalCarPossible ? 90 : 55))
  }
  if (input.rentalCarPossible) {
    options.push(recoveryOption('ground-transport', 'Ground recovery placeholder', 'Rental car or rideshare recovery may be possible for nearby airport moves.', 6, Math.max(2, input.estimatedRecoveryHours - 1), 90))
  }
  if (input.overnightRisk || input.hotelLikely) {
    options.push(recoveryOption('overnight-hotel', 'Hotel recovery placeholder', input.overnightRisk ? 'Overnight recovery may be needed; hold a hotel option.' : 'Hotel options are likely nearby if recovery slips overnight.', input.overnightRisk ? -6 : 3, input.overnightRisk ? 14 : null, input.estimatedRecoveryCost))
  }
  return options
}

function recoveryOption(type: RecoveryOptionType, label: string, summary: string, scoreImpact: number, estimatedHours: number | null, estimatedCost: number | null): RecoveryOption {
  return { type, label, summary, scoreImpact, estimatedHours, estimatedCost, placeholder: true }
}

function recoveryReasons(input: { laterFlightOpportunities: number; alternateAirportCount: number; overnightRisk: boolean; rentalCarPossible: boolean; hotelLikely: boolean; strandedRisk: RecoveryRiskLevel }, sellableSeatSignal?: SellableSeatSignal) {
  const reasons: string[] = []
  if (input.laterFlightOpportunities >= 3) reasons.push('Multiple backup departures')
  else if (input.laterFlightOpportunities > 0) reasons.push('Some later flight options')
  else reasons.push('Last flight or few later departures')
  if (input.alternateAirportCount > 0) reasons.push('Alternate airport available')
  else reasons.push('Few alternate airport options')
  if (input.hotelLikely) reasons.push('Hotel options nearby')
  if (input.rentalCarPossible) reasons.push('Ground recovery may be possible')
  if (input.overnightRisk) reasons.push('Overnight likely')
  reasons.push(`${input.strandedRisk} stranded risk`)
  const sellableSeatReason = sellableSeatSignalCaution(sellableSeatSignal)
  if (sellableSeatReason) reasons.push(sellableSeatReason)
  return reasons
}

function hourFromTime(value?: string) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) return date.getHours()
  const match = value.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i)
  if (!match) return null
  let hour = Number(match[1])
  const meridiem = match[3]?.toUpperCase()
  if (meridiem === 'PM' && hour < 12) hour += 12
  if (meridiem === 'AM' && hour === 12) hour = 0
  return hour
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
