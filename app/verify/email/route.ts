import { NextResponse } from 'next/server'
import { verifyEmailMagicLink } from '../../../lib/employeeEmailVerification'
import {
  employeeVerificationAccountCookieName,
  employeeVerificationAccountCookieMaxAgeSeconds,
  employeeVerificationCookieMaxAgeSeconds,
  employeeVerificationCookieName,
  makeEmployeeVerificationAccountCookieValue,
  makeEmployeeVerificationCookieValue,
  readEmployeeVerificationAccountCookie
} from '../../../lib/employeeVerificationAccess'

export const dynamic = 'force-dynamic'

function secureCookie(request: Request) {
  return process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:'
}

function redirectWithStatus(request: Request, status: string) {
  return NextResponse.redirect(new URL(`/verify?email=${encodeURIComponent(status)}`, request.url), {
    status: 303,
    headers: { 'Cache-Control': 'no-store' }
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const challengeId = url.searchParams.get('challenge') || ''
  const token = url.searchParams.get('token') || ''
  const accountCookie = request.headers.get('cookie')
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${employeeVerificationAccountCookieName}=`))
    ?.slice(`${employeeVerificationAccountCookieName}=`.length)
  const account = readEmployeeVerificationAccountCookie(accountCookie)

  if (!account?.sub || !challengeId || !token) return redirectWithStatus(request, 'invalid')

  const verified = await verifyEmailMagicLink({
    userId: account.sub,
    challengeId,
    token
  })
  if (!verified.ok) {
    return redirectWithStatus(request, verified.error.toLowerCase().includes('expired') ? 'expired' : 'invalid')
  }
  if (!verified.verification) {
    return redirectWithStatus(request, 'invalid')
  }

  const response = redirectWithStatus(request, 'verified')
  const accountBinding = makeEmployeeVerificationAccountCookieValue(account.sub)
  if (accountBinding) {
    response.cookies.set(employeeVerificationAccountCookieName, accountBinding, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie(request),
      path: '/',
      maxAge: employeeVerificationAccountCookieMaxAgeSeconds
    })
  }
  const verifiedCookie = makeEmployeeVerificationCookieValue(verified.verification)
  if (verifiedCookie) {
    response.cookies.set(employeeVerificationCookieName, verifiedCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie(request),
      path: '/',
      maxAge: employeeVerificationCookieMaxAgeSeconds
    })
  }
  return response
}
