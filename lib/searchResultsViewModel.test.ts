import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildCompactItinerarySummary, buildExpandedItineraryIdentity, buildSearchResultsViewModel, layoverLabelBetweenSegments } from '../app/results/searchResultsViewModel.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type BetaSearchStoredResult } from './betaSearchClient.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { type SearchApiSuccessResponse } from './searchResponse.ts'

describe('beta search results view model', () => {
  it('maps Plan A, Plan B, and Plan C cards', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.deepEqual(allCards(model).map((card) => card.label), ['Plan A', 'Plan B', 'Plan C'])
  })

  it('allows optional Plan C when the API does not return one', () => {
    const stored = storedFixture({ ranked: ['Plan A', 'Plan B'] })
    const model = buildSearchResultsViewModel(stored)

    assert.deepEqual(allCards(model).map((card) => card.label), ['Plan A', 'Plan B'])
  })

  it('labels whole-party ZED eligibility', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.equal(allCards(model)[0].wholePartyZedLabel, 'Entire party eligible')
  })

  it('uses itinerary-level ZED eligibility when provider-backed carriers are available', () => {
    const stored = storedFixture()
    stored.result.itineraries.unshift({
      ...itinerary('live-option-1', 'Plan A', [scheduledSegment('live-segment-1', 'AA169')]),
      zedEligibility: {
        status: 'eligible',
        label: 'ZED eligible',
        requiredCarriers: ['AA'],
        eligibleCarriers: ['AA'],
        ineligibleCarriers: [],
        unknownCarriers: [],
        revenueAlternative: false,
        reasons: ['AA: stored agreement covers the current traveling party.']
      }
    })
    const model = buildSearchResultsViewModel(stored)

    assert.equal(model.cards[0].zedEligibilityLabel, 'ZED eligible')
    assert.equal(model.cards[0].zedEligibilityStatus, 'eligible')
  })

  it('labels stale ZED agreements', () => {
    const stored = storedFixture({ staleZed: true })
    const model = buildSearchResultsViewModel(stored)

    assert.equal(allCards(model)[0].wholePartyZedLabel, 'Agreement stale')
  })

  it('labels unknown carriers on segments', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.equal(allCards(model)[0].segments[0].carrierLabel, 'Carrier not confirmed')
    assert.equal(allCards(model)[0].segments[0].airlineName, 'Carrier not confirmed')
  })

  it('maps airline codes to full names for compact result rows', () => {
    const stored = storedFixture()
    stored.result.itineraries.unshift({
      ...itinerary('live-option-1', 'Plan A', [scheduledSegment('live-segment-1', 'DL7', { carrier: 'DL' })])
    })

    const segment = buildSearchResultsViewModel(stored).cards[0].segments[0]

    assert.equal(segment.airlineCode, 'DL')
    assert.equal(segment.airlineName, 'Delta Air Lines')
    assert.equal(segment.arrivalRequestDate, '2026-07-28')
  })

  it('shows natural-language airport resolution assumptions in the subtitle', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.prompt = 'SBP to closest airport to Longview, WA'
    stored.request.origin = 'SBP'
    stored.request.destination = 'PDX'
    stored.destination = {
      mode: 'airport',
      label: 'closest airport to Longview, WA',
      preferredDestinations: [],
      resolution: {
        originalText: 'closest airport to Longview, WA',
        normalizedText: 'CLOSEST AIRPORT TO LONGVIEW WA',
        type: 'place',
        confidence: 'medium',
        explanation: 'Using nearby commercial airports for Longview, WA.',
        candidates: [
          { code: 'PDX', name: 'Portland International Airport', city: 'Portland', country: 'United States', latitude: 45.58869934, longitude: -122.5979996, distanceMiles: 41.4 },
          { code: 'SEA', name: 'Seattle Tacoma International Airport', city: 'Seattle', country: 'United States', latitude: 47.449001, longitude: -122.308998, distanceMiles: 95.3 }
        ]
      }
    }
    stored.originResolution = {
      originalText: 'SBP',
      normalizedText: 'SBP',
      type: 'airport',
      confidence: 'high',
      explanation: 'SBP is an exact IATA airport match.',
      candidates: [{ code: 'SBP', name: 'San Luis County Regional Airport', city: 'San Luis Obispo', country: 'United States', latitude: 35.236801147499996, longitude: -120.641998291 }]
    }

    const model = buildSearchResultsViewModel(stored)

    assert.match(model.subtitle, /Resolved Using PDX for Longview, WA; alternatives SEA\./)
  })

  it('shows city-country destination assumptions in the result summary', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.prompt = 'SBP to Bari, Italy'
    stored.request.origin = 'SBP'
    stored.request.destination = 'BRI'
    stored.destination = {
      mode: 'airport',
      label: 'Bari, Italy',
      preferredDestinations: [],
      resolution: {
        originalText: 'Bari, Italy',
        normalizedText: 'BARI ITALY',
        type: 'city',
        confidence: 'high',
        explanation: 'Bari Italy resolves by city and country or region.',
        candidates: [
          { code: 'BRI', name: 'Bari Karol Wojtyla Airport', city: 'Bari', country: 'Italy', latitude: 41.138901, longitude: 16.760599 }
        ]
      }
    }

    const model = buildSearchResultsViewModel(stored)

    assert.match(model.subtitle, /Resolved Using BRI for Bari, Italy\./)
  })

  it('builds a direct whole-itinerary collapsed summary', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.request.origin = 'LAX'
    stored.request.destination = 'HND'
    stored.destination = {
      mode: 'airport',
      label: 'HND',
      preferredDestinations: []
    }
    stored.result.itineraries = [itinerary('direct-aa27', 'Plan A', [scheduledSegment('direct-aa27-segment', 'AA27', {
      carrier: 'AA',
      origin: 'LAX',
      destination: 'HND',
      departureTime: '2026-08-20T19:15:00.000Z',
      arrivalTime: '2026-08-21T06:50:00.000Z',
      departureTimeZone: 'America/Los_Angeles',
      arrivalTimeZone: 'Asia/Tokyo'
    })])]

    const card = buildSearchResultsViewModel(stored).cards[0]
    const summary = buildCompactItinerarySummary(card, 1)

    assert.equal(summary.flightSummary, 'AA 27')
    assert.equal(summary.routeSummary, 'LAX–HND')
    assert.equal(summary.timeSummary, '12:15 PM → 3:50 PM +1')
    assert.equal(summary.durationLabel, '11h35')
    assert.equal(summary.stopsLabel, 'Nonstop')
    assert.equal(summary.airlineName, 'American Airlines')
  })

  it('builds a multi-leg whole-itinerary collapsed summary', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.request.origin = 'SBP'
    stored.request.destination = 'FCO'
    stored.destination = {
      mode: 'airport',
      label: 'FCO',
      preferredDestinations: []
    }
    stored.result.itineraries = [itinerary('sbp-fco-complete', 'Plan A', [
      scheduledSegment('sbp-sfo', 'UA523', {
        carrier: 'UA',
        origin: 'SBP',
        destination: 'SFO',
        departureTime: '2026-08-20T14:10:00.000Z',
        arrivalTime: '2026-08-20T15:05:00.000Z',
        departureTimeZone: 'America/Los_Angeles',
        arrivalTimeZone: 'America/Los_Angeles',
        estimatedDuration: '55m'
      }),
      scheduledSegment('sfo-fco', 'LH455', {
        carrier: 'LH',
        origin: 'SFO',
        destination: 'FCO',
        departureTime: '2026-08-20T17:15:00.000Z',
        arrivalTime: '2026-08-21T08:05:00.000Z',
        departureTimeZone: 'America/Los_Angeles',
        arrivalTimeZone: 'Europe/Rome',
        estimatedDuration: '14h 50m'
      })
    ])]

    const card = buildSearchResultsViewModel(stored).cards[0]
    const summary = buildCompactItinerarySummary(card, 1)

    assert.equal(summary.flightSummary, 'UA 523 / LH 455')
    assert.equal(summary.routeSummary, 'SBP–SFO–FCO')
    assert.equal(summary.timeSummary, '7:10 AM → 10:05 AM +1')
    assert.equal(summary.durationLabel, '17h55')
    assert.equal(summary.stopsLabel, '1 stop')
    assert.equal(card.segments.length, 2)
  })

  it('does not let a downstream-only SBP to FCO schedule masquerade as the collapsed itinerary', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.request.origin = 'SBP'
    stored.request.destination = 'FCO'
    stored.destination = {
      mode: 'airport',
      label: 'FCO',
      preferredDestinations: []
    }
    stored.result.itineraries = [itinerary('downstream-fra-fco', 'Plan A', [scheduledSegment('fra-fco', 'LH230', {
      carrier: 'LH',
      origin: 'FRA',
      destination: 'FCO',
      departureTime: '2026-08-22T05:15:00.000Z',
      arrivalTime: '2026-08-22T07:05:00.000Z',
      departureTimeZone: 'Europe/Berlin',
      arrivalTimeZone: 'Europe/Rome',
      estimatedDuration: '1h 50m'
    })])]

    const model = buildSearchResultsViewModel(stored)
    const card = model.secondaryCards[0]
    const summary = buildCompactItinerarySummary(card, 1)

    assert.equal(model.cards.length, 0)
    assert.equal(card.resultClass, 'partial')
    assert.equal(summary.flightSummary, 'Partial schedule')
    assert.equal(summary.routeSummary, 'SBP–FCO · FRA–FCO partly verified')
    assert.equal(summary.timeSummary, 'Full itinerary time pending')
    assert.match(card.resultClassSummary, /SBP to FCO/i)
  })

  it('keeps the requested SBP to FCO journey as the expanded partial-itinerary identity', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.request.origin = 'SBP'
    stored.request.destination = 'FCO'
    stored.destination = {
      mode: 'airport',
      label: 'FCO',
      preferredDestinations: []
    }
    stored.result.itineraries = [itinerary('partial-ac9156', 'Plan A', [scheduledSegment('fra-fco-ac9156', 'AC9156', {
      carrier: 'AC',
      origin: 'FRA',
      destination: 'FCO',
      departureTime: '2026-08-22T08:40:00.000Z',
      arrivalTime: '2026-08-22T10:30:00.000Z',
      departureTimeZone: 'Europe/Berlin',
      arrivalTimeZone: 'Europe/Rome',
      estimatedDuration: '1h 50m'
    })])]

    const card = buildSearchResultsViewModel(stored).secondaryCards[0]
    const identity = buildExpandedItineraryIdentity(card)

    assert.equal(identity.requestedJourneyLabel, 'SBP → FCO')
    assert.equal(identity.scheduleState, 'Partial schedule: some legs verified')
    assert.equal(identity.verifiedSegmentLabel, 'Verified segment(s)')
    assert.deepEqual(identity.verifiedSegments.map((segment) => `${segment.flight} ${segment.route}`), ['AC9156 FRA → FCO'])
    assert.equal(identity.unverifiedSummary, 'SBP → ... → FRA schedule not yet attached.')
  })

  it('keeps complete LAX to HND direct itinerary identity unchanged', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.request.origin = 'LAX'
    stored.request.destination = 'HND'
    stored.destination = {
      mode: 'airport',
      label: 'HND',
      preferredDestinations: []
    }
    stored.result.itineraries = [itinerary('complete-dl7', 'Plan A', [scheduledSegment('complete-dl7-segment', 'DL7', {
      carrier: 'DL',
      origin: 'LAX',
      destination: 'HND',
      departureTime: '2026-08-20T17:40:00.000Z',
      arrivalTime: '2026-08-21T05:00:00.000Z',
      departureTimeZone: 'America/Los_Angeles',
      arrivalTimeZone: 'Asia/Tokyo'
    })])]

    const card = buildSearchResultsViewModel(stored).cards[0]
    const identity = buildExpandedItineraryIdentity(card)
    const summary = buildCompactItinerarySummary(card, 1)

    assert.equal(identity.requestedJourneyLabel, 'LAX → HND')
    assert.equal(identity.scheduleState, 'Complete scheduled itinerary')
    assert.equal(identity.unverifiedSummary, '')
    assert.equal(summary.routeSummary, 'LAX–HND')
    assert.equal(summary.flightSummary, 'DL 7')
  })

  it('keeps all expanded leg details available for a collapsed multi-leg row', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.request.origin = 'SBP'
    stored.request.destination = 'FCO'
    stored.destination = {
      mode: 'airport',
      label: 'FCO',
      preferredDestinations: []
    }
    stored.result.itineraries = [itinerary('sbp-fco-expanded', 'Plan A', [
      scheduledSegment('sbp-sfo-expanded', 'UA523', { carrier: 'UA', origin: 'SBP', destination: 'SFO' }),
      scheduledSegment('sfo-fco-expanded', 'LH455', { carrier: 'LH', origin: 'SFO', destination: 'FCO' })
    ])]

    const card = buildSearchResultsViewModel(stored).cards[0]

    assert.deepEqual(card.segments.map((segment) => `${segment.flightNumber} ${segment.origin}-${segment.destination}`), [
      'UA523 SBP-SFO',
      'LH455 SFO-FCO'
    ])
    assert.equal(buildCompactItinerarySummary(card, 1).routeSummary, 'SBP–SFO–FCO')
  })

  it('calculates positive same-airport layovers from absolute timestamps', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.request.origin = 'SBA'
    stored.request.destination = 'HNL'
    stored.destination = { mode: 'airport', label: 'HNL', preferredDestinations: [] }
    stored.result.itineraries = [itinerary('sba-hnl-layover', 'Plan A', [
      scheduledSegment('sba-den-layover', 'UA2865', {
        carrier: 'UA',
        origin: 'SBA',
        destination: 'DEN',
        departureTime: '2026-08-22T12:00:00.000Z',
        arrivalTime: '2026-08-22T15:30:00.000Z',
        departureTimeZone: 'America/Los_Angeles',
        arrivalTimeZone: 'America/Denver',
        estimatedDuration: '2h 30m'
      }),
      scheduledSegment('den-hnl-layover', 'UA384', {
        carrier: 'UA',
        origin: 'DEN',
        destination: 'HNL',
        departureTime: '2026-08-22T19:00:00.000Z',
        arrivalTime: '2026-08-23T01:16:00.000Z',
        departureTimeZone: 'America/Denver',
        arrivalTimeZone: 'Pacific/Honolulu',
        estimatedDuration: '7h 16m'
      })
    ])]

    const card = buildSearchResultsViewModel(stored).cards[0]

    assert.equal(layoverLabelBetweenSegments(card.segments[0], card.segments[1]), '3h30 layover in DEN')
    assert.deepEqual(card.segments.map((segment) => `${segment.flightNumber} ${segment.origin}-${segment.destination}`), [
      'UA2865 SBA-DEN',
      'UA384 DEN-HNL'
    ])
  })

  it('handles overnight layovers and suppresses impossible or airport-transfer layovers', () => {
    const first = scheduledSegment('lax-sfo-overnight', 'UA100', {
      carrier: 'UA',
      origin: 'LAX',
      destination: 'SFO',
      departureTime: '2026-08-22T20:00:00.000Z',
      arrivalTime: '2026-08-22T23:00:00.000Z',
      departureTimeZone: 'America/Los_Angeles',
      arrivalTimeZone: 'America/Los_Angeles'
    })
    const second = scheduledSegment('sfo-fco-overnight', 'UA507', {
      carrier: 'UA',
      origin: 'SFO',
      destination: 'FCO',
      departureTime: '2026-08-23T01:30:00.000Z',
      arrivalTime: '2026-08-23T14:30:00.000Z',
      departureTimeZone: 'America/Los_Angeles',
      arrivalTimeZone: 'Europe/Rome'
    })
    const backwards = scheduledSegment('sfo-fco-backwards', 'UA507', {
      carrier: 'UA',
      origin: 'SFO',
      destination: 'FCO',
      departureTime: '2026-08-22T22:30:00.000Z',
      arrivalTime: '2026-08-23T14:30:00.000Z'
    })
    const airportTransfer = scheduledSegment('sjc-fco-transfer', 'UA507', {
      carrier: 'UA',
      origin: 'SJC',
      destination: 'FCO',
      departureTime: '2026-08-23T01:30:00.000Z',
      arrivalTime: '2026-08-23T14:30:00.000Z'
    })
    const firstSegment = buildSearchResultsViewModel(storedWithSegments([first, second])).cards[0].segments[0]
    const secondSegment = buildSearchResultsViewModel(storedWithSegments([first, second])).cards[0].segments[1]
    const backwardsSegment = buildSearchResultsViewModel(storedWithSegments([first, backwards])).cards[0].segments[1]
    const transferSegment = buildSearchResultsViewModel(storedWithSegments([first, airportTransfer])).cards[0].segments[1]

    assert.equal(layoverLabelBetweenSegments(firstSegment, secondSegment), '2h30 layover in SFO')
    assert.equal(layoverLabelBetweenSegments(firstSegment, backwardsSegment), '')
    assert.equal(layoverLabelBetweenSegments(firstSegment, transferSegment), '')
  })

  it('does not describe framework-only routes as complete scheduled itineraries', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.request.origin = 'GEG'
    stored.request.destination = 'NAP'
    stored.destination = {
      mode: 'airport',
      label: 'NAP',
      preferredDestinations: []
    }
    stored.result.itineraries = [itinerary('framework-geg-nap', 'Plan A', [
      unscheduledSegment('geg-fra-framework', { origin: 'GEG', destination: 'FRA' }),
      unscheduledSegment('fra-nap-framework', { origin: 'FRA', destination: 'NAP' })
    ])]

    const card = buildSearchResultsViewModel(stored).secondaryCards[0]
    const identity = buildExpandedItineraryIdentity(card)
    const summary = buildCompactItinerarySummary(card, 1)

    assert.equal(card.resultClass, 'framework')
    assert.equal(identity.scheduleState, 'Route framework only: schedules not verified')
    assert.equal(identity.verifiedSegmentLabel, 'Route concept segment(s)')
    assert.equal(summary.routeSummary, 'GEG–NAP · GEG–FRA–NAP framework')
    assert.equal(JSON.stringify({ identity, card }).includes('Complete scheduled itinerary'), false)
  })

  it('labels unknown schedules honestly', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.equal(allCards(model)[0].segments[0].scheduleStatus, 'Schedule not yet verified')
  })

  it('labels unknown live loads honestly', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.equal(allCards(model)[0].segments[0].loadStatus, 'Live load unavailable')
  })

  it('surfaces data-quality warning context', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.equal(model.dataQualityLabel, 'Data quality: low')
    assert.ok(model.staticOnlyNotice.includes('Some schedules or standby loads may be missing'))
  })

  it('normalizes scores into display bounds', () => {
    const model = buildSearchResultsViewModel(storedFixture({ outOfRangeScores: true }))

    assert.equal(allCards(model)[0].finalScore, 100)
    assert.equal(allCards(model)[0].confidence, 0)
    assert.equal(allCards(model)[0].planningSuccessScore, 100)
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

    assert.equal(allCards(model).filter((card) => card.label === 'Plan A').length, 1)
  })

  it('handles empty recommendations', () => {
    const model = buildSearchResultsViewModel(storedFixture({ ranked: [] }))

    assert.deepEqual(model.cards, [])
    assert.deepEqual(model.secondaryCards, [])
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

    assert.ok(allCards(model)[0].destinationContext.includes('Region search: Europe'))
    assert.ok(model.subtitle.includes('Region-based search'))
  })

  it('keeps unresolved route frameworks out of primary itinerary cards', () => {
    const model = buildSearchResultsViewModel(storedFixture())

    assert.deepEqual(model.cards, [])
    assert.deepEqual(model.secondaryCards.map((card) => card.resultClass), ['framework', 'framework', 'framework'])
    assert.match(model.secondaryCards[0].resultClassSummary, /route framework only/i)
  })

  it('promotes multiple scheduled provider itineraries ahead of unresolved frameworks', () => {
    const stored = storedFixture()
    stored.result.itineraries.unshift(
      itinerary('live-option-1', 'Plan A', [scheduledSegment('live-segment-1', 'AA169')]),
      itinerary('live-option-2', 'Plan A', [scheduledSegment('live-segment-2', 'JL15')])
    )
    const model = buildSearchResultsViewModel(stored)

    assert.deepEqual(model.cards.map((card) => card.resultClass), ['scheduled', 'scheduled'])
    assert.deepEqual(model.cards.map((card) => card.segments[0].flightNumber), ['AA169', 'JL15'])
    assert.equal(model.secondaryCards.length, 3)
  })

  it('renders a complete composed SBP to FCO itinerary ahead of framework routes', () => {
    const stored = storedFixture({ ranked: ['Plan A', 'Plan B'] })
    stored.request.origin = 'SBP'
    stored.request.destination = 'FCO'
    stored.destination = {
      mode: 'airport',
      label: 'FCO',
      preferredDestinations: []
    }
    stored.result.itineraries = [
      itinerary('framework-sbp-fra-fco', 'Plan A', [
        segment('framework-sbp-fra'),
        { ...segment('framework-fra-fco'), origin: 'FRA', destination: 'FCO' }
      ]),
      itinerary('complete-sbp-den-fco', 'Plan A', [
        scheduledSegment('sbp-den-ua2329', 'UA2329', {
          carrier: 'UA',
          origin: 'SBP',
          destination: 'DEN',
          departureTime: '2026-08-22T12:20:00.000Z',
          arrivalTime: '2026-08-22T15:45:00.000Z',
          departureTimeZone: 'America/Los_Angeles',
          arrivalTimeZone: 'America/Denver',
          estimatedDuration: '2h 25m'
        }),
        scheduledSegment('den-fco-ua177', 'UA177', {
          carrier: 'UA',
          origin: 'DEN',
          destination: 'FCO',
          departureTime: '2026-08-22T17:30:00.000Z',
          arrivalTime: '2026-08-23T03:20:00.000Z',
          departureTimeZone: 'America/Denver',
          arrivalTimeZone: 'Europe/Rome',
          estimatedDuration: '9h 50m'
        })
      ])
    ]

    const model = buildSearchResultsViewModel(stored)
    const primary = model.cards[0]
    const summary = buildCompactItinerarySummary(primary, 1)
    const identity = buildExpandedItineraryIdentity(primary)

    assert.equal(primary.resultClass, 'scheduled')
    assert.equal(primary.key, 'complete-sbp-den-fco')
    assert.equal(summary.flightSummary, 'UA 2329 / UA 177')
    assert.equal(summary.routeSummary, 'SBP–DEN–FCO')
    assert.equal(summary.stopsLabel, '1 stop')
    assert.deepEqual(primary.segments.map((segment) => `${segment.flightNumber} ${segment.origin}-${segment.destination}`), [
      'UA2329 SBP-DEN',
      'UA177 DEN-FCO'
    ])
    assert.equal(identity.requestedJourneyLabel, 'SBP → FCO')
    assert.equal(identity.scheduleState, 'Complete scheduled itinerary')
    assert.deepEqual(model.secondaryCards.map((card) => card.key), ['framework-sbp-fra-fco'])
  })

  it('displays LAX and HND airport-local times from UTC schedule timestamps', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.result.itineraries = [itinerary('live-dl7', 'Plan A', [scheduledSegment('live-dl7-segment', 'DL7', {
      carrier: 'DL',
      departureTime: '2026-08-20T17:40:00.000Z',
      arrivalTime: '2026-08-21T05:00:00.000Z',
      departureTimeZone: 'America/Los_Angeles',
      arrivalTimeZone: 'Asia/Tokyo'
    })])]

    const segment = buildSearchResultsViewModel(stored).cards[0].segments[0]

    assert.equal(segment.departureTime, '10:40 AM')
    assert.equal(segment.departureDate, 'Aug 20')
    assert.equal(segment.arrivalTime, '2:00 PM')
    assert.equal(segment.arrivalDate, 'Aug 21')
    assert.equal(segment.timeBasis, 'Airport-local time (America/Los_Angeles) · Airport-local time (Asia/Tokyo)')
  })

  it('uses PST for winter Los Angeles schedules', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.result.itineraries = [itinerary('winter-lax', 'Plan A', [scheduledSegment('winter-lax-segment', 'AA169', {
      departureTime: '2026-01-15T17:40:00.000Z',
      arrivalTime: '2026-01-16T05:00:00.000Z',
      departureTimeZone: 'America/Los_Angeles',
      arrivalTimeZone: 'Asia/Tokyo'
    })])]

    const segment = buildSearchResultsViewModel(stored).cards[0].segments[0]

    assert.equal(segment.departureTime, '9:40 AM')
    assert.equal(segment.departureDate, 'Jan 15')
  })

  it('keeps Tokyo schedules on JST without daylight-saving shifts', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.result.itineraries = [itinerary('tokyo-jst', 'Plan A', [scheduledSegment('tokyo-jst-segment', 'NH105', {
      departureTime: '2026-07-10T05:00:00.000Z',
      arrivalTime: '2026-07-10T05:00:00.000Z',
      departureTimeZone: 'Asia/Tokyo',
      arrivalTimeZone: 'Asia/Tokyo'
    })])]

    const segment = buildSearchResultsViewModel(stored).cards[0].segments[0]

    assert.equal(segment.departureTime, '2:00 PM')
    assert.equal(segment.arrivalTime, '2:00 PM')
  })

  it('falls back to explicitly labeled UTC when airport timezone is unavailable', () => {
    const stored = storedFixture({ ranked: ['Plan A'] })
    stored.result.itineraries = [itinerary('unknown-zone', 'Plan A', [scheduledSegment('unknown-zone-segment', 'AA169', {
      departureTime: '2026-08-20T17:40:00.000Z',
      arrivalTime: '2026-08-21T05:00:00.000Z',
      departureTimeZone: undefined,
      arrivalTimeZone: undefined
    })])]

    const segment = buildSearchResultsViewModel(stored).cards[0].segments[0]

    assert.equal(segment.departureTime, '17:40 UTC')
    assert.equal(segment.arrivalTime, '05:00 UTC')
  })

  it('does not depend on the server timezone when formatting airport-local times', () => {
    const originalTimezone = process.env.TZ
    process.env.TZ = 'Pacific/Honolulu'
    try {
      const stored = storedFixture({ ranked: ['Plan A'] })
      stored.result.itineraries = [itinerary('server-zone', 'Plan A', [scheduledSegment('server-zone-segment', 'DL7', {
        carrier: 'DL',
        departureTime: '2026-08-20T17:40:00.000Z',
        arrivalTime: '2026-08-21T05:00:00.000Z',
        departureTimeZone: 'America/Los_Angeles',
        arrivalTimeZone: 'Asia/Tokyo'
      })])]

      const segment = buildSearchResultsViewModel(stored).cards[0].segments[0]

      assert.equal(segment.departureTime, '10:40 AM')
      assert.equal(segment.arrivalTime, '2:00 PM')
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimezone
    }
  })

  it('returns a safe empty model for missing stored results', () => {
    const model = buildSearchResultsViewModel(null)

    assert.equal(model.hasStoredResult, false)
    assert.deepEqual(model.cards, [])
  })
})

