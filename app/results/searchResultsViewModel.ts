import { type BetaSearchStoredResult } from '../../lib/betaSearchClient'
import { type SearchApiSuccessResponse } from '../../lib/searchResponse'

export type SearchResultsViewModel = {
  title: string
  subtitle: string
  publicPreview?: {
    enabled: boolean
    lockedMessage: string
    lockedFeatures: string[]
  }
  dataQualityLabel: string
  staticOnlyNotice: string
  providerReadinessLabel: string
  warnings: string[]
  missingData: string[]
  hasStoredResult: boolean
  mobileStructure: {
    usesSingleColumnCards: boolean
    hasSemanticHeadings: boolean
    hasTapTargets: boolean
  }
  cards: SearchPlanCardViewModel[]
  secondaryCards: SearchPlanCardViewModel[]
}

export type SearchPlanCardViewModel = {
  key: string
  label: 'Plan A' | 'Plan B' | 'Plan C'
  rank: number
  status: string
  searchOrigin: string
  searchDestination: string
  gateway: string
  destinationLabel: string
  destinationContext: string
  finalScore: number
  confidence: number
  planningSuccessScore: number
  planningScoreNote: string
  wholePartyZedLabel: string
  zedEligibilityLabel: string
  zedEligibilityStatus: 'eligible' | 'partial' | 'not_eligible' | 'unknown'
  zedEligibilityAction: string
  eligibleZedAirlinesLabel: string
  shortSummary: string
  strengths: string[]
  weaknesses: string[]
  risks: string[]
  switchConditions: string[]
  transportModes: string[]
  fallbacks: string[]
  dataWarnings: string[]
  dataQualityLevel: SearchApiSuccessResponse['dataQuality']
  unknownIndicators: string[]
  resultClass: 'scheduled' | 'partial' | 'framework'
  resultClassLabel: string
  resultClassSummary: string
  segments: SearchSegmentViewModel[]
}

export type CompactItinerarySummary = {
  optionLabel: string
  flightSummary: string
  routeSummary: string
  timeSummary: string
  durationLabel: string
  stopsLabel: string
  airlineCode: string
  airlineName: string
  zedLabel: string
  loadLabel: string
}

export type ExpandedItineraryIdentity = {
  requestedJourneyLabel: string
  scheduleState: string
  verifiedSegmentLabel: string
  verifiedSegments: Array<{
    key: string
    route: string
    flight: string
    time: string
  }>
  unverifiedSummary: string
}

export type SearchSegmentViewModel = {
  key: string
  origin: string
  destination: string
  transportType: string
  carrierLabel: string
  airlineCode: string
  airlineName: string
  flightNumber: string
  departureTime: string
  departureDate: string
  departureRequestDate: string
  scheduledDepartureUtc?: string
  departureTimeZone?: string
  arrivalTime: string
  arrivalDate: string
  scheduledArrivalUtc?: string
  arrivalTimeZone?: string
  arrivalRequestDate: string
  timeBasis: string
  estimatedDuration: string
  notes: string[]
  scheduleStatus: string
  loadStatus: string
}

const planningScoreNote = 'This is a planning score based on available signals, not a guarantee of boarding.'

function clampScore(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function knownText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() && !/^unknown\b/i.test(value.trim()) ? value.trim() : fallback
}

function knownScheduleValue(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return Boolean(text) && !/^(unknown|not provided|pending|flight tbd|tbd|departure time unavailable|arrival time unavailable|flight number unavailable)/i.test(text)
}

const airlineNameByCode: Record<string, string> = {
  AA: 'American Airlines',
  AC: 'Air Canada',
  AF: 'Air France',
  AS: 'Alaska Airlines',
  BA: 'British Airways',
  B6: 'JetBlue',
  DL: 'Delta Air Lines',
  EK: 'Emirates',
  F9: 'Frontier Airlines',
  HA: 'Hawaiian Airlines',
  JL: 'Japan Airlines',
  KL: 'KLM Royal Dutch Airlines',
  LH: 'Lufthansa',
  NH: 'ANA',
  NK: 'Spirit Airlines',
  OO: 'SkyWest Airlines',
  QF: 'Qantas',
  QR: 'Qatar Airways',
  UA: 'United Airlines',
  VS: 'Virgin Atlantic',
  WN: 'Southwest Airlines'
}

function compactCarrierCode(carrier: string, flightNumber: string) {
  const normalizedCarrier = carrier.trim().toUpperCase()
  const normalizedFlight = flightNumber.replace(/\s+/g, '').toUpperCase()
  const flightCode = normalizedFlight.match(/^([A-Z]{1,2}|[A-Z]\d|\d[A-Z])\d{1,4}[A-Z]?$/)?.[1]
  if (/^[A-Z0-9]{2,3}$/.test(normalizedCarrier)) return normalizedCarrier
  if (flightCode) return flightCode
  if (/american/.test(normalizedCarrier.toLowerCase())) return 'AA'
  if (/delta/.test(normalizedCarrier.toLowerCase())) return 'DL'
  if (/united/.test(normalizedCarrier.toLowerCase())) return 'UA'
  if (/alaska/.test(normalizedCarrier.toLowerCase())) return 'AS'
  if (/hawaiian/.test(normalizedCarrier.toLowerCase())) return 'HA'
  if (/ana|all nippon/.test(normalizedCarrier.toLowerCase())) return 'NH'
  if (/japan airlines/.test(normalizedCarrier.toLowerCase())) return 'JL'
  const initials = carrier.split(/\s+/).map((part) => part[0]).join('').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()
  return initials || 'AIR'
}

