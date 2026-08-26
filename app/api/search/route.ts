import { NextResponse } from 'next/server'
import { employeeVerificationAccountCookieName, employeeVerificationCookieName, verificationAccessDecision } from '../../../lib/employeeVerificationAccess'
import { operatorAccessCookieName, operatorAccessHeaderName } from '../../../lib/internalRouteAccess'
import { redactSearchResponseForPublicPreview } from '../../../lib/publicSearchPreview'
import { executeSearchApiAsync } from '../../../lib/searchResponse'
import { readSearchRequestBody } from '../../../lib/searchRequest'

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('cookie') || ''
  return cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(`${name}=`.length) || ''
}

function fullMemberAccess(request: Request) {
  const decision = verificationAccessDecision({
    pathname: '/api/load-requests',
    operatorToken: request.headers.get(operatorAccessHeaderName) || cookieValue(request, operatorAccessCookieName),
    accountCookie: cookieValue(request, employeeVerificationAccountCookieName),
    verifiedCookie: cookieValue(request, employeeVerificationCookieName),
    env: {
      NONREVY_VERIFICATION_COOKIE_SECRET: process.env.NONREVY_VERIFICATION_COOKIE_SECRET,
      NONREVY_OPERATOR_ACCESS_TOKEN: process.env.NONREVY_OPERATOR_ACCESS_TOKEN,
      NONREVY_ADMIN_ACCESS_TOKEN: process.env.NONREVY_ADMIN_ACCESS_TOKEN
    }
  })
  return decision.authorized
}

export async function POST(request: Request) {
  const parsed = await readSearchRequestBody(request)
  if (!parsed.ok) {
    return NextResponse.json({
      error: parsed.message,
      code: parsed.code,
      status: parsed.status
    }, { status: parsed.status })
  }

  const response = await executeSearchApiAsync(parsed.body)
  if (response.status === 200 && !fullMemberAccess(request)) {
    return NextResponse.json(redactSearchResponseForPublicPreview(response.body), { status: response.status })
  }
  return NextResponse.json(response.body, { status: response.status })
}
