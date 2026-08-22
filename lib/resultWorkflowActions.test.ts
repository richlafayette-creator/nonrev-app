import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { buildBetaSearchRequest, readTravelerProfileFromStorage, type StorageLike } from './betaSearchClient.ts'
import { loadCommunityLoadRequests } from './communityLoads.ts'
import {
  loadSavedItineraryComparisons,
  savedItineraryComparisonsStorageKey
} from './savedItineraryComparisons.ts'
import {
  canRequestLoadForSegment,
  removeResultItinerary,
  requestLoadsForResult,
  saveResultItinerary,
  scheduledResultActionAvailability,
  watchResultItinerary,
  workflowEmptyState,
  type WorkflowResultCard
} from './resultWorkflowActions.ts'
import {
  loadTravelerProfileFromStorage,
  saveTravelerProfileToStorage,
  travelerProfileStorageKey
} from './travelerProfile.ts'
import { loadSavedTripWatchlist } from './watchlist.ts'

type WindowLike = {
  localStorage: StorageLike
  dispatchEvent: (event: Event) => boolean
  addEventListener?: () => void
  removeEventListener?: () => void
}

const originalWindow = globalThis.window
const originalFetch = globalThis.fetch

function memoryStorage(throwOnSet = false): StorageLike & { dump: () => Record<string, string> } {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (throwOnSet) throw new Error('storage unavailable')
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    dump: () => Object.fromEntries(values)
  }
}

function installWindow(storage = memoryStorage()) {
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: storage,
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    } satisfies WindowLike,
    configurable: true
  })
  Object.defineProperty(globalThis, 'fetch', {
    value: async () => ({ ok: false, json: async () => ({}) }),
    configurable: true
  })
  return storage
}

function installFetchSequence(responses: Array<{ ok?: boolean; status?: number; body: unknown }>) {
  let index = 0
  Object.defineProperty(globalThis, 'fetch', {
    value: async () => {
      const response = responses[Math.min(index, responses.length - 1)]
      index += 1
      return {
        ok: response.ok ?? true,
        status: response.status || 200,
        json: async () => response.body
      }
    },
    configurable: true
  })
}

function restoreWindow() {
  Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true })
  Object.defineProperty(globalThis, 'fetch', { value: originalFetch, configurable: true })
}

function scheduledCard(overrides: Partial<WorkflowResultCard> = {}): WorkflowResultCard {
  return {
    key: 'result-aa169',
    label: 'Plan A',
    rank: 1,
    resultClass: 'scheduled',
    finalScore: 86,
    confidence: 82,
    planningSuccessScore: 78,
    shortSummary: 'Provider-backed direct schedule.',
    strengths: ['Direct provider-backed flight'],
    risks: [],
    dataWarnings: [],
    segments: [{
      origin: 'LAX',
      destination: 'HND',
      carrierLabel: 'AA',
      flightNumber: 'AA169',
      departureTime: '1:15 AM',
      departureDate: 'Aug 20',
      departureRequestDate: '2026-08-20',
      scheduledDepartureUtc: '2026-08-20T17:40:00.000Z',
      scheduledArrivalUtc: '2026-08-21T05:00:00.000Z',
      scheduleStatus: 'AA169 · 1:15 AM -> 4:45 AM',
      transportType: 'flight'
    }],
    ...overrides
  }
}