function airlineNameFromNotes(notes: string[]) {
  const raw = notes.find((note) => /^airline:/i.test(note))?.replace(/^airline:\s*/i, '').trim()
  if (!raw) return ''
  return raw.replace(/\s+[A-Z0-9]{2,3}$/i, '').trim() || raw
}

function airlineNameForDisplay(carrier: string, airlineCode: string, notes: string[]) {
  const fromNotes = airlineNameFromNotes(notes)
  if (fromNotes && !/^[A-Z0-9]{2,3}$/i.test(fromNotes)) return fromNotes
  const mapped = airlineNameByCode[airlineCode.toUpperCase()]
  if (mapped) return mapped
  const cleanedCarrier = carrier.replace(/\s+/g, ' ').trim()
  if (cleanedCarrier && !/^(unknown|carrier not confirmed|[A-Z0-9]{2,3})$/i.test(cleanedCarrier)) return cleanedCarrier
  return airlineCode && airlineCode !== 'AIR' ? `Airline code ${airlineCode}` : 'Carrier not confirmed'
}

function monthLabel(month: string) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1] || ''
}

function formatIsoDate(year: string, month: string, day: string) {
  const label = monthLabel(month)
  return label ? `${label} ${Number(day)}` : `${year}-${month}-${day}`
}

function formatLocalDate(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric'
  }).formatToParts(date).map((part) => [part.type, part.value]))
  return parts.month && parts.day ? `${parts.month} ${Number(parts.day)}` : ''
}

function formatLocalIsoDate(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).map((part) => [part.type, part.value]))
  return parts.year && parts.month && parts.day ? `${parts.year}-${parts.month}-${parts.day}` : ''
}

function formatLocalTime(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).formatToParts(date).map((part) => [part.type, part.value]))
  return parts.hour && parts.minute && parts.dayPeriod ? `${Number(parts.hour)}:${parts.minute} ${parts.dayPeriod}` : ''
}

function canFormatTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date('2026-01-01T00:00:00Z'))
    return true
  } catch {
    return false
  }
}

function formatScheduleTime(value: unknown, fallback: string, timeZone?: string) {
  const text = knownText(value, '')
  if (!text) return { time: fallback, date: '', requestDate: '', basis: 'Time unavailable' }
  if (timeZone && canFormatTimeZone(timeZone)) {
    const parsed = Date.parse(text)
    if (Number.isFinite(parsed)) {
      const date = new Date(parsed)
      const localTime = formatLocalTime(date, timeZone)
      const localDate = formatLocalDate(date, timeZone)
      const requestDate = formatLocalIsoDate(date, timeZone)
      if (localTime && localDate) return { time: localTime, date: localDate, requestDate, basis: `Airport-local time (${timeZone})` }
    }
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{3})?)?(Z|[+-]\d{2}:\d{2})?$/)
  if (!iso) {
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return { time: fallback, date: '', requestDate: '', basis: 'Unsupported provider timestamp format' }
    return { time: text, date: '', requestDate: '', basis: 'Provider formatted time' }
  }

  const [, year, month, day, hour, minute, zone] = iso
  const date = formatIsoDate(year, month, day)
  const requestDate = `${year}-${month}-${day}`
  if (zone === 'Z') return { time: `${hour}:${minute} UTC`, date, requestDate, basis: 'UTC shown; airport-local conversion unavailable' }
  if (zone) return { time: `${hour}:${minute} UTC${zone}`, date, requestDate, basis: 'Provider timestamp offset shown' }
  return { time: `${hour}:${minute}`, date, requestDate, basis: 'Provider timestamp without timezone' }
}

function scheduleStatus(schedule: SearchApiSuccessResponse['segments'][number]['schedule']) {
  const values = [schedule.flightNumber, schedule.departureTime, schedule.arrivalTime]
  if (values.some((value) => /^unknown\b/i.test(value))) return 'Schedule not yet verified'
  const departure = formatScheduleTime(schedule.scheduledDepartureUtc || schedule.departureTime, 'Departure time unavailable', schedule.departureAirportTimeZone || schedule.departureTimeZone)
  const arrival = formatScheduleTime(schedule.scheduledArrivalUtc || schedule.arrivalTime, 'Arrival time unavailable', schedule.arrivalAirportTimeZone || schedule.arrivalTimeZone)
  return `${schedule.flightNumber} · ${departure.time} -> ${arrival.time}`
}

function loadStatus(schedule: SearchApiSuccessResponse['segments'][number]['schedule']) {
  return /^unknown\b/i.test(schedule.seatCount) ? 'Live load unavailable' : schedule.seatCount
}

