import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildSearchResultsViewModel } from '../app/results/searchResultsViewModel.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type BetaSearchStoredResult } from './betaSearchClient.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type SearchApiSuccessResponse } from './searchResponse.ts'

describe('beta search results view model', () => {
  it('maps Plan A, Plan B, and Plan C cards', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.deepEqual(model.cards.map((card) => card.label), ['Plan A', 'Plan B', 'Plan C'])
  })

  it('allows optional Plan C when the API does not return one', () => {
    const stored = storedFixture({ ranked: ['Plan A', 'Plan B'] })
    const model = buildSearchResultsViewModel(stored)

    assert.deepEqual(model.cards.map((card) => card.label), ['Plan A', 'Plan B'])
  })

  it('labels whole-party ZED eligibility', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.equal(model.cards[0].wholePartyZedLabel, 'Entire party eligible')
  })

  it('labels stale ZED agreements', () => {
    const stored = storedFixture({ staleZed: true })
    const model = buildSearchResultsViewModel(stored)

    assert.equal(model.cards[0].wholePartyZedLabel, 'Agreement stale')
  })

  it('labels unknown carriers on segments', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.equal(model.cards[0].segments[0].carrierLabel, 'Carrier not confirmed')
  })

  it('labels unknown schedules honestly', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.equal(model.cards[0].segments[0].scheduleStatus, 'Schedule not yet verified')
  })

  it('labels unknown live loads honestly', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.equal(model.cards[0].segments[0].loadStatus, 'Live load unavailable')
  })

  it('surfaces data-quality warning context', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.equal(model.dataQualityLabel, 'Data quality: low')
    assert.ok(model.staticOnlyNotice.includes('Live schedules and standby loads are not yet connected'))
  })

  it('normalizes scores into display bounds', () => {
    const model = buildSearchResultsViewModel(storedFixture({ outOfRangeScores: true }))

    assert.equal(model.cards[0].finalScore, 100)
    assert.equal(model.cards[0].confidence, 0)
    assert.equal(model.cards[0].planningSuccessScore, 100)
  })

  it('does not add fabricated flight numbers, times, or seat counts', () => {
    const model = buildSearchResultsViewModel(storedFixture())
    const serialized = JSON.stringify(model)

    assert.equal(/\b[A-Z]{2}\d{2,4}\b/.test(serialized), false)
    assert.equal(serialized.includes('5 seats'), false)
    assert.equal(serialized.includes('09:00'), false)
  })

  it('deduplicates duplicate recommendation labels', () => {
    const model = buildSearchResultsViewModel(storedFixture({ duplicatePlanA: true }))

    assert.equal(model.cards.filter((card) => card.label === 'Plan A').length, 1)
  })

  it('handles empty recommendations', () => {
    const model = buildSearchResultsViewModel(storedFixture({ ranked: [] }))

    assert.deepEqual(model.cards, [])
  })

  it('exposes mobile-safe content structure metadata', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.deepEqual(model.mobileStructure, {
      usesSingleColumnCards: true,
      hasSemanticHeadings: true,
      hasTapTargets: true
    })
  })

  it('returns deterministic output for repeated mapping', () => {
    const stored = storedFixture()

    assert.deepEqual(buildSearchResultsViewModel(stored), buildSearchResultsViewModel(stored))
  })

  it('labels region-based searches clearly', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.ok(model.cards[0].destinationContext.includes('Region search: Europe'))
    assert.ok(model.subtitle.includes('Region-based search'))
  })

  it('returns a safe empty model for missing stored results', () => {
    const model = buildSearchResultsViewModel(null)

    assert.equal(model.hasStoredResult, false)
    assert.deepEqual(model.cards, [])
  })
})