describe('private beta result workflow actions', () => {
  beforeEach(() => {
    installWindow()
  })

  afterEach(() => {
    restoreWindow()
  })

  it('saves an itinerary with stable identity and segment data', () => {
    const result = saveResultItinerary(scheduledCard())

    assert.equal(result.ok, true)
    assert.equal(loadSavedItineraryComparisons().length, 1)
    assert.equal(loadSavedItineraryComparisons()[0].segments?.[0].flightNumber, 'AA169')
    assert.match(loadSavedItineraryComparisons()[0].itineraryIdentity || '', /AA169/)
  })

  it('prevents duplicate saved itineraries', () => {
    saveResultItinerary(scheduledCard())
    const duplicate = saveResultItinerary(scheduledCard())

    assert.equal(duplicate.status, 'duplicate')
    assert.equal(loadSavedItineraryComparisons().length, 1)
  })

  it('removes a saved itinerary', () => {
    saveResultItinerary(scheduledCard())
    const removed = removeResultItinerary(scheduledCard())

    assert.equal(removed.ok, true)
    assert.equal(loadSavedItineraryComparisons().length, 0)
  })

  it('adds a scheduled itinerary to the watchlist', () => {
    const result = watchResultItinerary(scheduledCard())

    assert.equal(result.ok, true)
    assert.equal(loadSavedTripWatchlist().length, 1)
    assert.equal(loadSavedTripWatchlist()[0].watchType, 'flight')
    assert.equal(loadSavedTripWatchlist()[0].watchQuery, 'AA169')
  })

  it('prevents duplicate watchlist items', () => {
    watchResultItinerary(scheduledCard())
    const duplicate = watchResultItinerary(scheduledCard())

    assert.equal(duplicate.status, 'duplicate')
    assert.equal(loadSavedTripWatchlist().length, 1)
  })

  it('submits a valid load request', async () => {
    installFetchSequence([{ body: { status: 'ready', request: { id: 'request-1', flightNumber: 'AA169' } } }])

    const result = await requestLoadsForResult(scheduledCard())

    assert.equal(result.ok, true)
    assert.equal(loadCommunityLoadRequests().length, 1)
    assert.equal(loadCommunityLoadRequests()[0].flightNumber, 'AA169')
  })

  it('blocks invalid or incomplete load requests', async () => {
    const invalidCard = scheduledCard({
      segments: [{
        ...scheduledCard().segments[0],
        flightNumber: 'Flight number unavailable',
        departureRequestDate: ''
      }]
    })

    assert.equal(canRequestLoadForSegment(invalidCard.segments[0]), false)
    const result = await requestLoadsForResult(invalidCard)
    assert.equal(result.ok, false)
    assert.equal(result.status, 'blocked')
    assert.equal(loadCommunityLoadRequests().length, 0)
  })

  it('prevents duplicate load request spam', async () => {
    installFetchSequence([
      { body: { status: 'ready', request: { id: 'request-1', flightNumber: 'AA169' } } },
      { body: { status: 'duplicate', request: { id: 'request-1', flightNumber: 'AA169', duplicate: true } } }
    ])

    await requestLoadsForResult(scheduledCard())
    const duplicate = await requestLoadsForResult(scheduledCard())

    assert.equal(duplicate.status, 'duplicate')
    assert.equal(loadCommunityLoadRequests().length, 1)
  })

  it('keeps created requests visible to My Requests local storage', async () => {
    installFetchSequence([{ body: { status: 'ready', request: { id: 'request-1', flightNumber: 'AA169' } } }])

    await requestLoadsForResult(scheduledCard())

    const requests = loadCommunityLoadRequests()
    assert.equal(requests.length, 1)
    assert.equal(requests[0].origin, 'LAX')
    assert.equal(requests[0].destination, 'HND')
    assert.equal(requests[0].date, '2026-08-20')
  })

  it('persists traveler profile into search request eligibility context', () => {
    saveTravelerProfileToStorage({
      ...loadTravelerProfileFromStorage(),
      employeeAirline: 'American',
      homeAirport: 'LAX',
      zedAgreements: [{
        id: 'zed-aa',
        airlineCode: 'AA',
        active: true,
        eligibleTravelerTypes: ['Employee'],
        cabinAccess: ['Economy'],
        verificationStatus: 'verified',
        verifiedAt: '2026-08-01T00:00:00.000Z'
      }]
    })
    const profile = readTravelerProfileFromStorage(window.localStorage)
    const built = buildBetaSearchRequest('LAX to HND on 2026-08-20', profile, { now: new Date('2026-08-20T00:00:00.000Z') })

    assert.equal(profile.employeeAirline, 'American')
    assert.equal(profile.zedAgreements[0].airlineCode, 'AA')
    assert.equal(built.ok, true)
    assert.equal(built.ok ? built.request.travelerProfile.employeeAirline : '', 'American')
  })

  it('missing profile does not crash search request building', () => {
    window.localStorage.removeItem?.(travelerProfileStorageKey)
    const profile = readTravelerProfileFromStorage(window.localStorage)
    const built = buildBetaSearchRequest('LAX to HND on 2026-08-20', profile, { now: new Date('2026-08-20T00:00:00.000Z') })

    assert.equal(profile.homeAirport, 'LAX')
    assert.equal(built.ok, true)
  })

  it('returns traveler-safe empty state copy', () => {
    assert.match(workflowEmptyState('saved-itineraries'), /No saved itineraries yet/)
    assert.match(workflowEmptyState('watchlist'), /No watched trips yet/)
    assert.match(workflowEmptyState('load-requests'), /No load requests yet/)
    assert.match(workflowEmptyState('search-results'), /No scheduled results yet/)
  })

  it('returns user-safe errors when local save storage fails', () => {
    installWindow(memoryStorage(true))
    const result = saveResultItinerary(scheduledCard())

    assert.equal(result.ok, false)
    assert.equal(result.status, 'error')
    assert.doesNotMatch(result.message, /storage unavailable|Error|JSON|stack/i)
  })

  it('does not expose actions for framework routes', () => {
    const availability = scheduledResultActionAvailability(scheduledCard({ resultClass: 'framework' }))

    assert.equal(availability.canSave, false)
    assert.equal(availability.canWatch, false)
    assert.equal(availability.canRequestLoad, false)
    assert.match(availability.reason, /verified/)
  })
})