function segmentHasOperatingSchedule(segment: SearchApiSuccessResponse['segments'][number]) {
  if (segment.mode !== 'flight') return false
  return knownScheduleValue(segment.schedule.flightNumber) &&
    knownScheduleValue(segment.schedule.departureTime) &&
    knownScheduleValue(segment.schedule.arrivalTime)
}

function classifySegments(segments: SearchApiSuccessResponse['segments']) {
  const flightSegments = segments.filter((segment) => segment.mode === 'flight')
  const scheduledFlightCount = flightSegments.filter(segmentHasOperatingSchedule).length
  if (segments.length && flightSegments.length === segments.length && scheduledFlightCount === flightSegments.length) {
    return {
      resultClass: 'scheduled' as const,
      resultClassLabel: 'Scheduled itinerary',
      resultClassSummary: 'Operating flight schedule data is attached for every displayed flight segment.'
    }
  }
  if (scheduledFlightCount > 0) {
    return {
      resultClass: 'partial' as const,
      resultClassLabel: 'Partial schedule',
      resultClassSummary: 'Some operating flight schedule data is attached, but at least one segment still needs verification.'
    }
  }
  return {
    resultClass: 'framework' as const,
    resultClassLabel: 'Route to investigate',
    resultClassSummary: 'This is a route framework only; operating flights and schedules have not been verified.'
  }
}

function endpointCoverageClassification(
  classification: ReturnType<typeof classifySegments>,
  segments: SearchApiSuccessResponse['segments'],
  searchOrigin: string,
  searchDestination?: string
) {
  if (classification.resultClass !== 'scheduled' || !segments.length || !searchOrigin || !searchDestination) return classification
  const first = segments[0]
  const last = segments[segments.length - 1]
  if (first?.origin?.toUpperCase() === searchOrigin.toUpperCase() && last?.destination?.toUpperCase() === searchDestination.toUpperCase()) {
    return classification
  }
  return {
    resultClass: 'partial' as const,
    resultClassLabel: 'Partial itinerary',
    resultClassSummary: `Verified schedule data covers only part of the requested ${searchOrigin.toUpperCase()} to ${searchDestination.toUpperCase()} itinerary. Expand to see the attached flight legs.`
  }
}

function zedLabel(detail: SearchApiSuccessResponse['recommendationDetails'][number] | undefined) {
  if (!detail) return 'Carrier unknown'
  const text = [
    ...detail.dataWarnings,
    ...detail.risks.map((risk) => `${risk.code} ${risk.title} ${risk.description}`)
  ].join(' ').toLowerCase()
  if (/stale-zed-verification|stale or expired/.test(text)) return 'Agreement stale'
  if (/carrier codes unavailable|carrier unknown|zed eligibility cannot be carrier-confirmed/.test(text)) return 'Carrier unknown'
  if (detail.wholePartyZedEligible) return 'Entire party eligible'
  if (detail.eligibleZedAirlines.length) return 'Partially eligible'
  return 'No verified agreement'
}

function itineraryZedEligibility(
  itinerary: SearchApiSuccessResponse['itineraries'][number] | undefined,
  detail: SearchApiSuccessResponse['recommendationDetails'][number] | undefined
) {
  const status = itinerary?.zedEligibility?.status
  if (status === 'eligible' || status === 'partial' || status === 'not_eligible' || status === 'unknown') {
    return {
      label: itinerary?.zedEligibility?.label || 'ZED eligibility unknown',
      status,
      action: itinerary?.zedEligibility?.action || ''
    }
  }
  const fallbackLabel = zedLabel(detail)
  return {
    label: fallbackLabel === 'Entire party eligible' ? 'ZED eligible' : fallbackLabel,
    status: fallbackLabel === 'Entire party eligible'
      ? 'eligible' as const
      : fallbackLabel === 'Partially eligible'
        ? 'partial' as const
        : fallbackLabel === 'No verified agreement'
          ? 'not_eligible' as const
          : 'unknown' as const,
    action: fallbackLabel === 'Entire party eligible' ? '' : 'Review ZED agreements'
  }
}

function fallbackSummaries(fallbacks: SearchApiSuccessResponse['fallbacks']) {
  return uniqueStrings(fallbacks.map((fallback) => `${fallback.label}: ${fallback.summary}`))
}

function dataQualityLabel(value: SearchApiSuccessResponse['dataQuality']) {
  return `Data quality: ${value}`
}

function providerReadinessLabel(result: SearchApiSuccessResponse) {
  const configured = result.providerReadiness.schedule.filter((provider) => provider.enabled && provider.credentialConfigured).length
  const enabled = result.providerReadiness.schedule.filter((provider) => provider.enabled).length
  if (!enabled) return 'Schedule sources are not enabled.'
  if (!configured) return 'Schedule sources are enabled but not ready.'
  return `${configured} of ${enabled} enabled schedule source${enabled === 1 ? '' : 's'} ready.`
}

