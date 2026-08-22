import {
  loadCommunityLoadRequests,
  saveCommunityLoadRequest,
  type CommunityLoadRequest
} from './communityLoads'
import { submitAccountLoadRequest } from './loadRequestClient'
import type { AccountLoadRequest, AccountLoadRequestInput } from './loadRequestAccountStore'
import {
  loadSavedItineraryComparisons,
  removeSavedItineraryComparison,
  saveItineraryComparison,
  type SavedItineraryComparison
} from './savedItineraryComparisons'
import {
  loadSavedTripWatchlist,
  saveTripWatch,
  type SavedTripWatch
} from './watchlist'

type WorkflowSegment = {
  origin: string
  destination: string
  carrierLabel: string
  flightNumber: string
  departureTime: string
  departureDate: string
  departureRequestDate: string
  scheduledDepartureUtc?: string
  scheduleStatus: string
  scheduledArrivalUtc?: string
  transportType: string
}

export type WorkflowResultCard = {
  key: string
  label: string
  rank: number
  resultClass: 'scheduled' | 'partial' | 'framework'
  finalScore: number
  confidence: number
  planningSuccessScore: number
  shortSummary: string
  strengths: string[]
  risks: string[]
  dataWarnings: string[]
  segments: WorkflowSegment[]
}

export type WorkflowActionResult<T = unknown> = {
  ok: boolean
  status: 'saved' | 'removed' | 'duplicate' | 'blocked' | 'error'
  message: string
  item?: T
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stablePart(value: unknown) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'UNKNOWN'
}

function validFlightNumber(value: string) {
  return Boolean(value) && !/unavailable|unknown|not provided|tbd/i.test(value)
}

function validAirport(value: string) {
  return /^[A-Z]{3}$/.test(value.trim().toUpperCase())
}

export function itineraryRoute(card: WorkflowResultCard) {
  const first = card.segments[0]
  const last = card.segments[card.segments.length - 1]
  if (!first || !last) return ''
  return `${first.origin.toUpperCase()} → ${last.destination.toUpperCase()}`
}

export function itineraryWorkflowIdentity(card: WorkflowResultCard) {
  const segmentIdentity = card.segments.map((segment) => [
    stablePart(segment.carrierLabel),
    stablePart(segment.flightNumber),
    stablePart(segment.origin),
    stablePart(segment.destination),
    stablePart(segment.departureRequestDate || segment.departureDate)
  ].join('-')).join('__')
  return `result-${stablePart(card.resultClass)}-${segmentIdentity || stablePart(card.key)}`
}

export function scheduledResultActionAvailability(card: WorkflowResultCard) {
  if (card.resultClass !== 'scheduled') {
    return {
      canSave: false,
      canWatch: false,
      canRequestLoad: false,
      reason: 'Actions are available after operating flights and schedules are verified.'
    }
  }
  const validSegments = card.segments.filter(canRequestLoadForSegment)
  return {
    canSave: true,
    canWatch: true,
    canRequestLoad: validSegments.length > 0,
    reason: validSegments.length > 0 ? '' : 'Load requests need carrier, flight number, route, and flight date.'
  }
}

export function canRequestLoadForSegment(segment: WorkflowSegment) {
  return segment.transportType === 'flight' &&
    validFlightNumber(segment.flightNumber) &&
    validAirport(segment.origin) &&
    validAirport(segment.destination) &&
    Boolean(segment.departureRequestDate) &&
    Boolean(segment.scheduledDepartureUtc)
}

function carriersFor(card: WorkflowResultCard) {
  const carriers = [...new Set(card.segments.map((segment) => cleanText(segment.carrierLabel)).filter(Boolean))]
  return carriers.join(', ') || 'Carrier not confirmed'
}

function routeRiskLabel(card: WorkflowResultCard) {
  const text = [...card.risks, ...card.dataWarnings].join(' ').toLowerCase()
  if (/critical|not eligible|unavailable/.test(text)) return 'High'
  if (/risk|warning|partial|unknown/.test(text)) return 'Medium'
  return 'Low'
}

