export type InternalRouteClassification =
  | 'traveler-facing'
  | 'operator-admin-only'
  | 'internal-diagnostics'
  | 'obsolete-redundant'
  | 'beta-safe-informational'
  | 'redirect-for-travelers'

export type InternalRoutePolicy = {
  prefix: string
  classification: InternalRouteClassification
  reason: string
  redirectTo: string
  api?: boolean
}

export type InternalRouteAccessInput = {
  pathname: string
  operatorToken?: string | null
  env?: Record<string, string | undefined>
}

export type InternalRouteAccessDecision = {
  restricted: boolean
  authorized: boolean
  policy: InternalRoutePolicy | null
  redirectTo: string
}

export const operatorAccessCookieName = 'nonrevy_operator_access'
export const operatorAccessHeaderName = 'x-nonrevy-operator-token'

export const internalRoutePolicies: InternalRoutePolicy[] = [
  { prefix: '/agent', classification: 'operator-admin-only', reason: 'automation and production readiness dashboard', redirectTo: '/profile' },
  { prefix: '/operator', classification: 'operator-admin-only', reason: 'private beta operator dashboard', redirectTo: '/profile' },
  { prefix: '/diagnostics', classification: 'internal-diagnostics', reason: 'runtime, provider, and feature-flag diagnostics', redirectTo: '/profile' },
  { prefix: '/data-health', classification: 'internal-diagnostics', reason: 'data-health and provider readiness diagnostics', redirectTo: '/profile' },
  { prefix: '/outcome-diagnostics', classification: 'internal-diagnostics', reason: 'outcome persistence diagnostics', redirectTo: '/profile' },
  { prefix: '/notification-diagnostics', classification: 'internal-diagnostics', reason: 'notification delivery diagnostics', redirectTo: '/profile' },
  { prefix: '/notification-history', classification: 'internal-diagnostics', reason: 'raw notification delivery history', redirectTo: '/profile' },
  { prefix: '/notification-preferences', classification: 'redirect-for-travelers', reason: 'notification controls still expose delivery diagnostics', redirectTo: '/profile' },
  { prefix: '/notifications', classification: 'redirect-for-travelers', reason: 'notification center still exposes diagnostic/provider scaffolds', redirectTo: '/profile' },
  { prefix: '/intelligence', classification: 'internal-diagnostics', reason: 'route intelligence diagnostics', redirectTo: '/profile' },
  { prefix: '/historical-routes', classification: 'obsolete-redundant', reason: 'historical route database scaffold', redirectTo: '/profile' },
  { prefix: '/outcomes', classification: 'redirect-for-travelers', reason: 'outcome dashboard still exposes persistence diagnostics', redirectTo: '/profile' },
  { prefix: '/load-reports', classification: 'redirect-for-travelers', reason: 'community load verification scaffold', redirectTo: '/profile' },
  { prefix: '/reputation', classification: 'redirect-for-travelers', reason: 'trust/reputation scaffold', redirectTo: '/profile' },
  { prefix: '/reminders', classification: 'redirect-for-travelers', reason: 'outcome reminder engine scaffold', redirectTo: '/profile' },
  { prefix: '/opportunities', classification: 'obsolete-redundant', reason: 'opportunity intelligence scaffold', redirectTo: '/profile' },
  { prefix: '/dashboard', classification: 'obsolete-redundant', reason: 'redundant dashboard with internal/local status copy', redirectTo: '/profile' },
  { prefix: '/best-routes', classification: 'obsolete-redundant', reason: 'static route intelligence scaffold', redirectTo: '/profile' },
  { prefix: '/requests', classification: 'operator-admin-only', reason: 'open responder request board, not traveler My Requests', redirectTo: '/my-requests' },
  { prefix: '/api/data-health', classification: 'internal-diagnostics', reason: 'server data-health diagnostics API', redirectTo: '/profile', api: true },
  { prefix: '/api/internal', classification: 'internal-diagnostics', reason: 'server internal diagnostics API namespace', redirectTo: '/profile', api: true }
]

export const travelerAccessibleRoutes = [
  '/',
  '/account',
  '/beta-feedback',
  '/billing',
  '/credits',
  '/login',
  '/membership',
  '/my-requests',
  '/offline',
  '/onboarding',
  '/plan',
  '/preferences',
  '/profile',
  '/referrals',
  '/results',
  '/saved-searches',
  '/watchlist'
]

function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function policyForPath(pathname: string) {
  return internalRoutePolicies.find((policy) => pathMatchesPrefix(pathname, policy.prefix)) || null
}

function tokenValue(input: string | null | undefined) {
  return (input || '').trim()
}

function constantTimeStringEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

export function expectedOperatorTokens(env: Record<string, string | undefined> = process.env) {
  return [
    tokenValue(env.NONREVY_OPERATOR_ACCESS_TOKEN),
    tokenValue(env.NONREVY_ADMIN_ACCESS_TOKEN)
  ].filter(Boolean)
}

export function operatorTokenIsAuthorized(
  operatorToken: string | null | undefined,
  env: Record<string, string | undefined> = process.env
) {
  const provided = tokenValue(operatorToken)
  if (!provided) return false
  return expectedOperatorTokens(env).some((expected) => constantTimeStringEqual(provided, expected))
}

export function internalRouteAccessDecision(input: InternalRouteAccessInput): InternalRouteAccessDecision {
  const policy = policyForPath(input.pathname)
  if (!policy) {
    return { restricted: false, authorized: true, policy: null, redirectTo: input.pathname || '/' }
  }

  const authorized = operatorTokenIsAuthorized(input.operatorToken, input.env)
  return {
    restricted: true,
    authorized,
    policy,
    redirectTo: policy.redirectTo
  }
}