function staticOnlyNotice(result: SearchApiSuccessResponse) {
  const text = [
    ...result.warnings,
    ...result.unknownScheduleIndicators,
    ...result.missingData
  ].join(' ').toLowerCase()
  if (/schedule data: aviationstack|provider_reported/i.test(JSON.stringify(result.itineraries))) {
    return 'Schedule and status fields include source data where segments matched. Live standby loads may still be unavailable.'
  }
  if (/live|unknown|not attached|unavailable|not provided/.test(text)) {
    return 'Current recommendations use route and profile signals. Some schedules or standby loads may be missing.'
  }
  return 'Recommendations include only the data returned by the beta search API.'
}

function cardDestination(stored: BetaSearchStoredResult) {
  if (stored.destination.mode === 'region') {
    return {
      destinationLabel: stored.destination.label,
      destinationContext: `Region search: ${stored.destination.label}. ${stored.destination.placeholderAirport || 'a temporary airport code'} was used only to complete the search request and is not the final destination.`
    }
  }
  return {
    destinationLabel: stored.destination.label,
    destinationContext: `Specific airport search: ${stored.destination.label}.`
  }
}

function resolutionCodes(resolution: BetaSearchStoredResult['originResolution'] | BetaSearchStoredResult['destination']['resolution'] | undefined) {
  return uniqueStrings((resolution?.candidates || []).map((candidate) => candidate.code).filter(Boolean))
}

function resolutionSummary(
  role: 'origin' | 'destination',
  selectedCode: string,
  resolution: BetaSearchStoredResult['originResolution'] | BetaSearchStoredResult['destination']['resolution'] | undefined
) {
  if (!resolution) return ''
  const codes = resolutionCodes(resolution)
  if (!codes.length) return ''
  const original = resolution.originalText || selectedCode
  const exactAirport = resolution.type === 'airport' && codes.length === 1 && codes[0] === selectedCode && original.toUpperCase() === selectedCode
  if (exactAirport) return ''
  const selected = codes.includes(selectedCode) ? selectedCode : codes[0]
  const alternatives = codes.filter((code) => code !== selected)
  const suffix = alternatives.length ? `; alternatives ${alternatives.join(', ')}` : ''
  if (resolution.type === 'place') {
    const place = original.replace(/^closest\s+airport\s+to\s+/i, '').trim() || original
    return `Using ${selected} for ${place}${suffix}`
  }
  if (resolution.type === 'city') {
    return `Using ${selected} for ${original}${suffix}`
  }
  if (resolution.type === 'metro' || resolution.type === 'region') {
    return `${role} ${original} -> ${codes.join(', ')}`
  }
  return `${role} ${original} -> ${selected}${suffix}`
}

function routeResolutionSubtitle(stored: BetaSearchStoredResult) {
  const parts = [
    resolutionSummary('origin', stored.request.origin, stored.originResolution),
    resolutionSummary('destination', stored.request.destination, stored.destination.resolution)
  ].filter(Boolean)
  return parts.length ? ` Resolved ${parts.join('; ')}.` : ''
}

function segmentsForPlan(result: SearchApiSuccessResponse, label: SearchPlanCardViewModel['label']): SearchSegmentViewModel[] {
  const itinerary = result.itineraries.find((item) => item.recommendationLabel === label)
  const segments = itinerary?.segments || result.segments.filter((segment) => segment.id.includes(label.toLowerCase().replace(/\s+/g, '-')))
  return segmentsForDisplay(segments, label)
}

function segmentsForDisplay(segments: SearchApiSuccessResponse['segments'], label: SearchPlanCardViewModel['label']): SearchSegmentViewModel[] {
  return segments.map((segment, index) => {
    const departure = formatScheduleTime(segment.schedule.scheduledDepartureUtc || segment.schedule.departureTime, 'Departure time unavailable', segment.schedule.departureAirportTimeZone || segment.schedule.departureTimeZone)
    const arrival = formatScheduleTime(segment.schedule.scheduledArrivalUtc || segment.schedule.arrivalTime, 'Arrival time unavailable', segment.schedule.arrivalAirportTimeZone || segment.schedule.arrivalTimeZone)
    const flightNumber = knownText(segment.schedule.flightNumber, 'Flight number unavailable')
    const carrier = knownText(segment.carrier, '')
    const airlineCode = compactCarrierCode(carrier, flightNumber)
    const airlineName = airlineNameForDisplay(carrier, airlineCode, segment.notes)
    return {
      key: segment.id || `${label}-segment-${index + 1}`,
      origin: segment.origin,
      destination: segment.destination,
      transportType: segment.mode,
      carrierLabel: carrier || airlineName,
      airlineCode,
      airlineName,
      flightNumber,
      departureTime: departure.time,
      departureDate: departure.date,
      departureRequestDate: departure.requestDate,
      ...(knownScheduleValue(segment.schedule.scheduledDepartureUtc) ? { scheduledDepartureUtc: segment.schedule.scheduledDepartureUtc } : {}),
      ...(knownScheduleValue(segment.schedule.departureTimeZone) ? { departureTimeZone: segment.schedule.departureTimeZone } : {}),
      arrivalTime: arrival.time,
      arrivalDate: arrival.date,
      ...(knownScheduleValue(segment.schedule.scheduledArrivalUtc) ? { scheduledArrivalUtc: segment.schedule.scheduledArrivalUtc } : {}),
      ...(knownScheduleValue(segment.schedule.arrivalTimeZone) ? { arrivalTimeZone: segment.schedule.arrivalTimeZone } : {}),
      arrivalRequestDate: arrival.requestDate,
      timeBasis: uniqueStrings([departure.basis, arrival.basis]).join(' · '),
      estimatedDuration: knownText(segment.estimatedDuration, ''),
      notes: segment.notes,
      scheduleStatus: scheduleStatus(segment.schedule),
      loadStatus: loadStatus(segment.schedule)
    }
  })
}