export function saveResultItinerary(card: WorkflowResultCard): WorkflowActionResult<SavedItineraryComparison> {
  try {
    const availability = scheduledResultActionAvailability(card)
    if (!availability.canSave) return { ok: false, status: 'blocked', message: availability.reason }
    const itineraryIdentity = itineraryWorkflowIdentity(card)
    const existing = loadSavedItineraryComparisons().find((item) => item.itineraryIdentity === itineraryIdentity)
    const saved = saveItineraryComparison({
      itineraryIdentity,
      route: itineraryRoute(card),
      carrier: carriersFor(card),
      score: card.finalScore,
      successProbability: card.planningSuccessScore || card.confidence,
      riskLevel: routeRiskLabel(card),
      connections: Math.max(0, card.segments.length - 1),
      totalTravelTime: `${card.segments.length} segment${card.segments.length === 1 ? '' : 's'}`,
      travelDate: card.segments[0]?.departureRequestDate || undefined,
      why: card.strengths.length ? card.strengths : [card.shortSummary],
      sourceLabel: 'Search result',
      segments: card.segments.map((segment) => ({
        flightNumber: segment.flightNumber,
        carrier: segment.carrierLabel,
        origin: segment.origin,
        destination: segment.destination,
        departureTime: segment.departureTime,
        departureDate: segment.departureRequestDate || segment.departureDate
      }))
    })
    if (!saved) return { ok: false, status: 'error', message: 'Could not save this itinerary in this browser.' }
    return {
      ok: true,
      status: existing ? 'duplicate' : 'saved',
      message: existing ? 'This itinerary was already saved; the saved copy was refreshed.' : 'Itinerary saved.',
      item: saved
    }
  } catch {
    return { ok: false, status: 'error', message: 'Could not save this itinerary. Try again.' }
  }
}

export function removeResultItinerary(card: WorkflowResultCard): WorkflowActionResult<SavedItineraryComparison[]> {
  try {
    const itineraryIdentity = itineraryWorkflowIdentity(card)
    const existing = loadSavedItineraryComparisons().find((item) => item.itineraryIdentity === itineraryIdentity)
    if (!existing) return { ok: true, status: 'removed', message: 'Itinerary is not currently saved.', item: loadSavedItineraryComparisons() }
    const remaining = removeSavedItineraryComparison(existing.id)
    return { ok: true, status: 'removed', message: 'Saved itinerary removed.', item: remaining }
  } catch {
    return { ok: false, status: 'error', message: 'Could not remove this saved itinerary. Try again.' }
  }
}

export function watchResultItinerary(card: WorkflowResultCard): WorkflowActionResult<SavedTripWatch> {
  try {
    const availability = scheduledResultActionAvailability(card)
    if (!availability.canWatch) return { ok: false, status: 'blocked', message: availability.reason }
    const route = itineraryRoute(card)
    const directFlight = card.segments.length === 1 ? card.segments[0] : undefined
    const watchType = directFlight ? 'flight' : 'route'
    const watchQuery = directFlight ? directFlight.flightNumber : route
    const existing = loadSavedTripWatchlist().find((item) =>
      item.travelDate === (card.segments[0]?.departureRequestDate || 'Flexible') &&
      item.selectedItinerary === route &&
      (item.watchQuery || item.selectedItinerary) === watchQuery
    )
    const saved = saveTripWatch({
      watchType,
      watchQuery,
      watchLabel: directFlight ? `Flight ${directFlight.flightNumber}` : route,
      origin: card.segments[0]?.origin || '',
      destination: card.segments[card.segments.length - 1]?.destination || '',
      travelDate: card.segments[0]?.departureRequestDate || 'Flexible',
      carrier: carriersFor(card),
      selectedItinerary: route,
      score: card.finalScore,
      successProbability: card.planningSuccessScore || card.confidence,
      riskLevel: routeRiskLabel(card),
      connections: Math.max(0, card.segments.length - 1),
      totalTravelTime: `${card.segments.length} segment${card.segments.length === 1 ? '' : 's'}`
    })
    if (!saved) return { ok: false, status: 'error', message: 'Could not add this itinerary to the watchlist.' }
    return {
      ok: true,
      status: existing ? 'duplicate' : 'saved',
      message: existing ? 'This itinerary was already on your watchlist; the watch was refreshed.' : 'Added to watchlist.',
      item: saved
    }
  } catch {
    return { ok: false, status: 'error', message: 'Could not update the watchlist. Try again.' }
  }
}

