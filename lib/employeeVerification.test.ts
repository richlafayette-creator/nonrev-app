import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  airlineEmployers,
  airlineOptionsForSelect,
  companyEmailDomainAllowed,
  createPendingCompanyEmailVerification,
  createPendingManualVerification,
  searchAirlineEmployers,
  verificationMethodsForAirline,
  reviewEmployeeVerification
} from './employeeVerification'
import {
  emailVerificationCodeAttemptLimit,
  getEmailVerificationChallenge,
  startEmailVerificationChallenge,
  verifyEmailChallengeCode,
  verifyEmailMagicLink,
  type EmailVerificationPublicChallenge
} from './employeeEmailVerification'
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
  NONREVY_EMAIL_VERIFICATION_SECRET: 'email-verification-secret-for-tests',
  NONREVY_PUBLIC_APP_URL: 'https://beta.nonrevy.test',
  NONREVY_OPERATOR_ACCESS_TOKEN: 'operator-token-for-tests',
  NONREVY_ADMIN_ACCESS_TOKEN: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined
}

function captureEmailProvider(capture: { code?: string; magicLinkUrl?: string; count?: number }, fail = false) {
  return {
    name: 'test-provider',
    async sendVerificationEmail(message: { code: string; magicLinkUrl: string }) {
      capture.code = message.code
      capture.magicLinkUrl = message.magicLinkUrl
      capture.count = (capture.count || 0) + 1
      if (fail) return { ok: false as const, provider: 'test-provider', reason: 'provider-error' as const, detail: 'Provider failed safely.' }
      return { ok: true as const, provider: 'test-provider', messageId: `message-${capture.count}` }
    }
  }
}

function magicLinkParts(value: string) {
  const url = new URL(value)
  return {
    challengeId: url.searchParams.get('challenge') || '',
    token: url.searchParams.get('token') || ''
  }
}

