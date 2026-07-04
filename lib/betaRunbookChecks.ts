export type BetaRunbookCheckStatus = 'pass' | 'warn' | 'fail'
export type BetaRunbookCheckCategory = 'environment' | 'provider' | 'persistence' | 'alert-safety'

export type BetaRunbookEnv = Record<string, string | undefined>

export type BetaRunbookCheck = {
  key: string
  category: BetaRunbookCheckCategory
  label: string
  status: BetaRunbookCheckStatus
  detail: string
  nextAction: string
}

function present(env: BetaRunbookEnv, name: string) {
  return Boolean(env[name]?.trim())
}

function status(ok: boolean, required = true): BetaRunbookCheckStatus {
  if (ok) return 'pass'
  return required ? 'fail' : 'warn'
}

function check(key: string, category: BetaRunbookCheckCategory, label: string, state: BetaRunbookCheckStatus, detail: string, nextAction: string): BetaRunbookCheck {
  return { key, category, label, status: state, detail, nextAction }
}

export function betaRunbookChecks(env: BetaRunbookEnv = process.env): BetaRunbookCheck[] {
  const hasSupabaseUrl = present(env, 'SUPABASE_URL') || present(env, 'NEXT_PUBLIC_SUPABASE_URL')
  const hasSupabaseAnon = present(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const hasServiceRole = present(env, 'SUPABASE_SERVICE_ROLE_KEY')
  const providerStorageEnabled = env.NONREVY_STORE_PROVIDER_RESULTS === 'true'
  const personalTestingMode = env.NONREVY_TEST_DATA_MODE === 'true'
  const publicServiceRoleLeak = present(env, 'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY') || present(env, 'NEXT_PUBLIC_SERVICE_ROLE_KEY')

  return [
    check(
      'supabase-public-client',
      'environment',
      'Supabase public client environment',
      status(hasSupabaseUrl && hasSupabaseAnon),
      hasSupabaseUrl && hasSupabaseAnon ? 'Browser-safe Supabase URL and anon key are configured.' : 'Supabase public client variables are incomplete.',
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before beta browser persistence checks.'
    ),
    check(
      'flightaware-provider-key',
      'provider',
      'FlightAware provider credential',
      status(present(env, 'FLIGHTAWARE_API_KEY')),
      present(env, 'FLIGHTAWARE_API_KEY') ? 'FlightAware key is present server-side.' : 'FlightAware key is missing, so primary live schedule checks will fall back or fail safely.',
      'Set FLIGHTAWARE_API_KEY server-side or document live schedule unavailability before a beta session.'
    ),
    check(
      'aviationstack-provider-key',
      'provider',
      'Aviationstack fallback credential',
      status(present(env, 'AVIATIONSTACK_API_KEY'), false),
      present(env, 'AVIATIONSTACK_API_KEY') ? 'Aviationstack fallback key is present server-side.' : 'Aviationstack fallback key is missing; this is acceptable only if FlightAware coverage is ready.',
      'Set AVIATIONSTACK_API_KEY if fallback flight search is part of the beta scenario.'
    ),
    check(
      'supabase-service-persistence',
      'persistence',
      'Supabase service-role persistence',
      status(hasSupabaseUrl && hasServiceRole, false),
      hasSupabaseUrl && hasServiceRole ? 'Server-side Supabase persistence can be checked.' : 'Account, watchlist, alert, and provider-result persistence may remain in local fallback mode.',
      'Set SUPABASE_SERVICE_ROLE_KEY server-side only and apply the documented SQL migrations before cross-device persistence tests.'
    ),
    check(
      'provider-result-storage',
      'persistence',
      'Provider result storage safety',
      providerStorageEnabled && !hasServiceRole ? 'fail' : 'pass',
      providerStorageEnabled ? 'Provider result storage is enabled.' : 'Provider result storage is disabled; provider-result writes should no-op safely.',
      providerStorageEnabled && !hasServiceRole ? 'Disable NONREVY_STORE_PROVIDER_RESULTS or add SUPABASE_SERVICE_ROLE_KEY server-side before testing storage.' : 'No action needed unless provider-result storage is intentionally being tested.'
    ),
    check(
      'alert-notification-safety',
      'alert-safety',
      'Alert notification safety',
      publicServiceRoleLeak ? 'fail' : 'pass',
      publicServiceRoleLeak ? 'A service-role-like variable is exposed with a NEXT_PUBLIC prefix.' : 'No service-role-like public environment variable was detected.',
      publicServiceRoleLeak ? 'Remove public service-role variables immediately; browser alert flows must never receive server secrets.' : 'Keep alert copy source-aware and verify generated alerts do not expose raw provider errors or secrets.'
    ),
    check(
      'personal-testing-mode',
      'alert-safety',
      'Personal testing mode',
      personalTestingMode ? 'warn' : 'pass',
      personalTestingMode ? 'Personal Testing Mode is enabled; nearest-date/stored rows must remain visibly labeled.' : 'Personal Testing Mode is not enabled.',
      personalTestingMode ? 'Disable NONREVY_TEST_DATA_MODE for production-like private beta sessions unless explicitly testing fallback labels.' : 'No action needed.'
    )
  ]
}

export function betaRunbookCheckSummary(checks: BetaRunbookCheck[]) {
  return checks.reduce<Record<BetaRunbookCheckStatus, number>>((counts, item) => {
    counts[item.status] += 1
    return counts
  }, { pass: 0, warn: 0, fail: 0 })
}
