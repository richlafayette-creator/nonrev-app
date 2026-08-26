import { createHmac, timingSafeEqual } from 'node:crypto'
import type { EmployeeVerificationRecord } from './employeeVerification'
import { operatorTokenIsAuthorized } from './internalRouteAccess'

export const employeeVerificationCookieName = 'nonrevy_employee_verified'
export const employeeVerificationAccountCookieName = 'nonrevy_account_binding'
export const employeeVerificationCookieMaxAgeSeconds = 30 * 60
export const employeeVerificationAccountCookieMaxAgeSeconds = 7 * 86400

type VerificationCookiePayload = {
  sub: string
  status: 'verified'
  airline: string
  ver: string
  iat: number
  exp: number
}

type AccountBindingCookiePayload = {
  sub: string
  iat: number
  exp: number
}

export type VerificationAccessDecision = {
  protected: boolean
  authorized: boolean
  api: boolean
  redirectTo: string
  reason: 'public' | 'verified' | 'operator' | 'missing-verification'
}

export const verificationProtectedPagePrefixes = [
  '/saved-searches',
  '/watchlist',
  '/my-requests',
  '/preferences',
  '/plan',
  '/flights',
  '/alerts'
]

export const verificationProtectedApiPrefixes = [
  '/api/saved-searches',
  '/api/watchlist',
  '/api/load-requests',
  '/api/community-loads',
  '/api/outcomes',
  '/api/alerts'
]

export const verificationPublicPagePrefixes = [
  '/verify',
  '/onboarding',
  '/profile',
  '/membership',
  '/billing',
  '/credits',
  '/beta-feedback',
  '/account',
  '/login',
  '/offline',
  '/referrals',
  '/manifest.webmanifest'
]

export const verificationPublicApiPrefixes = [
  '/api/employee-verification',
  '/api/beta-feedback'
]

function pathMatchesPrefix(pathname: string, prefix: string) {
  if (prefix === '/') return pathname === '/'
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function anyPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathMatchesPrefix(pathname, prefix))
}

function cookieSecret(env: Record<string, string | undefined> = process.env) {
  return (env.NONREVY_VERIFICATION_COOKIE_SECRET || '').trim()
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function constantTimeEqual(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  } catch {
    return false
  }
}

function signedCookieValue(payload: object, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signPayload(encoded, secret)}`
}

function readSignedCookiePayload<T>(cookieValue: string | null | undefined, env: Record<string, string | undefined> = process.env): T | null {
  const secret = cookieSecret(env)
  if (!secret) return null
  const value = (cookieValue || '').trim()
  if (!value || !value.includes('.')) return null
  const [payload, signature] = value.split('.', 2)
  if (!payload || !signature) return null
  if (!constantTimeEqual(signPayload(payload, secret), signature)) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

export function makeEmployeeVerificationCookieValue(record: Pick<EmployeeVerificationRecord, 'userId' | 'status' | 'airlineCode' | 'verifiedAt' | 'updatedAt'>, env: Record<string, string | undefined> = process.env) {
  if (record.status !== 'verified') return ''
  const secret = cookieSecret(env)
  if (!secret) return ''
  const verifiedAt = record.verifiedAt || new Date().toISOString()
  const issuedAt = Date.now()
  const expiresAt = issuedAt + employeeVerificationCookieMaxAgeSeconds * 1000
  const payload: VerificationCookiePayload = {
    sub: record.userId,
    status: record.status,
    airline: record.airlineCode,
    ver: record.updatedAt || verifiedAt,
    iat: issuedAt,
    exp: expiresAt
  }
  return signedCookieValue(payload, secret)
}

export function makeEmployeeVerificationAccountCookieValue(userId: string, env: Record<string, string | undefined> = process.env) {
  const secret = cookieSecret(env)
  if (!secret || !userId) return ''
  const issuedAt = Date.now()
  return signedCookieValue({
    sub: userId,
    iat: issuedAt,
    exp: issuedAt + employeeVerificationAccountCookieMaxAgeSeconds * 1000
  } satisfies AccountBindingCookiePayload, secret)
}

export function readEmployeeVerificationCookie(cookieValue: string | null | undefined, env: Record<string, string | undefined> = process.env) {
  const parsed = readSignedCookiePayload<VerificationCookiePayload>(cookieValue, env)
  if (!parsed || parsed.status !== 'verified' || !parsed.sub || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return null
  return parsed
}

export function readEmployeeVerificationAccountCookie(cookieValue: string | null | undefined, env: Record<string, string | undefined> = process.env) {
  const parsed = readSignedCookiePayload<AccountBindingCookiePayload>(cookieValue, env)
  if (!parsed || !parsed.sub || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return null
  return parsed
}

export function employeeVerificationCookieIsValid(cookieValue: string | null | undefined, env: Record<string, string | undefined> = process.env) {
  return Boolean(readEmployeeVerificationCookie(cookieValue, env))
}

export function verificationAccessDecision(input: {
  pathname: string
  verifiedCookie?: string | null
  accountCookie?: string | null
  operatorToken?: string | null
  env?: Record<string, string | undefined>
}): VerificationAccessDecision {
  const pathname = input.pathname || '/'
  const api = anyPrefix(pathname, verificationProtectedApiPrefixes)
  const protectedPage = anyPrefix(pathname, verificationProtectedPagePrefixes)
  const publicPage = anyPrefix(pathname, verificationPublicPagePrefixes)
  const publicApi = anyPrefix(pathname, verificationPublicApiPrefixes)
  const isProtected = api || (protectedPage && !publicPage && !publicApi)

  if (!isProtected) {
    return { protected: false, authorized: true, api: false, redirectTo: pathname, reason: 'public' }
  }

  const env = input.env || process.env
  if (operatorTokenIsAuthorized(input.operatorToken, env)) {
    return { protected: true, authorized: true, api, redirectTo: pathname, reason: 'operator' }
  }
  const verifiedCookie = readEmployeeVerificationCookie(input.verifiedCookie, env)
  const accountCookie = readEmployeeVerificationAccountCookie(input.accountCookie, env)
  if (verifiedCookie && accountCookie && verifiedCookie.sub === accountCookie.sub) {
    return { protected: true, authorized: true, api, redirectTo: pathname, reason: 'verified' }
  }

  return { protected: true, authorized: false, api, redirectTo: `/verify?next=${encodeURIComponent(pathname)}`, reason: 'missing-verification' }
}