function transportModes(segments: SearchSegmentViewModel[]) {
  return uniqueStrings(segments.map((segment) => segment.transportType))
}

function risks(detail: SearchApiSuccessResponse['recommendationDetails'][number] | undefined, compactRisks: string[]) {
  if (detail?.risks.length) return detail.risks.map((risk) => `${risk.title}: ${risk.description}`)
  return compactRisks
}

function itinerarySortClass(value: SearchPlanCardViewModel['resultClass']) {
  if (value === 'scheduled') return 0
  if (value === 'partial') return 1
  return 2
}

function sortCards(cards: SearchPlanCardViewModel[]) {
  return [...cards].sort((first, second) =>
    itinerarySortClass(first.resultClass) - itinerarySortClass(second.resultClass) ||
    first.rank - second.rank ||
    second.confidence - first.confidence ||
    first.key.localeCompare(second.key)
  )
}

function cardFromItinerary(input: {
  itinerary: SearchApiSuccessResponse['itineraries'][number]
  recommendation?: SearchApiSuccessResponse['recommendations']['ranked'][number]
  detail?: SearchApiSuccessResponse['recommendationDetails'][number]
  destination: ReturnType<typeof cardDestination>
  searchOrigin: string
  searchDestination?: string
  dataQuality: SearchApiSuccessResponse['dataQuality']
  index: number
}): SearchPlanCardViewModel {
  const { itinerary, recommendation, detail, destination, searchOrigin, searchDestination, dataQuality, index } = input
  const classification = endpointCoverageClassification(classifySegments(itinerary.segments), itinerary.segments, searchOrigin, searchDestination)
  const segments = segmentsForDisplay(itinerary.segments, itinerary.recommendationLabel)
  const rank = recommendation?.rank || itinerary.recommendationRank || index + 1
  const zedEligibility = itineraryZedEligibility(itinerary, detail)
  return {
    key: itinerary.id || `${itinerary.recommendationLabel}-${index + 1}`,
    label: itinerary.recommendationLabel,
    rank,
    status: recommendation?.status || classification.resultClassLabel,
    searchOrigin,
    searchDestination: searchDestination || destination.destinationLabel,
    gateway: itinerary.gateway,
    ...destination,
    finalScore: clampScore(recommendation?.finalScore ?? itinerary.confidence),
    confidence: clampScore(recommendation?.confidence ?? itinerary.confidence),
    planningSuccessScore: clampScore(recommendation?.estimatedSuccess ?? itinerary.confidence),
    planningScoreNote,
    wholePartyZedLabel: zedLabel(detail),
    zedEligibilityLabel: zedEligibility.label,
    zedEligibilityStatus: zedEligibility.status,
    zedEligibilityAction: zedEligibility.action,
    eligibleZedAirlinesLabel: itinerary.zedEligibility?.eligibleCarriers.length ? itinerary.zedEligibility.eligibleCarriers.join(', ') : detail?.eligibleZedAirlines.length ? detail.eligibleZedAirlines.join(', ') : 'None carrier-confirmed',
    shortSummary: itinerary.summary || recommendation?.summary || classification.resultClassSummary,
    strengths: detail?.strengths || [],
    weaknesses: detail?.weaknesses || [],
    risks: risks(detail, recommendation?.risks || []),
    switchConditions: detail?.switchConditions || [],
    transportModes: transportModes(segments),
    fallbacks: fallbackSummaries(itinerary.fallbacks),
    dataWarnings: uniqueStrings([...(detail?.dataWarnings || []), ...(recommendation?.warnings || []), ...itinerary.missingData]),
    dataQualityLevel: dataQuality,
    unknownIndicators: itinerary.unknownScheduleIndicators,
    ...classification,
    segments
  }
}

