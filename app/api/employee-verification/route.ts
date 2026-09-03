import { NextResponse } from 'next/server'
import { persistentUserId } from '../../../lib/apiIdentity'
import {
  resendEmailVerificationChallenge,
  startEmailVerificationChallenge,
  verifyEmailChallengeCode
} from '../../../lib/employeeEmailVerification'
import {
  airlineOptionsForSelect,
  createPendingManualVerification,
  getEmployeeVerification,
  listPendingEmployeeVerifications,
  reviewEmployeeVerification,
  upsertEmployeeVerification,
  type EmployeeVerificationRecord
} from '../../../lib/employeeVerification'
import {
  employeeVerificationAccountCookieName,
  employeeVerificationAccountCookieMaxAgeSeconds,
  employeeVerificationCookieMaxAgeSeconds,
  employeeVerificationCookieName,
  makeEmployeeVerificationAccountCookieValue,
  makeEmployeeVerificationCookieValue
} from '../../../lib/employeeVerificationAccess'
import {
  operatorAccessCookieName,
  operatorAccessHeaderName,
  operatorTokenIsAuthorized
} from '../../../lib/internalRouteAccess'

export const dynamic = 'force-dynamic'

type VerificationBody = {
  action?: 'submit-company-email' | 'start-email-verification' | 'verify-code' | 'resend-email-verification' | 'request-manual-review' | 'approve' | 'reject' | 'request-resubmission'
  airlineCode?: string
  workEmail?: string
verificationConsent?: boolean
  challengeId?: string
  code?: string
  targetUserId?: string
  reasonCategory?: string
}