function loadRequestInputForSegment(segment: WorkflowSegment): AccountLoadRequestInput {
  return {
    carrier: segment.carrierLabel,
    flightNumber: segment.flightNumber,
    origin: segment.origin,
    destination: segment.destination,
    scheduledDepartureUtc: segment.scheduledDepartureUtc || '',
    ...(segment.scheduledArrivalUtc ? { scheduledArrivalUtc: segment.scheduledArrivalUtc } : {}),
    travelDate: segment.departureRequestDate,
    provider: 'Search result',
    provenance: 'Nonrevy scheduled itinerary result'
  }
}

function cacheSubmittedLoadRequest(segment: WorkflowSegment) {
  return saveCommunityLoadRequest({
    flightNumber: segment.flightNumber,
    carrier: segment.carrierLabel,
    route: `${segment.origin} → ${segment.destination}`,
    origin: segment.origin,
    destination: segment.destination,
    date: segment.departureRequestDate
  })
}

export async function requestLoadsForResult(card: WorkflowResultCard): Promise<WorkflowActionResult<Array<CommunityLoadRequest | AccountLoadRequest>>> {
  try {
    const availability = scheduledResultActionAvailability(card)
    if (!availability.canRequestLoad) return { ok: false, status: 'blocked', message: availability.reason }
    const segments = card.segments.filter(canRequestLoadForSegment)
    const submitted: Array<CommunityLoadRequest | AccountLoadRequest> = []
    let duplicateCount = 0
    let accountFailure = false

    for (const segment of segments) {
      const response = await submitAccountLoadRequest(loadRequestInputForSegment(segment))
      if (response.request) {
        submitted.push(response.request)
        const cached = cacheSubmittedLoadRequest(segment)
        if (cached) submitted.push(cached)
        if (response.status === 'duplicate') duplicateCount += 1
        continue
      }
      if (response.status === 'duplicate') {
        duplicateCount += 1
        const cached = cacheSubmittedLoadRequest(segment)
        if (cached) submitted.push(cached)
        continue
      }
      accountFailure = true
      const cached = cacheSubmittedLoadRequest(segment)
      if (cached) submitted.push(cached)
    }

    if (!submitted.length && accountFailure) {
      return { ok: false, status: 'error', message: "Couldn't confirm request status. Check My Requests before retrying." }
    }
    if (!submitted.length) return { ok: false, status: 'error', message: 'Could not create a load request for this itinerary.' }
    const localCount = loadCommunityLoadRequests().filter((request) =>
      segments.some((segment) =>
        request.flightNumber === segment.flightNumber &&
        request.origin === segment.origin &&
        request.destination === segment.destination &&
        request.date === segment.departureRequestDate
      )
    ).length
    const createdCount = Math.max(0, segments.length - duplicateCount)
    return {
      ok: true,
      status: createdCount > 0 ? 'saved' : 'duplicate',
      message: accountFailure
        ? "Saved locally, but couldn't confirm account sync. Check My Requests before retrying."
        : createdCount > 0
          ? `${createdCount} load request${createdCount === 1 ? '' : 's'} submitted.`
          : localCount > 0
            ? 'Request already submitted for this flight and date.'
            : 'A load request already exists for this flight and date.',
      item: submitted
    }
  } catch {
    return { ok: false, status: 'error', message: "Couldn't confirm request status. Check My Requests before retrying." }
  }
}

export function workflowEmptyState(kind: 'saved-itineraries' | 'watchlist' | 'load-requests' | 'search-results') {
  if (kind === 'saved-itineraries') return 'No saved itineraries yet. Save a scheduled result to compare or revisit it later.'
  if (kind === 'watchlist') return 'No watched trips yet. Add a scheduled result or route to track future changes.'
  if (kind === 'load-requests') return 'No load requests yet. Request a load from a scheduled flight result when flight identity is confirmed.'
  return 'No scheduled results yet. Try a specific airport pair and date, or review backup routes below.'
}