function cardFromRecommendation(input: {
  result: SearchApiSuccessResponse
  label: SearchPlanCardViewModel['label']
  recommendation: SearchApiSuccessResponse['recommendations']['ranked'][number]
  detail?: SearchApiSuccessResponse['recommendationDetails'][number]
  destination: ReturnType<typeof cardDestination>
  searchOrigin: string
  searchDestination?: string
}): SearchPlanCardViewModel | undefined {
  const { result, label, recommendation, detail, destination, searchOrigin, searchDestination } = input
  const segments = segmentsForPlan(result, label)
  if (!segments.length) return undefined
  const sourceSegments = result.itineraries.find((item) => item.recommendationLabel === label)?.segments ||
    result.segments.filter((segment) => segment.id.includes(label.toLowerCase().replace(/\s+/g, '-')))
  const classification = endpointCoverageClassification(classifySegments(sourceSegments), sourceSegments, searchOrigin, searchDestination)
  const sourceItinerary = result.itineraries.find((item) => item.recommendationLabel === label)
  const zedEligibility = itineraryZedEligibility(sourceItinerary, detail)
  return {
    key: `${label}-${recommendation.gateway}`,
    label,
    rank: recommendation.rank,
    status: recommendation.status,
    searchOrigin,
    searchDestination: searchDestination || destination.destinationLabel,
    gateway: recommendation.gateway,
    ...destination,
    finalScore: clampScore(recommendation.finalScore),
    confidence: clampScore(recommendation.confidence),
    planningSuccessScore: clampScore(recommendation.estimatedSuccess),
    planningScoreNote,
    wholePartyZedLabel: zedLabel(detail),
    zedEligibilityLabel: zedEligibility.label,
    zedEligibilityStatus: zedEligibility.status,
    zedEligibilityAction: zedEligibility.action,
    eligibleZedAirlinesLabel: sourceItinerary?.zedEligibility?.eligibleCarriers.length ? sourceItinerary.zedEligibility.eligibleCarriers.join(', ') : detail?.eligibleZedAirlines.length ? detail.eligibleZedAirlines.join(', ') : 'None carrier-confirmed',
    shortSummary: recommendation.summary,
    strengths: detail?.strengths || [],
    weaknesses: detail?.weaknesses || [],
    risks: risks(detail, recommendation.risks),
    switchConditions: detail?.switchConditions || [],
    transportModes: transportModes(segments),
    fallbacks: fallbackSummaries(result.fallbacks),
    dataWarnings: uniqueStrings([...(detail?.dataWarnings || []), ...recommendation.warnings]),
    dataQualityLevel: result.dataQuality,
    unknownIndicators: result.unknownScheduleIndicators,
    ...classification,
    segments
  }
}

export function buildSearchResultsViewModel(stored: BetaSearchStoredResult | null): SearchResultsViewModel {
  if (!stored) {
    return {
      title: 'No beta search result found',
      subtitle: 'Run a search from the homepage to see ranked beta recommendations.',
      publicPreview: undefined,
      dataQualityLabel: 'Data quality: unavailable',
      staticOnlyNotice: 'No stored search result is available.',
      providerReadinessLabel: 'Schedule source readiness unavailable.',
      warnings: [],
      missingData: [],
      hasStoredResult: false,
      mobileStructure: { usesSingleColumnCards: true, hasSemanticHeadings: true, hasTapTargets: true },
      cards: [],
      secondaryCards: []
    }
  }

  const result = stored.result
  const byLabel = new Map<SearchPlanCardViewModel['label'], SearchApiSuccessResponse['recommendations']['ranked'][number]>()
  result.recommendations.ranked.forEach((recommendation) => {
    if (!byLabel.has(recommendation.label)) byLabel.set(recommendation.label, recommendation)
  })
  const destination = cardDestination(stored)
  const searchOrigin = stored.request.origin.toUpperCase()
  const searchDestination = stored.destination.mode === 'airport' ? stored.request.destination.toUpperCase() : undefined
  const detailByLabel = new Map(result.recommendationDetails.map((detail) => [detail.label, detail]))
  const itineraryCards = result.itineraries.map((itinerary, index) => cardFromItinerary({
    itinerary,
    recommendation: byLabel.get(itinerary.recommendationLabel),
    detail: detailByLabel.get(itinerary.recommendationLabel),
    destination,
    searchOrigin,
    searchDestination,
    dataQuality: result.dataQuality,
    index
  }))
  const labelsWithItinerary = new Set(result.itineraries.map((itinerary) => itinerary.recommendationLabel))
  const recommendationOnlyCards = (['Plan A', 'Plan B', 'Plan C'] as const).flatMap((label) => {
    if (labelsWithItinerary.has(label)) return []
    const recommendation = byLabel.get(label)
    if (!recommendation) return []
    const card = cardFromRecommendation({ result, label, recommendation, detail: detailByLabel.get(label), destination, searchOrigin, searchDestination })
    return card ? [card] : []
  })
  const cardsByClass = sortCards([...itineraryCards, ...recommendationOnlyCards])
  const cards = cardsByClass.filter((card) => card.resultClass === 'scheduled')
  const secondaryCards = cardsByClass.filter((card) => card.resultClass !== 'scheduled')

  return {
    title: `Beta search results for ${stored.request.origin} to ${stored.destination.label}`,
    subtitle: stored.destination.mode === 'region'
      ? `Region-based search from ${stored.request.origin}; final destination remains ${stored.destination.label}.${routeResolutionSubtitle(stored)}`
      : `Airport search from ${stored.request.origin} to ${stored.destination.label}.${routeResolutionSubtitle(stored)}`,
    publicPreview: result.publicPreview,
    dataQualityLabel: dataQualityLabel(result.dataQuality),
    staticOnlyNotice: staticOnlyNotice(result),
    providerReadinessLabel: providerReadinessLabel(result),
    warnings: uniqueStrings(result.warnings).slice(0, 6),
    missingData: uniqueStrings(result.missingData).slice(0, 8),
    hasStoredResult: true,
    mobileStructure: { usesSingleColumnCards: true, hasSemanticHeadings: true, hasTapTargets: true },
    cards,
    secondaryCards
  }
}

