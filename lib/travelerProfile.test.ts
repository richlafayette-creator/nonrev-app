import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import {
  defaultTravelerProfile,
  findActiveZedAgreement,
  isEntireTravelingPartyEligible,
  normalizeTravelerProfile,
  travelerProfileAssumptions,
  zedAgreementVerificationIsFresh,
  type ZedAgreementRecord
} from './travelerProfile.ts'

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString()
}

const baseAgreement: ZedAgreementRecord = {
  id: 'agreement-aa',
  airlineCode: 'aa',
  airlineName: 'American',
  agreementType: 'ZED',
  fareLevel: 'ZL',
  bookingPlatform: 'myIDTravel',
  eligibleTravelerTypes: ['employee', 'spouse'],
  cabinAccess: ['Economy'],
  notes: 'Preserve this note exactly.  ',
  verificationStatus: 'employer_verified',
  verifiedAt: isoDaysAgo(30),
  active: true
}

describe('traveler profile ZED agreement model', () => {
  it('normalizes old saved profiles with backward-compatible defaults', () => {
    const profile = normalizeTravelerProfile({
      employeeAirline: 'Delta',
      travelerType: 'Retiree',
      passPriority: 'D1',
      homeAirport: 'sfo',
      preferredAirports: ['lax', 'sea'],
      supportedCarrierEligibility: { united: 'custom United' } as any
    })

    assert.equal(profile.employeeAirline, 'Delta')
    assert.equal(profile.travelerType, 'Retiree')
    assert.equal(profile.passPriority, 'D1')
    assert.equal(profile.homeAirport, 'SFO')
    assert.deepEqual(profile.preferredAirports, ['LAX', 'SEA'])
    assert.equal(profile.supportedCarrierEligibility.united, 'custom United')
    assert.equal(profile.supportedCarrierEligibility.delta, defaultTravelerProfile.supportedCarrierEligibility.delta)
    assert.deepEqual(profile.bookingPlatforms, [])
    assert.deepEqual(profile.travelingParty, [{ id: 'employee', travelerType: 'employee', displayName: 'Employee' }])
    assert.deepEqual(profile.zedAgreements, [])
  })

  it('uppercases agreement airline codes and only removes otherwise-identical duplicates', () => {
    const profile = normalizeTravelerProfile({
      zedAgreements: [
        baseAgreement,
        { ...baseAgreement, id: 'duplicate-id' },
        { ...baseAgreement, id: 'different-fare', fareLevel: 'ZM' }
      ]
    } as any)

    assert.equal(profile.zedAgreements.length, 2)
    assert.deepEqual(profile.zedAgreements.map((agreement) => agreement.airlineCode), ['AA', 'AA'])
    assert.equal(profile.zedAgreements[0].notes, 'Preserve this note exactly.  ')
    assert.deepEqual(profile.zedAgreements.map((agreement) => agreement.fareLevel), ['ZL', 'ZM'])
  })

  it('checks whole-party eligibility against the active agreement', () => {
    const profile = normalizeTravelerProfile({
      travelingParty: [
        { id: 'employee', travelerType: 'employee', displayName: 'Employee' },
        { id: 'spouse', travelerType: 'spouse', displayName: 'Spouse' }
      ],
      zedAgreements: [baseAgreement]
    } as any)

    assert.equal(isEntireTravelingPartyEligible(profile, 'aa'), true)
    assert.equal(isEntireTravelingPartyEligible({
      ...profile,
      travelingParty: [...profile.travelingParty, { id: 'parent', travelerType: 'parent' }]
    }, 'AA'), false)
  })

  it('excludes inactive agreements from lookup and party eligibility', () => {
    const profile = normalizeTravelerProfile({
      zedAgreements: [{ ...baseAgreement, active: false }]
    } as any)

    assert.equal(findActiveZedAgreement(profile, 'AA'), undefined)
    assert.equal(isEntireTravelingPartyEligible(profile, 'AA'), false)
  })

  it('detects stale, expired, unverified, and fresh verification states', () => {
    assert.equal(zedAgreementVerificationIsFresh({ ...baseAgreement, verifiedAt: isoDaysAgo(10) }), true)
    assert.equal(zedAgreementVerificationIsFresh({ ...baseAgreement, verifiedAt: isoDaysAgo(181) }), false)
    assert.equal(zedAgreementVerificationIsFresh({ ...baseAgreement, verificationStatus: 'expired', verifiedAt: isoDaysAgo(10) }), false)
    assert.equal(zedAgreementVerificationIsFresh({ ...baseAgreement, verificationStatus: 'unverified', verifiedAt: isoDaysAgo(10) }), false)
    assert.equal(zedAgreementVerificationIsFresh({ ...baseAgreement, expiresAt: isoDaysAgo(1) }), false)
  })

  it('does not throw on malformed arrays and keeps assumptions free of internal IDs', () => {
    const profile = normalizeTravelerProfile({
      preferredAirports: [{ airport: 'lax' }],
      bookingPlatforms: 'ID90',
      travelingParty: [null, { travelerType: 'not-real' }],
      zedAgreements: [null, { airlineCode: 'nh', airlineName: 'ANA', eligibleTravelerTypes: 'employee', cabinAccess: 'Economy' }]
    } as any)

    assert.deepEqual(profile.preferredAirports, [])
    assert.deepEqual(profile.bookingPlatforms, [])
    assert.deepEqual(profile.travelingParty, [{ id: 'traveler-2', travelerType: 'employee' }])
    assert.equal(profile.zedAgreements.length, 1)
    assert.equal(profile.zedAgreements[0].airlineCode, 'NH')
    assert.equal(profile.zedAgreements[0].active, true)
    assert.deepEqual(profile.zedAgreements[0].eligibleTravelerTypes, [])
    assert.deepEqual(profile.zedAgreements[0].cabinAccess, [])

    const assumptions = travelerProfileAssumptions(profile)
    assert.ok(assumptions.some((assumption) => assumption === 'Active ZED airline codes: NH'))
    assert.equal(assumptions.some((assumption) => assumption.includes('traveler-2')), false)
    assert.equal(assumptions.some((assumption) => assumption.includes(profile.zedAgreements[0].id)), false)
  })
})
