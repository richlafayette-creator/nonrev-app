import { NextResponse, type NextRequest } from 'next/server'
import {
  internalRouteAccessDecision,
  operatorAccessCookieName,
  operatorAccessHeaderName
} from './lib/internalRouteAccess'

export function proxy(request: NextRequest) {
  const operatorToken =
    request.headers.get(operatorAccessHeaderName) ||
    request.cookies.get(operatorAccessCookieName)?.value ||
    ''
  const decision = internalRouteAccessDecision({
    pathname: request.nextUrl.pathname,
    operatorToken,
    env: {
      NONREVY_OPERATOR_ACCESS_TOKEN: process.env.NONREVY_OPERATOR_ACCESS_TOKEN,
      NONREVY_ADMIN_ACCESS_TOKEN: process.env.NONREVY_ADMIN_ACCESS_TOKEN
    }
  })

  if (!decision.restricted || decision.authorized) return NextResponse.next()

  if (decision.policy?.api) {
    return NextResponse.json(
      { error: 'Not available for this account.' },
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    )
  }

  const destination = new URL(decision.redirectTo, request.url)
  return NextResponse.redirect(destination, {
    status: 307,
    headers: {
      'Cache-Control': 'no-store'
    }
  })
}

export const config = {
  matcher: [
    '/agent/:path*',
    '/operator/:path*',
    '/diagnostics/:path*',
    '/data-health/:path*',
    '/outcome-diagnostics/:path*',
    '/notification-diagnostics/:path*',
    '/notification-history/:path*',
    '/notification-preferences/:path*',
    '/notifications/:path*',
    '/intelligence/:path*',
    '/historical-routes/:path*',
    '/outcomes/:path*',
    '/load-reports/:path*',
    '/reputation/:path*',
    '/reminders/:path*',
    '/opportunities/:path*',
    '/dashboard/:path*',
    '/best-routes/:path*',
    '/requests/:path*',
    '/api/data-health/:path*',
    '/api/internal/:path*'
  ]
}