export function buildCompactItinerarySummary(card: SearchPlanCardViewModel, displayRank: number): CompactItinerarySummary {
  const firstSegment = card.segments[0]
  const lastSegment = card.segments[card.segments.length - 1] || firstSegment
  const optionLabel = displayRank === 1 && card.resultClass === 'scheduled' ? 'Best option' : displayRank === 1 ? 'Option 1' : 'Alternative'
  const routeSummary = compactRouteSummary(card)
  const hasCompleteEndpoints = firstSegment && lastSegment &&
    firstSegment.origin.toUpperCase() === card.searchOrigin.toUpperCase() &&
    (!card.searchDestination || lastSegment.destination.toUpperCase() === card.searchDestination.toUpperCase())
  const flightSummary = hasCompleteEndpoints ? compactFlightSummary(card.segments) : 'Partial schedule'
  const timeSummary = hasCompleteEndpoints && firstSegment && lastSegment
    ? `${firstSegment.departureTime} → ${lastSegment.arrivalTime}${dateOffsetLabel(firstSegment.departureRequestDate, lastSegment.arrivalRequestDate)}`
    : 'Full itinerary time pending'
  const durationLabel = hasCompleteEndpoints
    ? durationLabelFor(firstSegment, lastSegment) || durationFromSegments(card.segments) || 'Duration pending'
    : 'Duration pending'
  const airlineCode = hasCompleteEndpoints ? firstSegment?.airlineCode || 'AIR' : 'PART'
  const airlineName = hasCompleteEndpoints ? firstSegment?.airlineName || 'Carrier not confirmed' : 'Partial schedule only'
  return {
    optionLabel,
    flightSummary,
    routeSummary,
    timeSummary,
    durationLabel,
    stopsLabel: hasCompleteEndpoints ? stopsLabel(card.segments) : 'Partial',
    airlineCode,
    airlineName,
    zedLabel: compactZedLabel(card),
    loadLabel: compactLoadLabel(card)
  }
}

export function buildExpandedItineraryIdentity(card: SearchPlanCardViewModel): ExpandedItineraryIdentity {
  const requestedJourneyLabel = requestedJourney(card)
  const complete = hasCompleteEndpoints(card)
  const scheduled = card.resultClass === 'scheduled' && complete
  const scheduleState = scheduled
    ? 'Complete scheduled itinerary'
    : card.resultClass === 'partial'
      ? 'Partial schedule: some legs verified'
      : 'Route framework only: schedules not verified'
  const verifiedSegmentLabel = scheduled
    ? 'Flight segments'
    : card.resultClass === 'partial'
      ? 'Verified segment(s)'
      : 'Route concept segment(s)'
  return {
    requestedJourneyLabel,
    scheduleState,
    verifiedSegmentLabel,
    verifiedSegments: card.segments.map((segment) => ({
      key: segment.key,
      route: `${segment.origin} → ${segment.destination}`,
      flight: segment.flightNumber,
      time: `${segment.departureTime} → ${segment.arrivalTime}`
    })),
    unverifiedSummary: scheduled ? '' : unverifiedJourneySummary(card)
  }
}

export function layoverLabelBetweenSegments(previous: SearchSegmentViewModel, next: SearchSegmentViewModel) {
  if (!previous.scheduledArrivalUtc || !next.scheduledDepartureUtc) return ''
  if (previous.destination.toUpperCase() !== next.origin.toUpperCase()) return ''
  const arrival = Date.parse(previous.scheduledArrivalUtc)
  const departure = Date.parse(next.scheduledDepartureUtc)
  if (!Number.isFinite(arrival) || !Number.isFinite(departure) || departure <= arrival) return ''
  return `${formatDurationMinutes(Math.round((departure - arrival) / 60000))} layover in ${next.origin}`
}

function requestedJourney(card: SearchPlanCardViewModel) {
  const destination = card.searchDestination || card.destinationLabel
  return card.searchOrigin && destination ? `${card.searchOrigin} → ${destination}` : card.label
}

function hasCompleteEndpoints(card: SearchPlanCardViewModel) {
  const firstSegment = card.segments[0]
  const lastSegment = card.segments[card.segments.length - 1] || firstSegment
  return Boolean(firstSegment && lastSegment &&
    firstSegment.origin.toUpperCase() === card.searchOrigin.toUpperCase() &&
    (!card.searchDestination || lastSegment.destination.toUpperCase() === card.searchDestination.toUpperCase()))
}

