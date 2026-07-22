import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { isConversationalWorkspaceEnabled } from './featureFlags.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import {
  applyWorkspaceFilters,
  emptyTripContext,
  itineraryStopCount,
  mergeTripContext,
  noLoadDataLabel,
  providerSearchPromptFromContext,
  promptRequiresProviderRefresh,
  shouldAppendAssistantMessage,
  summarizeVerifiedResult,
  type ConversationalItinerary,
  type WorkspaceResultSet
} from './conversationalTripWorkspace.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { isCurrentLiveAvailability } from './liveAvailabilityGuard.ts'

const sampleItineraries: ConversationalItinerary[] = [
  {
    id: 'nonstop',
    route: 'LAX → HND',
    carrier: 'United',
    flightNumber: 'UA39',
    departureTime: '2026-06-05T10:00:00Z',
    arrivalTime: '2026-06-06T02:00:00Z',
    score: 88,
    legs: [
      { origin: 'LAX', destination: 'HND', carrier: 'United', flightNumber: 'UA39' }
    ]
  },
  {
    id: 'one-stop',
    route: 'LAX → SFO → HND',
    carrier: 'United',
    flightNumber: 'UA100, UA875',
    departureTime: '2026-06-05T08:00:00Z',
    arrivalTime: '2026-06-06T01:00:00Z',
    score: 82,
    legs: [
      { origin: 'LAX', destination: 'SFO', carrier: 'United', flightNumber: 'UA100' },
      { origin: 'SFO', destination: 'HND', carrier: 'United', flightNumber: 'UA875' }
    ]
  },
  {
    id: 'two-stop',
    route: 'LAX → DEN → ORD → HND',
    carrier: 'ANA',
    flightNumber: 'NH1',
    departureTime: '2026-06-05T07:00:00Z',
    arrivalTime: '2026-06-06T07:00:00Z',
    score: 75,
    legs: [
      { origin: 'LAX', destination: 'DEN', carrier: 'United', flightNumber: 'UA1' },
      { origin: 'DEN', destination: 'ORD', carrier: 'United', flightNumber: 'UA2' },
      { origin: 'ORD', destination: 'HND', carrier: 'ANA', flightNumber: 'NH1' }
    ]
  }
]

const fixedNow = new Date('2026-07-22T12:00:00Z')

function resultSet(overrides: Partial<WorkspaceResultSet> = {}): WorkspaceResultSet {
  return {
    id: 'result-1',
    query: 'LAX to HND tomorrow',
    context: mergeTripContext(emptyTripContext(), 'LAX to HND tomorrow'),
    itineraries: sampleItineraries,
    frameworkRoutes: [],
    warnings: [],
    source: 'Canonical itinerary search',
    dataMode: 'Live flight schedule data · load data unavailable',
    status: '',
    debug: null,
    createdAt: '2026-06-04T00:00:00Z',
    ...overrides
  }
}