describe('employee verification access', () => {
  it('validates company email domains without relying only on user-entered airline names', () => {
    assert.ok(airlineEmployers.some((airline) => airline.code === 'UA' && airline.domains.includes('united.com')))
    assert.equal(companyEmailDomainAllowed('UA', 'tester@united.com').allowed, true)
    assert.equal(companyEmailDomainAllowed('UA', 'tester@example.com').allowed, false)
    assert.equal(companyEmailDomainAllowed('United Airlines', 'tester@united.com').allowed, true)
  })

  it('supports a searchable employing-airline catalog including regional airlines', () => {
    assert.equal(searchAirlineEmployers('SkyWest')[0]?.code, 'OO')
    assert.equal(searchAirlineEmployers('SkyWest Airlines')[0]?.code, 'OO')
    assert.equal(searchAirlineEmployers('OO')[0]?.name, 'SkyWest Airlines')
    assert.equal(searchAirlineEmployers('SKW')[0]?.name, 'SkyWest Airlines')
    assert.ok(airlineOptionsForSelect().length > 40)
  })

  it('does not reject selectable airlines just because a company-email domain is not mapped', () => {
    assert.deepEqual(verificationMethodsForAirline('OO'), ['manual_review'])
    assert.equal(companyEmailDomainAllowed('OO', 'tester@skywest.example').allowed, false)
    assert.equal(companyEmailDomainAllowed('OO', 'tester@skywest.example').reason, 'no-approved-domain')
    const manual = createPendingManualVerification({ userId: 'user:skywest', airlineCode: 'SkyWest' })
    assert.equal(manual.ok, true)
    if (!manual.ok) return
    assert.equal(manual.record.airlineCode, 'OO')
    assert.equal(manual.record.airlineName, 'SkyWest Airlines')
    const email = createPendingCompanyEmailVerification({ userId: 'user:skywest', airlineCode: 'OO', workEmail: 'tester@skywest.example' })
    assert.equal(email.ok, false)
    if (email.ok) return
    assert.match(email.error, /manual review/i)
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

  it('starts a code and magic-link challenge for a recognized airline/domain', async () => {
    const capture: { code?: string; magicLinkUrl?: string; count?: number } = {}
    const started = await startEmailVerificationChallenge({
      userId: 'user:email-start',
      airlineCode: 'UA',
      workEmail: 'Tester@United.com',
      env,
      provider: captureEmailProvider(capture)
    })
    assert.equal(started.ok, true)
    if (!started.ok) return
    assert.equal(started.verification.status, 'pending')
    assert.equal(started.verification.airlineCode, 'UA')
    assert.equal(started.challenge.emailDomain, 'united.com')
    assert.match(capture.code || '', /^\d{6}$/)
    assert.match(capture.magicLinkUrl || '', /^https:\/\/beta\.nonrevy\.test\/verify\/email\?/)
    assert.doesNotMatch(JSON.stringify(started), /Tester@United\.com|magicTokenHash|codeHmac|RESEND_API_KEY/i)
  })

  it('does not auto-verify unknown or mismatched company email domains', async () => {
    const unknown = await startEmailVerificationChallenge({
      userId: 'user:unknown-domain',
      airlineCode: 'OO',
      workEmail: 'tester@skywest.example',
      env,
      provider: captureEmailProvider({})
    })
    assert.equal(unknown.ok, false)
    if (!unknown.ok) assert.match(unknown.error, /manual review/i)

    const mismatch = await startEmailVerificationChallenge({
      userId: 'user:mismatch-domain',
      airlineCode: 'UA',
      workEmail: 'tester@delta.com',
      env,
      provider: captureEmailProvider({})
    })
    assert.equal(mismatch.ok, false)
    if (!mismatch.ok) assert.match(mismatch.error, /manual review|selected airline/i)
  })

  it('verifies a correct six-digit code and grants protected access', async () => {
    const capture: { code?: string; magicLinkUrl?: string; count?: number } = {}
    const started = await startEmailVerificationChallenge({
      userId: 'user:code-success',
      airlineCode: 'AA',
      workEmail: 'person@aa.com',
      env,
      provider: captureEmailProvider(capture)
    })
    assert.equal(started.ok, true)
    if (!started.ok) return
    const verified = await verifyEmailChallengeCode({
      userId: 'user:code-success',
      challengeId: started.challenge.challengeId,
      code: capture.code || '',
      env
    })
    assert.equal(verified.ok, true)
    if (!verified.ok) return
    assert.equal(verified.verification?.status, 'verified')
    assert.equal(verified.verification?.reviewSource, 'company_email_challenge')
    const verifiedCookie = makeEmployeeVerificationCookieValue(verified.verification!, env)
    const accountCookie = makeEmployeeVerificationAccountCookieValue('user:code-success', env)
    assert.equal(verificationAccessDecision({ pathname: '/results', verifiedCookie, accountCookie, env }).authorized, true)
  })

  it('rejects incorrect, expired, and reused code challenges', async () => {
    const capture: { code?: string; magicLinkUrl?: string; count?: number } = {}
    const started = await startEmailVerificationChallenge({
      userId: 'user:code-failures',
      airlineCode: 'UA',
      workEmail: 'person@united.com',
      env,
      provider: captureEmailProvider(capture)
    })
    assert.equal(started.ok, true)
    if (!started.ok) return
    const wrong = await verifyEmailChallengeCode({
      userId: 'user:code-failures',
      challengeId: started.challenge.challengeId,
      code: '000000',
      env
    })
    assert.equal(wrong.ok, false)

    const originalNow = Date.now
    try {
      Date.now = () => originalNow() + 20 * 60 * 1000
      const expired = await startEmailVerificationChallenge({
        userId: 'user:code-expired',
        airlineCode: 'UA',
        workEmail: 'expired@united.com',
        env,
        provider: captureEmailProvider(capture)
      })
      assert.equal(expired.ok, true)
      if (!expired.ok) return
      Date.now = () => originalNow() + 40 * 60 * 1000
      const expiredResult = await verifyEmailChallengeCode({
        userId: 'user:code-expired',
        challengeId: expired.challenge.challengeId,
        code: capture.code || '',
        env
      })
      assert.equal(expiredResult.ok, false)
      if (!expiredResult.ok) assert.match(expiredResult.error, /expired/i)
    } finally {
      Date.now = originalNow
    }

    const successCapture: { code?: string; magicLinkUrl?: string; count?: number } = {}
    const oneUse = await startEmailVerificationChallenge({
      userId: 'user:code-reuse',
      airlineCode: 'UA',
      workEmail: 'reuse@united.com',
      env,
      provider: captureEmailProvider(successCapture)
    })
    assert.equal(oneUse.ok, true)
    if (!oneUse.ok) return
    assert.equal((await verifyEmailChallengeCode({ userId: 'user:code-reuse', challengeId: oneUse.challenge.challengeId, code: successCapture.code || '', env })).ok, true)
    assert.equal((await verifyEmailChallengeCode({ userId: 'user:code-reuse', challengeId: oneUse.challenge.challengeId, code: successCapture.code || '', env })).ok, false)
  })

  it('locks a code challenge after too many failed attempts', async () => {
    const capture: { code?: string; magicLinkUrl?: string; count?: number } = {}
    const started = await startEmailVerificationChallenge({
      userId: 'user:code-lock',
      airlineCode: 'UA',
      workEmail: 'lock@united.com',
      env,
      provider: captureEmailProvider(capture)
    })
    assert.equal(started.ok, true)
    if (!started.ok) return
    let last: Awaited<ReturnType<typeof verifyEmailChallengeCode>> | null = null
    for (let index = 0; index < emailVerificationCodeAttemptLimit; index += 1) {
      last = await verifyEmailChallengeCode({
        userId: 'user:code-lock',
        challengeId: started.challenge.challengeId,
        code: '111111',
        env
      })
    }
    assert.equal(last?.ok, false)
    if (last && !last.ok) assert.equal(last.status, 429)
  })

  it('verifies a magic link and rejects reused, expired, or copied challenges', async () => {
    const capture: { code?: string; magicLinkUrl?: string; count?: number } = {}
    const started = await startEmailVerificationChallenge({
      userId: 'user:magic-success',
      airlineCode: 'DL',
      workEmail: 'person@delta.com',
      env,
      provider: captureEmailProvider(capture)
    })
    assert.equal(started.ok, true)
    if (!started.ok) return
    const link = magicLinkParts(capture.magicLinkUrl || '')
    const verified = await verifyEmailMagicLink({ userId: 'user:magic-success', challengeId: link.challengeId, token: link.token, env })
    assert.equal(verified.ok, true)
    assert.equal((await verifyEmailMagicLink({ userId: 'user:magic-success', challengeId: link.challengeId, token: link.token, env })).ok, false)

    const copiedCapture: { code?: string; magicLinkUrl?: string; count?: number } = {}
    const copied = await startEmailVerificationChallenge({
      userId: 'user:magic-a',
      airlineCode: 'UA',
      workEmail: 'a@united.com',
      env,
      provider: captureEmailProvider(copiedCapture)
    })
    assert.equal(copied.ok, true)
    if (!copied.ok) return
    const copiedLink = magicLinkParts(copiedCapture.magicLinkUrl || '')
    assert.equal((await verifyEmailMagicLink({ userId: 'user:magic-b', challengeId: copiedLink.challengeId, token: copiedLink.token, env })).ok, false)

    const originalNow = Date.now
    try {
      const expiredCapture: { code?: string; magicLinkUrl?: string; count?: number } = {}
      const expired = await startEmailVerificationChallenge({
        userId: 'user:magic-expired',
        airlineCode: 'UA',
        workEmail: 'magic-expired@united.com',
        env,
        provider: captureEmailProvider(expiredCapture)
      })
      assert.equal(expired.ok, true)
      if (!expired.ok) return
      const expiredLink = magicLinkParts(expiredCapture.magicLinkUrl || '')
      Date.now = () => originalNow() + 20 * 60 * 1000
      const expiredResult = await verifyEmailMagicLink({ userId: 'user:magic-expired', challengeId: expiredLink.challengeId, token: expiredLink.token, env })
      assert.equal(expiredResult.ok, false)
      if (!expiredResult.ok) assert.match(expiredResult.error, /expired/i)
    } finally {
      Date.now = originalNow
    }
  })

  it('keeps provider failure and missing email secret fail-closed without verification', async () => {
    const providerFailure = await startEmailVerificationChallenge({
      userId: 'user:provider-failure',
      airlineCode: 'UA',
      workEmail: 'failure@united.com',
      env,
      provider: captureEmailProvider({}, true)
    })
    assert.equal(providerFailure.ok, false)
    if (!providerFailure.ok) {
      assert.match(providerFailure.error, /failed/i)
      assert.notEqual(providerFailure.verification?.status, 'verified')
    }

    const missingSecret = await startEmailVerificationChallenge({
      userId: 'user:missing-email-secret',
      airlineCode: 'UA',
      workEmail: 'missing@united.com',
      env: { ...env, NONREVY_EMAIL_VERIFICATION_SECRET: undefined },
      provider: captureEmailProvider({})
    })
    assert.equal(missingSecret.ok, false)
    if (!missingSecret.ok) assert.match(missingSecret.error, /not configured/i)
  })

  it('does not expose raw code, token, email, or hashes in public challenge responses', async () => {
    const capture: { code?: string; magicLinkUrl?: string; count?: number } = {}
    const started = await startEmailVerificationChallenge({
      userId: 'user:no-secret-output',
      airlineCode: 'UA',
      workEmail: 'secret-output@united.com',
      env,
      provider: captureEmailProvider(capture)
    })
    assert.equal(started.ok, true)
    if (!started.ok) return
    const publicPayload = JSON.stringify({ challenge: started.challenge })
    assert.doesNotMatch(publicPayload, /secret-output@united\.com/i)
    assert.doesNotMatch(publicPayload, new RegExp(capture.code || 'unmatchable'))
    assert.doesNotMatch(publicPayload, /magicTokenHash|codeHmac|workEmailHash/)
    assert.doesNotMatch(publicPayload, /token=/)
    const loaded = await getEmailVerificationChallenge((started.challenge as EmailVerificationPublicChallenge).challengeId)
    assert.equal(loaded.data?.status, 'pending')
    assert.notEqual(loaded.data?.magicTokenHash, '')
    assert.notEqual(loaded.data?.codeHmac, '')
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

  it('allows public preview surfaces while denying unverified travelers from protected member routes', () => {
    assert.deepEqual(
      verificationAccessDecision({ pathname: '/', env }).authorized,
      true
    )
    assert.deepEqual(
      verificationAccessDecision({ pathname: '/results', env }).protected,
      true
    )
    assert.deepEqual(
      verificationAccessDecision({ pathname: '/api/search', env }).protected,
      true
    )
    assert.equal(
      verificationAccessDecision({ pathname: '/api/load-requests', env }).api,
      true
    )
    assert.equal(
      verificationAccessDecision({ pathname: '/api/load-requests', env }).authorized,
      false
    )
    assert.equal(
      verificationAccessDecision({ pathname: '/watchlist', env }).redirectTo,
      '/verify?next=%2Fwatchlist'
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
    assert.equal(verificationAccessDecision({ pathname: '/api/load-requests', verifiedCookie: cookie, accountCookie, env }).authorized, true)
    assert.equal(verificationAccessDecision({ pathname: '/api/load-requests', verifiedCookie: cookie, env }).authorized, false)
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
    assert.equal(verificationAccessDecision({ pathname: '/api/load-requests', verifiedCookie: userACookie, accountCookie: userBBinding, env }).authorized, false)
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
      verificationAccessDecision({ pathname: '/api/load-requests', operatorToken: 'operator-token-for-tests', env }).reason,
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

  it('uses value-first verification copy and searchable airline selection', () => {
    const verifyPage = readFileSync(new URL('../app/verify/page.tsx', import.meta.url), 'utf8')
    const homePage = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
    const conversationalHome = readFileSync(new URL('../app/ConversationalTripWorkspace.tsx', import.meta.url), 'utf8')
    assert.match(verifyPage, /Unlock Nonrevy traveler features/)
    assert.match(verifyPage, /list="nonrevy-airline-employers"/)
    assert.match(verifyPage, /Company-email verification is not mapped/)
    assert.match(homePage, /Find the non-rev route most likely to get you there/)
    assert.match(conversationalHome, /Find the non-rev route most likely to get you there/)
    assert.match(homePage, /Search your trip/)
    assert.match(conversationalHome, /Search your trip - Compare your chances - Know your backups/)
  })
})