function unverifiedJourneySummary(card: SearchPlanCardViewModel) {
  const firstSegment = card.segments[0]
  const lastSegment = card.segments[card.segments.length - 1] || firstSegment
  const destination = card.searchDestination || card.destinationLabel
  if (!firstSegment || !lastSegment) return `${card.searchOrigin} → ${destination} schedule not yet attached.`
  const missing: string[] = []
  if (firstSegment.origin.toUpperCase() !== card.searchOrigin.toUpperCase()) {
    missing.push(`${card.searchOrigin} → ... → ${firstSegment.origin}`)
  }
  if (destination && lastSegment.destination.toUpperCase() !== destination.toUpperCase()) {
    missing.push(`${lastSegment.destination} → ... → ${destination}`)
  }
  if (!missing.length) return `${card.searchOrigin} → ${destination} schedule not yet attached.`
  return `${missing.join(' and ')} schedule not yet attached.`
}

function compactFlightSummary(segments: SearchSegmentViewModel[]) {
  const values = uniqueStrings(segments.map((segment) => compactSegmentFlight(segment)).filter(Boolean))
  return values.length ? values.join(' / ') : 'Flight pending'
}

function compactSegmentFlight(segment: SearchSegmentViewModel) {
  if (/flight number unavailable/i.test(segment.flightNumber)) return ''
  const normalizedFlight = segment.flightNumber.replace(/\s+/g, '').toUpperCase()
  const suffix = normalizedFlight.startsWith(segment.airlineCode) ? normalizedFlight.slice(segment.airlineCode.length) : normalizedFlight
  return suffix ? `${segment.airlineCode} ${suffix}` : normalizedFlight
}

function compactRouteSummary(card: SearchPlanCardViewModel) {
  const endpoints = card.searchOrigin && card.searchDestination ? `${card.searchOrigin}–${card.searchDestination}` : ''
  const first = card.segments[0]
  if (!first) return endpoints || 'Route pending'
  const airports = uniqueConsecutive([first.origin, ...card.segments.map((segment) => segment.destination)])
  const route = airports.join('–')
  if (card.resultClass !== 'scheduled' && endpoints && route !== endpoints) return `${endpoints} · ${route} ${card.resultClass === 'partial' ? 'partly verified' : 'framework'}`
  return route || endpoints || 'Route pending'
}

function stopsLabel(segments: SearchSegmentViewModel[]) {
  if (segments.length <= 1) return 'Nonstop'
  const stops = Math.max(segments.length - 1, 1)
  return `${stops} stop${stops === 1 ? '' : 's'}`
}

function dateOffsetLabel(departureDate: string, arrivalDate: string) {
  if (!departureDate || !arrivalDate || departureDate === arrivalDate) return ''
  const departure = Date.parse(`${departureDate}T00:00:00Z`)
  const arrival = Date.parse(`${arrivalDate}T00:00:00Z`)
  if (!Number.isFinite(departure) || !Number.isFinite(arrival)) return ''
  const dayDelta = Math.round((arrival - departure) / 86400000)
  if (dayDelta > 0) return ` +${dayDelta}`
  if (dayDelta < 0) return ` ${dayDelta}`
  return ''
}

function durationLabelFor(first?: SearchSegmentViewModel, last?: SearchSegmentViewModel) {
  if (!first?.scheduledDepartureUtc || !last?.scheduledArrivalUtc) return ''
  const departure = Date.parse(first.scheduledDepartureUtc)
  const arrival = Date.parse(last.scheduledArrivalUtc)
  if (!Number.isFinite(departure) || !Number.isFinite(arrival) || arrival <= departure) return ''
  return formatDurationMinutes(Math.round((arrival - departure) / 60000))
}

function durationFromSegments(segments: SearchSegmentViewModel[]) {
  const totalMinutes = segments.reduce((total, segment) => total + parseDurationMinutes(segment.estimatedDuration), 0)
  return totalMinutes > 0 ? formatDurationMinutes(totalMinutes) : ''
}

function parseDurationMinutes(value: string) {
  const hours = value.match(/(\d+(?:\.\d+)?)\s*h/i)?.[1]
  const minutes = value.match(/(\d+)\s*m/i)?.[1]
  if (hours || minutes) return Math.round(Number(hours || 0) * 60 + Number(minutes || 0))
  const colon = value.match(/^(\d{1,2}):(\d{2})$/)
  if (colon) return Number(colon[1]) * 60 + Number(colon[2])
  return 0
}

function formatDurationMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes}m`
  return `${hours}h${String(minutes).padStart(2, '0')}`
}

function compactZedLabel(card: SearchPlanCardViewModel) {
  if (card.zedEligibilityStatus === 'eligible') return 'ZED ok'
  if (card.zedEligibilityStatus === 'partial') return 'ZED partial'
  if (card.zedEligibilityStatus === 'not_eligible') return 'ZED no'
  return 'ZED —'
}

function compactLoadLabel(card: SearchPlanCardViewModel) {
  const knownLoads = uniqueStrings(card.segments
    .map((segment) => segment.loadStatus)
    .filter((value) => value && !/unavailable|unknown/i.test(value)))
  if (knownLoads.length) return knownLoads.join(' / ')
  return 'Load —'
}

function uniqueConsecutive(values: string[]) {
  return values.filter((value, index) => value && value !== values[index - 1])
}
