import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  airlineEmployers,
  companyEmailDomainAllowed,
  createPendingCompanyEmailVerification,
  createPendingManualVerification,
  reviewEmployeeVerification
} from './employeeVerification'
import {
  employeeVerificationCookieMaxAgeSeconds,
  employeeVerificationCookieIsValid,
  makeEmployeeVerificationAccountCookieValue,
  makeEmployeeVerificationCookieValue,
  readEmployeeVerificationCookie,
  verificationAccessDecision
} from './employeeVerificationAccess'
import { internalRouteAccessDecision } from './internalRouteAccess'

const env = {
  NONREVY_VERIFICATION_COOKIE_SECRET: 'verification-cookie-secret-for-tests',
  NONREVY_OPERATOR_ACCESS_TOKEN: 'operator-token-for-tests',
  NONREVY_ADMIN_ACCESS_TOKEN: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined
}

describe('employee verification access', () => {
  it('validates company email domains without relying only on user-entered airline names', () => {
    assert.ok(airlineEmployers.some((airline) => airline.code === 'UA' && airline.domains.includes('united.com')))
    assert.equal(companyEmailDomainAllowed('UA', 'tester@united.com').allowed, true)
    assert.equal(companyEmailDomainAllowed('UA', 'tester@example.com').allowed, false)
    assert.equal(companyEmailDomainAllowed('United Airlines', 'tester@united.com').allowed, true)
  })

  it('creates pending records with minimal retained identity data', () => {
    const created = createPendingCompanyEmailVerification({
      userId: 'user:123',
      airlineCode: 'UA',
      workEmail: 'Tester@United.com'
    })
    assert.equal(created.ok, true)
    if (!created.ok) return
    assert.equal(created.record.status, 'pending')
    assert.equal(created.record.airlineCode, 'UA')
    assert.equal(created.record.emailDomain, 'united.com')
    assert.ok(created.record.workEmailHash)
    assert.doesNotMatch(JSON.stringify(created.record), /Tester@United\.com/i)
  })

  it('supports manual review without public evidence storage', () => {
    const created = createPendingManualVerification({
      userId: 'user:manual',
      airlineCode: 'DL',
      reasonCategory: 'cannot-use-work-email'
    })
    assert.equal(created.ok, true)
    if (!created.ok) return
    assert.equal(created.record.status, 'pending')
    assert.equal(created.record.method, 'manual_review')
    assert.doesNotMatch(JSON.stringify(created.record), /url|bucket|object|passport|license/i)
  })

  it('lets operators approve without changing ZED agreement state', () => {
    const pending = createPendingManualVerification({ userId: 'user:zed-separate', airlineCode: 'AA' })
    assert.equal(pending.ok, true)
    if (!pending.ok) return
    const reviewed = reviewEmployeeVerification({
      existing: pending.record,
      targetUserId: pending.record.userId,
      status: 'verified',
      reviewerId: 'operator:1'
    })
    assert.equal(reviewed.ok, true)
    if (!reviewed.ok) return
    assert.equal(reviewed.record.status, 'verified')
    assert.equal(reviewed.record.airlineCode, 'AA')
    assert.doesNotMatch(JSON.stringify(reviewed.record), /zedAgreements|eligibleTravelerTypes/)
  })

  it('denies unverified and pending travelers from protected routes', () => {
    assert.deepEqual(
      verificationAccessDecision({ pathname: '/', env }).authorized,
      false
    )
    assert.deepEqual(
      verificationAccessDecision({ pathname: '/results', env }).redirectTo,
      '/verify?next=%2Fresults'
    )
    assert.equal(
      verificationAccessDecision({ pathname: '/api/load-requests', env }).api,
      true
    )
  })

  it('allows verified traveler cookies and rejects forged cookies', () => {
    const cookie = makeEmployeeVerificationCookieValue({
      userId: 'user:verified',
      status: 'verified',
      airlineCode: 'UA',
      verifiedAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z'
    }, env)
    const accountCookie = makeEmployeeVerificationAccountCookieValue('user:verified', env)
    assert.ok(cookie)
    assert.equal(employeeVerificationCookieIsValid(cookie, env), true)
    assert.equal(employeeVerificationCookieIsValid(`${cookie.slice(0, -3)}abc`, env), false)
    assert.equal(verificationAccessDecision({ pathname: '/', verifiedCookie: cookie, accountCookie, env }).authorized, true)
    assert.equal(verificationAccessDecision({ pathname: '/', verifiedCookie: cookie, env }).authorized, false)
  })

  it('rejects a copied User A verification cookie for User B account binding', () => {
    const userACookie = makeEmployeeVerificationCookieValue({
      userId: 'user:a',
      status: 'verified',
      airlineCode: 'UA',
      verifiedAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z'
    }, env)
    const userBBinding = makeEmployeeVerificationAccountCookieValue('user:b', env)
    assert.equal(verificationAccessDecision({ pathname: '/', verifiedCookie: userACookie, accountCookie: userBBinding, env }).authorized, false)
  })

  it('fails closed when the dedicated cookie secret is missing and does not use service-role fallback', () => {
    const fallbackOnlyEnv = { SUPABASE_SERVICE_ROLE_KEY: 'service-role-must-not-sign' }
    const cookie = makeEmployeeVerificationCookieValue({
      userId: 'user:missing-secret',
      status: 'verified',
      airlineCode: 'UA',
      verifiedAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:00.000Z'
    }, fallbackOnlyEnv)
    assert.equal(cookie, '')
    assert.equal(employeeVerificationCookieIsValid('anything.signed', fallbackOnlyEnv), false)
  })

  it('uses a short-lived cookie so revoked or reverify-required records cannot retain access indefinitely', () => {
    assert.ok(employeeVerificationCookieMaxAgeSeconds <= 30 * 60)
    const verified = reviewEmployeeVerification({
      existing: null,
      targetUserId: 'user:revoked',
      airlineCode: 'UA',
      status: 'verified',
      reviewerId: 'operator:1'
    })
    assert.equal(verified.ok, true)
    if (!verified.ok) return
    const revoked = reviewEmployeeVerification({
      existing: verified.record,
      targetUserId: 'user:revoked',
      status: 'reverify_required',
      reviewerId: 'operator:1'
    })
    assert.equal(revoked.ok, true)
    if (!revoked.ok) return
    assert.equal(makeEmployeeVerificationCookieValue(revoked.record, env), '')
  })

  it('rejects expired verification cookies', () => {
    const originalNow = Date.now
    try {
      Date.now = () => 1_000_000
      const cookie = makeEmployeeVerificationCookieValue({
        userId: 'user:expired',
        status: 'verified',
        airlineCode: 'UA',
        verifiedAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z'
      }, env)
      Date.now = () => 1_000_000 + (employeeVerificationCookieMaxAgeSeconds + 1) * 1000
      assert.equal(employeeVerificationCookieIsValid(cookie, env), false)
    } finally {
      Date.now = originalNow
    }
  })

  it('keeps verification cookie payload minimal', () => {
    const cookie = makeEmployeeVerificationCookieValue({
      userId: 'user:minimal',
      status: 'verified',
      airlineCode: 'DL',
      verifiedAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T01:00:00.000Z'
    }, env)
    const parsed = readEmployeeVerificationCookie(cookie, env)
    assert.deepEqual(Object.keys(parsed || {}).sort(), ['airline', 'exp', 'iat', 'status', 'sub', 'ver'])
    assert.doesNotMatch(Buffer.from(cookie.split('.')[0], 'base64url').toString('utf8'), /email|evidence|reviewer|note|workEmailHash/i)
  })

  it('allows operator/admin independently of traveler verification', () => {
    assert.equal(
      verificationAccessDecision({ pathname: '/', operatorToken: 'operator-token-for-tests', env }).reason,
      'operator'
    )
    assert.equal(
      internalRouteAccessDecision({ pathname: '/operator', operatorToken: 'operator-token-for-tests', env }).authorized,
      true
    )
  })

  it('keeps public verification/account routes available', () => {
    ;['/verify', '/onboarding', '/profile', '/membership', '/billing', '/beta-feedback', '/api/employee-verification'].forEach((pathname) => {
      assert.equal(verificationAccessDecision({ pathname, env }).protected, false, pathname)
    })
  })

  it('covers direct URL and API entry in the proxy matcher', () => {
    const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
    ;[
      "'/'",
      "'/results/:path*'",
      "'/api/search/:path*'",
      "'/api/load-requests/:path*'",
      "'/api/employee-verification/:path*'"
    ].forEach((matcher) => {
      if (matcher.includes('employee-verification')) {
        assert.doesNotMatch(proxy, new RegExp(matcher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      } else {
        assert.match(proxy, new RegExp(matcher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      }
    })
  })

  it('does not expose verification tokens or public privileged variables in client source', () => {
    const verifyPage = readFileSync(new URL('../app/verify/page.tsx', import.meta.url), 'utf8')
    const navigation = readFileSync(new URL('../app/AppNavigation.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(verifyPage, /NONREVY_VERIFICATION_COOKIE_SECRET|NONREVY_OPERATOR_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/)
    assert.doesNotMatch(navigation, /NONREVY_VERIFICATION_COOKIE_SECRET|NONREVY_OPERATOR_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/)
    assert.match(navigation, /unverifiedNavItems/)
  })
})
