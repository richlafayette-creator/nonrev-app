import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import {
  createDefaultTripMission,
  normalizeTripMission,
  parseMissionFromPrompt,
  tripMissionAssumptions,
  tripMissionIsComplete
} from './tripMission.ts'

function expectedMonthDay(month: number, day: number) {
  const now = new Date()
  const year = now.getUTCFullYear()
  const today = Date.UTC(year, now.getUTCMonth(), now.getUTCDate())
  const candidate = Date.UTC(year, month - 1, day)
  return new Date(Date.UTC(candidate < today ? year + 1 : year, month - 1, day)).toISOString().slice(0, 10)
}

const fixedNow = new Date('2026-07-22T12:00:00Z')

describe('trip mission parser foundation', () => {
  it('parses a Europe family request with preferred destination context', () => {
    const mission = parseMissionFromPrompt('Family of 5 leaving SBP July 27. Anywhere in Europe. Eventually Montenegro.')

    assert.equal(mission.travelers, 5)
    assert.deepEqual(mission.originAirports, ['SBP'])
    assert.equal(mission.departureDate, expectedMonthDay(7, 27))
    assert.equal(mission.destinationRegion, 'Europe')
    assert.deepEqual(mission.preferredDestinations, ['Montenegro'])
    assert.equal(mission.flexibleGateway, true)
    assert.deepEqual(mission.preferredDepartureAirports, ['SBP'])
    assert.equal(tripMissionIsComplete(mission), true)
  })

  it('parses a Japan request with airport normalization', () => {
    const mission = parseMissionFromPrompt('Two travelers from lax to Japan next month, fastest option')

    assert.equal(mission.travelers, 2)
    assert.deepEqual(mission.originAirports, ['LAX'])
    assert.equal(mission.destinationRegion, 'Japan')
    assert.deepEqual(mission.preferredDestinations, [])
    assert.equal(mission.priority, 'fastest')
  })

  it('parses LAX to HND tomorrow with an injected clock', () => {
    const mission = parseMissionFromPrompt('LAX to HND tomorrow', { now: fixedNow })

    assert.deepEqual(mission.originAirports, ['LAX', 'HND'])
    assert.equal(mission.departureDate, '2026-07-23')
  })

  it('parses SBP to Europe July 27 with an injected clock', () => {
    const mission = parseMissionFromPrompt('Family of 5 leaving SBP July 27. Anywhere in Europe.', { now: fixedNow })

    assert.deepEqual(mission.originAirports, ['SBP'])
    assert.equal(mission.travelers, 5)
    assert.equal(mission.destinationRegion, 'Europe')
    assert.equal(mission.departureDate, '2026-07-27')
  })

  it('parses family of 5 next Friday with an injected clock', () => {
    const mission = parseMissionFromPrompt('Family of 5 to Europe next Friday', { now: fixedNow })

    assert.equal(mission.travelers, 5)
    assert.equal(mission.destinationRegion, 'Europe')
    assert.equal(mission.departureDate, '2026-07-31')
  })

  it('detects flexible gateways and travel modes', () => {
    const mission = parseMissionFromPrompt('Flexible gateway from SFO or OAK to Asia, allow rail and ferry if needed')

    assert.equal(mission.destinationRegion, 'Asia')
    assert.equal(mission.flexibleGateway, true)
    assert.deepEqual(mission.originAirports, ['SFO', 'OAK'])
    assert.equal(mission.allowRail, true)
    assert.equal(mission.allowFerry, true)
  })

  it('supports revenue-only requests without enabling ZED', () => {
    const mission = parseMissionFromPrompt('Revenue only from JFK to Caribbean for 3 passengers, cheapest')

    assert.deepEqual(mission.originAirports, ['JFK'])
    assert.equal(mission.destinationRegion, 'Caribbean')
    assert.equal(mission.travelers, 3)
    assert.equal(mission.allowRevenue, true)
    assert.equal(mission.allowZed, false)
    assert.equal(mission.priority, 'lowest_cost')
  })

  it('detects ZED-enabled missions', () => {
    const mission = parseMissionFromPrompt('ZED from SEA to Tokyo, best chance for one traveler')

    assert.deepEqual(mission.originAirports, ['SEA'])
    assert.equal(mission.destinationRegion, 'Japan')
    assert.deepEqual(mission.preferredDestinations, ['Tokyo'])
    assert.equal(mission.allowZed, true)
    assert.equal(mission.allowRevenue, false)
    assert.equal(mission.priority, 'highest_probability')
  })

  it('returns an incomplete default mission for empty prompts', () => {
    const mission = parseMissionFromPrompt('')

    assert.deepEqual(mission, createDefaultTripMission())
    assert.equal(tripMissionIsComplete(mission), false)
  })

  it('normalizes malformed input without throwing', () => {
    const mission = normalizeTripMission({
      originAirports: ['sbp', 'ZED', null],
      departureDate: 'not-a-date',
      travelers: -4,
      preferredDestinations: ['Montenegro', null, ''],
      flexibleGateway: 'yes',
      preferredDepartureAirports: 'SFO',
      allowZed: 'true',
      allowRevenue: true,
      priority: 'wrong'
    } as any)

    assert.deepEqual(mission.originAirports, ['SBP'])
    assert.equal(mission.departureDate, undefined)
    assert.equal(mission.travelers, 1)
    assert.deepEqual(mission.preferredDestinations, ['Montenegro'])
    assert.equal(mission.flexibleGateway, false)
    assert.deepEqual(mission.preferredDepartureAirports, [])
    assert.equal(mission.allowZed, false)
    assert.equal(mission.allowRevenue, true)
    assert.equal(mission.priority, 'balanced')

    const parsed = parseMissionFromPrompt(null as any)
    assert.deepEqual(parsed, createDefaultTripMission())
  })

  it('summarizes mission assumptions without hidden state', () => {
    const mission = parseMissionFromPrompt('Family of 4 from SFO to Europe with ZED and revenue backup')
    const assumptions = tripMissionAssumptions(mission)

    assert.ok(assumptions.includes('Origin airports: SFO'))
    assert.ok(assumptions.includes('Travelers: 4'))
    assert.ok(assumptions.includes('Destination region: Europe'))
    assert.ok(assumptions.includes('Allowed modes: ZED, revenue'))
  })
})