function operatorToken(request: Request, body?: VerificationBody) {
  const cookie = request.headers.get('cookie') || ''
  const cookieToken = cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${operatorAccessCookieName}=`))
    ?.slice(`${operatorAccessCookieName}=`.length)
  return request.headers.get(operatorAccessHeaderName) || cookieToken || ''
}

function operatorAuthorized(request: Request, body?: VerificationBody) {
  return operatorTokenIsAuthorized(operatorToken(request, body), {
    NONREVY_OPERATOR_ACCESS_TOKEN: process.env.NONREVY_OPERATOR_ACCESS_TOKEN,
    NONREVY_ADMIN_ACCESS_TOKEN: process.env.NONREVY_ADMIN_ACCESS_TOKEN
  })
}

function publicRecord(record: EmployeeVerificationRecord | null) {
  if (!record) {
    return {
      status: 'unverified',
      airlineCode: '',
      airlineName: '',
      method: '',
      submittedAt: '',
      verifiedAt: '',
      reasonCategory: ''
    }
  }
  return {
    status: record.status,
    airlineCode: record.airlineCode,
    airlineName: record.airlineName,
    method: record.method,
    emailDomain: record.emailDomain,
    submittedAt: record.submittedAt,
    verifiedAt: record.verifiedAt || '',
    expiresAt: record.expiresAt || '',
    reasonCategory: record.reasonCategory || ''
  }
}

function secureCookie(request: Request) {
  return process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:'
}

function responseWithVerificationCookie(request: Request, payload: Record<string, unknown>, record: EmployeeVerificationRecord | null, userId: string, status = 200) {
  const response = NextResponse.json(payload, { status })
  const accountBinding = makeEmployeeVerificationAccountCookieValue(userId)
  if (accountBinding) {
    response.cookies.set(employeeVerificationAccountCookieName, accountBinding, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie(request),
      path: '/',
      maxAge: employeeVerificationAccountCookieMaxAgeSeconds
    })
  }
  if (record?.status === 'verified') {
    const value = makeEmployeeVerificationCookieValue(record)
    if (value) {
      response.cookies.set(employeeVerificationCookieName, value, {
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookie(request),
        path: '/',
        maxAge: employeeVerificationCookieMaxAgeSeconds
      })
    }
  } else {
    response.cookies.set(employeeVerificationCookieName, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie(request),
      path: '/',
      maxAge: 0
    })
  }
  return response
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const userId = persistentUserId(request)
  const isOperator = operatorAuthorized(request)

  if (url.searchParams.get('scope') === 'pending') {
    if (!isOperator) return NextResponse.json({ error: 'Not available for this account.' }, { status: 404 })
    const result = await listPendingEmployeeVerifications(Number(url.searchParams.get('limit') || 100))
    return NextResponse.json({
      requests: result.data.map((record) => ({
        id: record.id,
        userId: record.userId,
        status: record.status,
        airlineCode: record.airlineCode,
        airlineName: record.airlineName,
        method: record.method,
        emailDomain: record.emailDomain,
        submittedAt: record.submittedAt,
        reasonCategory: record.reasonCategory || ''
      })),
      storageMode: result.storageMode,
      status: result.status,
      detail: result.detail
    })
  }

  const result = await getEmployeeVerification(userId)
  return responseWithVerificationCookie(request, {
    verification: publicRecord(result.data),
    airlines: airlineOptionsForSelect(),
    storageMode: result.storageMode,
    status: result.status,
    detail: result.detail,
    disclosure: 'Verification confirms airline affiliation for Nonrevy access only. ZED eligibility remains separate and must be reviewed independently.'
  }, result.data, userId)
}

export async function POST(request: Request) {
  let body: VerificationBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const userId = persistentUserId(request)
  const accountRequiredActions = new Set<string>([
    'submit-company-email',
    'start-email-verification',
    'verify-code',
    'resend-email-verification',
    'request-manual-review'
  ])
  if (body.action && accountRequiredActions.has(body.action) && !userId.startsWith("user:")) {
    return NextResponse.json({ error: 'Sign in is required before airline verification.' }, { status: 401 })
  }

  if (body.action === 'submit-company-email' || body.action === 'start-email-verification') {
if (body.verificationConsent !== true) {
      return NextResponse.json(
        { error: 'Confirm that you control this work email before continuing.' },
        { status: 400 }
      )
    }
    const started = await startEmailVerificationChallenge({
      userId,
      airlineCode: String(body.airlineCode || ''),
      workEmail: String(body.workEmail || '')
    })
    if (!started.ok) {
      return responseWithVerificationCookie(request, {
        error: started.error,
        verification: started.verification ? publicRecord(started.verification) : undefined,
        challenge: started.challenge,
        emailSent: false,
        manualReviewAvailable: true
      }, started.verification || null, userId, started.status)
    }
    return responseWithVerificationCookie(request, {
      verification: publicRecord(started.verification),
      challenge: started.challenge,
      emailSent: true,
      detail: 'We sent a verification email to your work address. Enter the six-digit code here or use the secure link in the email.'
    }, started.verification, userId, 202)
  }

  if (body.action === 'verify-code') {
    const verified = await verifyEmailChallengeCode({
      userId,
      challengeId: String(body.challengeId || ''),
      code: String(body.code || '')
    })
    if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status })
    return responseWithVerificationCookie(request, {
      verification: publicRecord(verified.verification),
      detail: 'Your airline employment has been verified.'
    }, verified.verification, userId)
  }

  if (body.action === 'resend-email-verification') {
    const resent = await resendEmailVerificationChallenge({
      userId,
      challengeId: String(body.challengeId || ''),
      workEmail: String(body.workEmail || '')
    })
    if (!resent.ok) return NextResponse.json({ error: resent.error, challenge: resent.challenge }, { status: resent.status })
    return NextResponse.json({
      challenge: resent.challenge,
      emailSent: true,
      detail: 'We sent a new verification email to your work address.'
    }, { status: 202 })
  }

  if (body.action === 'request-manual-review') {
    const pending = createPendingManualVerification({
      userId,
      airlineCode: String(body.airlineCode || ''),
      reasonCategory: body.reasonCategory || 'cannot-use-work-email'
    })
    if (!pending.ok) return NextResponse.json({ error: pending.error }, { status: 400 })
    const result = await upsertEmployeeVerification(pending.record)
    return responseWithVerificationCookie(request, {
      verification: publicRecord(result.data),
      storageMode: result.storageMode,
      status: result.status,
      detail: 'Manual review requested. Do not upload identity documents here; an operator will request the least sensitive proof needed.'
    }, result.data, userId, 202)
  }

  if (body.action === 'approve' || body.action === 'reject' || body.action === 'request-resubmission') {
    if (!operatorAuthorized(request, body)) return NextResponse.json({ error: 'Not available for this account.' }, { status: 404 })
    const targetUserId = String(body.targetUserId || '')
    if (!targetUserId) return NextResponse.json({ error: 'Target user is required.' }, { status: 400 })
    const existing = (await getEmployeeVerification(targetUserId)).data
    const reviewed = reviewEmployeeVerification({
      existing,
      targetUserId,
      airlineCode: body.airlineCode,
      status: body.action === 'approve' ? 'verified' : body.action === 'reject' ? 'rejected' : 'reverify_required',
      reviewerId: persistentUserId(request),
      reasonCategory: body.reasonCategory
    })
    if (!reviewed.ok) return NextResponse.json({ error: reviewed.error }, { status: 400 })
    const result = await upsertEmployeeVerification(reviewed.record)
    return NextResponse.json({
      verification: publicRecord(result.data),
      storageMode: result.storageMode,
      status: result.status,
      detail: body.action === 'approve' ? 'Verification approved.' : body.action === 'reject' ? 'Verification rejected.' : 'Resubmission requested.'
    })
  }

  return NextResponse.json({ error: 'Unsupported verification action.' }, { status: 400 })
}
