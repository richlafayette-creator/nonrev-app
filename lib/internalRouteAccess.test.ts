import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  internalRouteAccessDecision,
  internalRoutePolicies,
  operatorAccessCookieName,
  operatorAccessHeaderName,
  operatorTokenIsAuthorized,
  policyForPath,
  travelerAccessibleRoutes
} from './internalRouteAccess'

const proxySource = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
const navigationSource = readFileSync(new URL('../app/AppNavigation.tsx', import.meta.url), 'utf8')

const env = {
  NONREVY_OPERATOR_ACCESS_TOKEN: 'operator-test-token',
  NONREVY_ADMIN_ACCESS_TOKEN: undefined
}

describe('internal route access policy', () => {
  it('redirects ordinary travelers away from direct internal page URLs', () => {
    ;[
      '/diagnostics',
      '/operator',
      '/data-health',
      '/outcome-diagnostics',
      '/notification-diagnostics',
      '/notification-history',
      '/intelligence',
      '/historical-routes',
      '/outcomes',
      '/load-reports',
      '/reputation',
      '/reminders',
      '/opportunities',
      '/dashboard',
      '/best-routes',
      '/requests'
    ].forEach((pathname) => {
      const decision = internalRouteAccessDecision({ pathname, env })
      assert.equal(decision.restricted, true, pathname)
      assert.equal(decision.authorized, false, pathname)
      assert.match(decision.redirectTo, /^\/(profile|my-requests)$/)
    })
  })

  it('blocks ordinary direct access to internal diagnostic APIs', () => {
    ;['/api/data-health', '/api/internal/provider-health'].forEach((pathname) => {
      const decision = internalRouteAccessDecision({ pathname, env })
      assert.equal(decision.restricted, true, pathname)
      assert.equal(decision.authorized, false, pathname)
      assert.equal(decision.policy?.api, true, pathname)
    })
  })

  it('keeps normal traveler pages accessible', () => {
    travelerAccessibleRoutes.forEach((pathname) => {
      const decision = internalRouteAccessDecision({ pathname, env })
      assert.equal(decision.restricted, false, pathname)
      assert.equal(decision.authorized, true, pathname)
    })
  })

  it('allows authorized operator access without making travelers authorized by default', () => {
    assert.equal(operatorTokenIsAuthorized('', env), false)
    assert.equal(operatorTokenIsAuthorized('wrong-token', env), false)
    assert.equal(operatorTokenIsAuthorized('operator-test-token', env), true)

    const ordinary = internalRouteAccessDecision({ pathname: '/operator', env })
    const operator = internalRouteAccessDecision({ pathname: '/operator', operatorToken: 'operator-test-token', env })
    assert.equal(ordinary.authorized, false)
    assert.equal(operator.restricted, true)
    assert.equal(operator.authorized, true)
  })

  it('keeps route policy centralized for future account states', () => {
    assert.ok(internalRoutePolicies.length >= 18)
    assert.equal(policyForPath('/operator/scope')?.classification, 'operator-admin-only')
    assert.equal(policyForPath('/notification-diagnostics/run')?.classification, 'internal-diagnostics')
    assert.equal(policyForPath('/best-routes')?.classification, 'obsolete-redundant')
  })

  it('configures Next proxy matchers for direct URL entry', () => {
    ;[
      "'/diagnostics/:path*'",
      "'/operator/:path*'",
      "'/data-health/:path*'",
      "'/outcome-diagnostics/:path*'",
      "'/notification-diagnostics/:path*'",
      "'/api/data-health/:path*'",
      "'/api/internal/:path*'"
    ].forEach((matcher) => {
      assert.match(proxySource, new RegExp(matcher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    })
    assert.match(proxySource, /NextResponse\.redirect/)
    assert.match(proxySource, /NextResponse\.json/)
  })

  it('does not expose internal routes in normal traveler navigation', () => {
    ;[
      "'/agent'",
      "'/operator'",
      "'/diagnostics'",
      "'/data-health'",
      "'/outcome-diagnostics'",
      "'/notification-diagnostics'",
      "'/requests'"
    ].forEach((route) => {
      assert.doesNotMatch(navigationSource, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    })
  })

  it('does not render privileged token values or secret names into traveler-facing policy output', () => {
    const denied = internalRouteAccessDecision({ pathname: '/diagnostics', operatorToken: 'operator-test-token', env })
    assert.equal(JSON.stringify(denied).includes('operator-test-token'), false)
    assert.equal(JSON.stringify(denied).includes('NONREVY_OPERATOR_ACCESS_TOKEN'), false)
    assert.equal(operatorAccessCookieName, 'nonrevy_operator_access')
    assert.equal(operatorAccessHeaderName, 'x-nonrevy-operator-token')
  })
})