describe('conversational trip workspace logic', () => {
  it('builds structured context from an initial natural-language search', () => {
    const context = mergeTripContext(emptyTripContext(), 'LAX to HND tomorrow in business', { now: fixedNow })

    assert.equal(context.origin, 'LAX')
    assert.equal(context.destination, 'HND')
    assert.equal(context.date, '2026-07-23')
    assert.equal(context.cabin, 'business')
    assert.equal(context.followUpIntent, 'new-search')
  })

  it('merges a date-only follow-up with prior origin and destination', () => {
    const initial = mergeTripContext(emptyTripContext(), 'LAX to HND', { now: fixedNow })
    const clarified = mergeTripContext(initial, '7/27/26', { now: fixedNow })
    const providerPrompt = providerSearchPromptFromContext('7/27/26', clarified, { now: fixedNow })

    assert.equal(clarified.origin, 'LAX')
    assert.equal(clarified.destination, 'HND')
    assert.equal(clarified.date, '2026-07-27')
    assert.equal(providerPrompt, 'LAX to HND 7/27/26')
  })

  it('keeps origin and destination after a date-only follow-up', () => {
    const context = mergeTripContext(emptyTripContext(), 'LAX to HND', { now: fixedNow })
    const clarified = mergeTripContext(context, 'July 27, 2026', { now: fixedNow })

    assert.equal(clarified.origin, 'LAX')
    assert.equal(clarified.destination, 'HND')
    assert.equal(clarified.date, '2026-07-27')
  })

  it('requires a provider refresh when a date-only follow-up completes the trip', () => {
    const context = mergeTripContext(emptyTripContext(), 'LAX to HND', { now: fixedNow })

    assert.equal(promptRequiresProviderRefresh('7/27/26', context, { now: fixedNow }), true)
  })

  it('suppresses duplicate assistant validation messages', () => {
    const messages = [
      { role: 'user' as const, text: 'LAX to HND' },
      { role: 'assistant' as const, text: 'Add a departure date.' }
    ]

    assert.equal(shouldAppendAssistantMessage(messages, 'Add a departure date.'), false)
    assert.equal(shouldAppendAssistantMessage(messages, 'That date is not valid. Try July 27, 2026.'), true)
  })

  it('treats clarifications as current-trip modifications instead of new searches', () => {
    const context = mergeTripContext(emptyTripContext(), 'LAX to HND tomorrow')
    const clarified = mergeTripContext(context, 'Avoid SFO')

    assert.equal(promptRequiresProviderRefresh('Avoid SFO', context), false)
    assert.deepEqual(clarified.avoidedAirports, ['SFO'])
    assert.equal(clarified.origin, 'LAX')
    assert.equal(clarified.destination, 'HND')
  })

  it('detects route-changing follow-ups that require a provider rerun', () => {
    const context = mergeTripContext(emptyTripContext(), 'LAX to HND tomorrow')

    assert.equal(promptRequiresProviderRefresh('SFO to HND tomorrow', context), true)
  })

  it('supports exact one-stop local filtering without hiding all viable routes permanently', () => {
    const filtered = applyWorkspaceFilters(sampleItineraries, {
      exactStops: 1,
      avoidAirports: [],
      carriers: [],
      sort: 'ranked'
    })
    const restored = applyWorkspaceFilters(sampleItineraries, {
      avoidAirports: [],
      carriers: [],
      sort: 'ranked'
    })

    assert.deepEqual(filtered.map((itinerary) => itinerary.id), ['one-stop'])
    assert.equal(restored.length, sampleItineraries.length)
  })

  it('keeps ranking as reordering only, not a result cap', () => {
    const ranked = applyWorkspaceFilters(sampleItineraries, {
      avoidAirports: [],
      carriers: [],
      sort: 'earliest'
    })

    assert.equal(ranked.length, sampleItineraries.length)
    assert.deepEqual(new Set(ranked.map((itinerary) => itinerary.id)), new Set(sampleItineraries.map((itinerary) => itinerary.id)))
  })

  it('preserves complete segment-derived route and stop counts', () => {
    assert.equal(itineraryStopCount(sampleItineraries[0]), 0)
    assert.equal(itineraryStopCount(sampleItineraries[1]), 1)
    assert.equal(itineraryStopCount(sampleItineraries[2]), 2)
  })

  it('keeps schedule availability separate from unavailable load data', () => {
    assert.equal(noLoadDataLabel(sampleItineraries[0]), 'Load data unavailable')
  })

  it('summarizes partial coverage without upgrading frameworks to live availability', () => {
    const summary = summarizeVerifiedResult(resultSet({
      itineraries: [],
      frameworkRoutes: [sampleItineraries[1]]
    }))

    assert.match(summary, /route framework/i)
    assert.match(summary, /not treat it as live availability/i)
  })

  it('uses truthful customer-safe no-results language', () => {
    const summary = summarizeVerifiedResult(resultSet({
      itineraries: [],
      frameworkRoutes: [],
      warnings: ['FlightAware credentials rejected before provider request execution.']
    }))

    assert.equal(summary, "I couldn't retrieve verified live itineraries from the currently connected sources.")
  })

  it('never treats demo fallback rows as current live availability', () => {
    assert.equal(isCurrentLiveAvailability({
      id: 'demo',
      source: 'demo-fallback',
      sourceProvider: 'test-data',
      dataFreshnessLabel: 'Demo fallback data',
      dataFreshnessRule: 'demo-fallback',
      providerBadges: ['Live provider API data'],
      productionAvailability: true
    }), false)
  })

  it('keeps the conversational workspace on by default with an explicit legacy opt-out', () => {
    const previous = process.env.NEXT_PUBLIC_CONVERSATIONAL_WORKSPACE
    delete process.env.NEXT_PUBLIC_CONVERSATIONAL_WORKSPACE
    assert.equal(isConversationalWorkspaceEnabled(), true)
    process.env.NEXT_PUBLIC_CONVERSATIONAL_WORKSPACE = 'true'
    assert.equal(isConversationalWorkspaceEnabled(), true)
    process.env.NEXT_PUBLIC_CONVERSATIONAL_WORKSPACE = 'false'
    assert.equal(isConversationalWorkspaceEnabled(), false)
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_CONVERSATIONAL_WORKSPACE
    } else {
      process.env.NEXT_PUBLIC_CONVERSATIONAL_WORKSPACE = previous
    }
  })
})
