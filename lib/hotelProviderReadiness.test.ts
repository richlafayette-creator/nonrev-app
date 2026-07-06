import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { enabledHotelProviderNames, getHotelProviderReadiness, hotelProviderFeatureFlag } from './hotelProviderReadiness.ts'

function assertNoGuaranteedHotelClaims(text: string) {
  const lower = text.toLowerCase()
  assert.doesNotMatch(lower, /(hotel|room|rate)\s+(is\s+|are\s+)?(available|booked|guaranteed|confirmed)/)
  assert.doesNotMatch(lower, /standby\s+(is\s+)?(available|confirmed|open|cleared|guaranteed)/)
}

describe('hotel provider readiness', () => {
  it('keeps hotel providers disabled by default even when credentials exist', () => {
    const readiness = getHotelProviderReadiness({
      BOOKING_COM_API_KEY: 'configured-but-disabled',
      EXPEDIA_RAPID_API_KEY: 'configured-but-disabled',
      GOOGLE_HOTELS_API_KEY: 'configured-but-disabled'
    })

    assert.equal(readiness.every((source) => source.status === 'feature-disabled'), true)
    assert.equal(readiness.every((source) => source.featureFlagEnvVar === hotelProviderFeatureFlag), true)
    assert.equal(readiness.every((source) => source.advisoryOnly === true), true)
    assert.equal(readiness.every((source) => source.bookingEnabled === false), true)
    assert.deepEqual(enabledHotelProviderNames({ BOOKING_COM_API_KEY: 'configured-but-disabled' }), [])
  })

  it('reports credential and manual readiness only behind the hotel feature flag', () => {
    const env = {
      NONREV_HOTEL_PROVIDER_ENABLED: 'true',
      BOOKING_COM_API_KEY: 'booking-key',
      EXPEDIA_RAPID_API_KEY: 'expedia-key'
    }
    const readiness = getHotelProviderReadiness(env)
    const byProvider = Object.fromEntries(readiness.map((source) => [source.provider, source]))

    assert.equal(byProvider['Booking.com proxy'].status, 'credential-configured')
    assert.equal(byProvider['Expedia/Rapid proxy'].status, 'credential-configured')
    assert.equal(byProvider['Google Hotels context'].status, 'credential-missing')
    assert.equal(byProvider['Manual hotel note'].status, 'manual-source-ready')
    assert.deepEqual(enabledHotelProviderNames(env), ['Booking.com proxy', 'Expedia/Rapid proxy', 'Manual hotel note'])
  })

  it('keeps hotel context read-only without booking or availability guarantees', () => {
    const readiness = getHotelProviderReadiness({ NONREV_HOTEL_PROVIDER_ENABLED: '1' })
    const joined = readiness.flatMap((source) => [...source.canProvide, ...source.cannotProvide, source.nextAction]).join(' ')

    assert.match(joined, /read-only|advisory planning context|cannot book rooms/i)
    assert.match(joined, /guaranteed room availability|booked rooms|guaranteed availability|standby clearance/i)
    assert.equal(readiness.every((source) => source.bookingEnabled === false), true)
    assert.equal(readiness.every((source) => source.advisoryOnly === true), true)
    assertNoGuaranteedHotelClaims(joined)
  })
})