function storedFixture(options: {
  ranked?: Array<'Plan A' | 'Plan B' | 'Plan C'>
  staleZed?: boolean
  outOfRangeScores?: boolean
  duplicatePlanA?: boolean
} = {}): BetaSearchStoredResult {
  const labels = options.ranked ?? ['Plan A', 'Plan B', 'Plan C']
  const ranked = labels.map((label, index) => recommendation(label, index + 1, options.outOfRangeScores && index === 0))
  if (options.duplicatePlanA) ranked.push(recommendation('Plan A', 4))
  const details = labels.map((label, index) => detail(label, index + 1, options.staleZed && index === 0))
  return {
    version: 1,
    prompt: 'Family of 5 leaving SBP July 27. Anywhere in Europe.',
    createdAt: '2026-07-22T00:00:00.000Z',
    request: {
      origin: 'SBP',
      destination: 'FRA',
      departureDate: '2026-07-27',
      travelerCount: 5,
      tripMission: {},
      travelerProfile: {},
      preferences: { tripType: 'one_way', destinationRegion: 'Europe' }
    },
    destination: {
      mode: 'region',
      label: 'Europe',
      placeholderAirport: 'FRA',
      preferredDestinations: ['Montenegro', 'Albania', 'Greece']
    },
    positioningAirports: ['SFO', 'LAX'],
    result: {
      id: 'search-fixture',
      generatedAt: '2026-07-22T00:00:00.000Z',
      tripType: 'one_way',
      planA: ranked.find((item) => item.label === 'Plan A'),
      planB: ranked.find((item) => item.label === 'Plan B'),
      planC: ranked.find((item) => item.label === 'Plan C'),
      warnings: ['Live standby/load data is unavailable for this static recommendation.'],
      confidence: { score: 40, label: 'low', reason: 'Fixture' },
      recommendations: {
        planA: ranked.find((item) => item.label === 'Plan A'),
        planB: ranked.find((item) => item.label === 'Plan B'),
        planC: ranked.find((item) => item.label === 'Plan C'),
        ranked
      },
      recommendationDetails: details,
      dataQuality: 'low',
      segments: [segment('fixture-plan-a-segment-1')],
      timeline: [],
      summary: 'Fixture summary',
      fallbacks: [{ label: 'Fallback 1', summary: 'Switch to Plan B if Plan A closes.', trigger: 'If first flight closes' }],
      providerReadiness: {
        schedule: [{ provider: 'flightaware', label: 'FlightAware AeroAPI', enabled: true, credentialConfigured: false, missingEnvKeys: ['FLIGHTAWARE_API_KEY'] }],
        groundTransport: [],
        hotel: [],
        weather: {
          readinessLevel: 'disabled',
          advisoryOnly: true,
          clientLiveCallsAllowed: false,
          appliesToScoring: false,
          unknownWeatherNeutral: true,
          gates: [],
          enabledFlags: [],
          disabledFlags: [],
          diagnostics: [],
          limitations: []
        },
        limitations: []
      },
      unknownScheduleIndicators: ['Unknown - provider schedule validation required', 'Unknown - live load data not attached'],
      itineraries: [{
        id: 'itinerary-plan-a',
        recommendationLabel: 'Plan A',
        recommendationRank: 1,
        gateway: 'FRA',
        confidence: 50,
        summary: 'Plan A summary',
        detailedSummary: 'Detailed summary',
        segments: [segment('fixture-plan-a-segment-1')],
        timeline: [],
        fallbacks: [],
        weatherPlaceholder: 'Weather not evaluated yet.',
        missingData: ['live loads'],
        unknownScheduleIndicators: ['Unknown - live load data not attached'],
        journeys: []
      }],
      pipelineTrace: [],
      missingData: ['live loads', 'operating schedules']
    } as SearchApiSuccessResponse
  }
}

function recommendation(label: 'Plan A' | 'Plan B' | 'Plan C', rank: number, outOfRange = false): SearchApiSuccessResponse['recommendations']['ranked'][number] {
  return {
    label,
    rank,
    status: 'viable',
    gateway: rank === 1 ? 'FRA' : rank === 2 ? 'AMS' : 'MUC',
    finalScore: outOfRange ? 120 : 70 - rank,
    confidence: outOfRange ? -4 : 60 - rank,
    estimatedSuccess: outOfRange ? 101 : 65 - rank,
    summary: `${label} summary`,
    warnings: ['Live standby/load data is unavailable for this static recommendation.'],
    risks: ['Live load data unavailable: No live standby/load signal is attached.']
  }
}

function detail(label: 'Plan A' | 'Plan B' | 'Plan C', rank: number, staleZed = false): SearchApiSuccessResponse['recommendationDetails'][number] {
  return {
    id: `detail-${rank}`,
    label,
    rank,
    status: 'viable',
    gateway: rank === 1 ? 'FRA' : rank === 2 ? 'AMS' : 'MUC',
    finalScore: 70,
    confidence: 60,
    estimatedSuccess: 65,
    wholePartyZedEligible: !staleZed,
    eligibleZedAirlines: staleZed ? ['LH'] : ['LH'],
    strengths: ['strongest available gateway'],
    weaknesses: staleZed ? ['agreement verification is stale'] : ['live load data unavailable'],
    switchConditions: ['switch if whole-party ZED eligibility cannot be confirmed'],
    risks: staleZed
      ? [{ code: 'stale-zed-verification', title: 'ZED verification is stale', description: 'Agreement verification is stale or expired for LH.', severity: 'medium' }]
      : [],
    dataWarnings: rank === 1 && !staleZed ? [] : ['Flight carrier codes unavailable; ZED eligibility cannot be carrier-confirmed.']
  }
}

function segment(id: string): SearchApiSuccessResponse['segments'][number] {
  return {
    id,
    origin: 'SBP',
    destination: 'FRA',
    mode: 'flight',
    schedule: {
      flightNumber: 'Unknown - not provided by route framework',
      departureTime: 'Unknown - provider schedule validation required',
      arrivalTime: 'Unknown - provider schedule validation required',
      seatCount: 'Unknown - live load data not attached'
    },
    estimatedDuration: 'Unknown - provider schedule validation required',
    notes: ['Flight number, departure time, arrival time, and live loads are not attached.']
  }
}