function allCards(model: ReturnType<typeof buildSearchResultsViewModel>) {
  return [...model.cards, ...model.secondaryCards]
}

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
      providerHealth: [],
      unknownScheduleIndicators: ['Unknown - provider schedule validation required', 'Unknown - live load data not attached'],
      itineraries: labels.map((label, index) => itinerary(`itinerary-${label.toLowerCase().replace(/\s+/g, '-')}`, label, [segment(`fixture-${label.toLowerCase().replace(/\s+/g, '-')}-segment-1`)], index + 1)),
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

function unscheduledSegment(id: string, overrides: {
  origin?: string
  destination?: string
} = {}): SearchApiSuccessResponse['segments'][number] {
  return {
    ...segment(id),
    origin: overrides.origin || 'SBP',
    destination: overrides.destination || 'FRA'
  }
}

function scheduledSegment(id: string, flightNumber: string, overrides: {
  carrier?: string
  origin?: string
  destination?: string
  departureTime?: string
  arrivalTime?: string
  departureTimeZone?: string
  arrivalTimeZone?: string
  estimatedDuration?: string
} = {}): SearchApiSuccessResponse['segments'][number] {
  const departureTime = overrides.departureTime || '2026-07-27T13:00:00.000Z'
  const arrivalTime = overrides.arrivalTime || '2026-07-28T04:30:00.000Z'
  return {
    id,
    origin: overrides.origin || 'LAX',
    destination: overrides.destination || 'HND',
    mode: 'flight',
    carrier: overrides.carrier || (flightNumber.startsWith('AA') ? 'AA' : 'JL'),
    schedule: {
      flightNumber,
      departureTime,
      arrivalTime,
      scheduledDepartureUtc: departureTime,
      scheduledArrivalUtc: arrivalTime,
      seatCount: 'Unknown - live load data not attached',
      ...(overrides.departureTimeZone ? { departureTimeZone: overrides.departureTimeZone, departureAirportTimeZone: overrides.departureTimeZone } : {}),
      ...(overrides.arrivalTimeZone ? { arrivalTimeZone: overrides.arrivalTimeZone, arrivalAirportTimeZone: overrides.arrivalTimeZone } : {})
    },
    estimatedDuration: overrides.estimatedDuration || '15h 30m',
    notes: ['Schedule data: test provider']
  }
}

function storedWithSegments(segments: SearchApiSuccessResponse['segments']) {
  const stored = storedFixture({ ranked: ['Plan A'] })
  const first = segments[0]
  const last = segments[segments.length - 1] || first
  stored.request.origin = first?.origin || 'LAX'
  stored.request.destination = last?.destination || 'HND'
  stored.destination = {
    mode: 'airport',
    label: stored.request.destination,
    preferredDestinations: []
  }
  stored.result.itineraries = [itinerary('layover-fixture', 'Plan A', segments)]
  return stored
}

function itinerary(
  id: string,
  label: 'Plan A' | 'Plan B' | 'Plan C',
  segments: SearchApiSuccessResponse['segments'],
  rank = label === 'Plan A' ? 1 : label === 'Plan B' ? 2 : 3
): SearchApiSuccessResponse['itineraries'][number] {
  return {
    id,
    recommendationLabel: label,
    recommendationRank: rank,
    gateway: rank === 1 ? 'FRA' : rank === 2 ? 'AMS' : 'MUC',
    confidence: 50,
    summary: `${label} summary`,
    detailedSummary: 'Detailed summary',
    segments,
    timeline: [],
    fallbacks: [],
    requiredZedAirlines: [],
    eligibleZedAirlines: [],
    revenueAirlines: [],
    providerAttribution: [],
    weatherPlaceholder: 'Weather not evaluated yet.',
    missingData: segments.some((item) => item.schedule.flightNumber.startsWith('Unknown')) ? ['operating schedules', 'live loads'] : ['live loads'],
    unknownScheduleIndicators: segments.some((item) => item.schedule.flightNumber.startsWith('Unknown')) ? ['Unknown - live load data not attached'] : [],
    journeys: []
  }
}
