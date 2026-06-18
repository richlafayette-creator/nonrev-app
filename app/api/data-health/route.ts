import { NextResponse } from 'next/server'
import { getLiveScheduleProviderReadiness, type LiveScheduleProviderKey, type ScheduleProviderReadiness } from '../../../lib/liveScheduleProviders'
import { persistentBetaFeedbackTableName, persistentSavedSearchesTableName, persistentTripOutcomesTableName } from '../../../lib/accountBetaStore'
import { providerResultTableName } from '../../../lib/providerResultRepository'

export const dynamic = 'force-dynamic'

type HealthStatus = 'Connected' | 'Missing' | 'Limited' | 'Error'
type ProviderReadinessRuntimeStatus = 'Configured' | 'Missing' | 'Limited'
type LiveReadinessStatus = 'Ready' | 'Limited' | 'Blocked'

type HealthItem = {
  key: string
  label: string
  status: HealthStatus
  lastChecked: string
  safeErrorMessage: string
  recommendedFix: string
  detail: string
}

type LiveItineraryReadinessItem = {
  key: string
  label: string
  status: LiveReadinessStatus
  detail: string
  recommendedNextAction: string
}

type LiveItineraryReadiness = {
  status: LiveReadinessStatus
  activeDataMode: 'production-safe' | 'test-data'
  testDataModeEnabled: boolean
  trueLiveAvailabilityMessage: string
  checklist: LiveItineraryReadinessItem[]
}

type ProviderSourceCoverage = {
  sourceProvider: string
  count: number
}

type ProviderPersistenceDiagnostics = {
  enabled: boolean
  status: 'disabled' | 'ready' | 'missing-config' | 'unreachable'
  tableReachable: boolean
  totalStoredRecords: number | null
  newestStoredProviderRecordTimestamp: string | null
  coverageBySourceProvider: ProviderSourceCoverage[]
  detail: string
  recommendedNextAction: string
}


type AccountPersistenceDiagnostics = {
  status: 'ready' | 'missing-config' | 'unreachable'
  storageMode: 'supabase' | 'local-fallback'
  missingEnvironmentVariables: string[]
  checkedTables: Array<{ table: string; reachable: boolean; recordCount: number | null; detail: string }>
  detail: string
  recommendedNextAction: string
}

type RouteFreshnessProbeDiagnostics = {
  status: 'ready' | 'warning' | 'blocked'
  probes: Array<{ key: string; status: 'ready' | 'warning' | 'blocked'; detail: string }>
  detail: string
  recommendedNextAction: string
}

type ProviderReadinessMatrixRow = {
  provider: string
  status: 'Ready' | 'Warning' | 'Missing'
  missingEnvironmentVariables: string[]
  fallbackBehavior: string
  rateLimits: string
}

const timeoutMs = 5000

function checkedAt() {
  return new Date().toISOString()
}

function item(input: Omit<HealthItem, 'lastChecked'>): HealthItem {
  return { ...input, lastChecked: checkedAt() }
}

function testDataModeEnabled() {
  return process.env.NONREVY_TEST_DATA_MODE === 'true'
}

function providerResultPersistenceEnabled() {
  return process.env.NONREVY_STORE_PROVIDER_RESULTS === 'true'
}

function safeMessage(value: unknown) {
  if (!value) return ''
  const raw = typeof value === 'string' ? value : value instanceof Error ? value.message : 'Request failed'
  return raw
    .replace(/access_key=[^&\s]+/gi, 'access_key=[hidden]')
    .replace(/apikey[=:]\s*[^&\s]+/gi, 'apikey=[hidden]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [hidden]')
    .replace(/x-apikey[=:]\s*[^&\s]+/gi, 'x-apikey=[hidden]')
    .slice(0, 180)
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    const text = await response.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    return { response, data }
  } finally {
    clearTimeout(timeout)
  }
}

function providerResultSupabaseConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  }
}

function parseExactCount(response: Response, fallback = 0) {
  const contentRange = response.headers.get('content-range')
  const total = contentRange?.split('/').at(-1)
  if (!total || total === '*') return fallback
  const parsed = Number(total)
  return Number.isFinite(parsed) ? parsed : fallback
}

function providerResultHeaders(serviceRoleKey: string, extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra
  }
}

async function providerPersistenceDiagnostics(): Promise<ProviderPersistenceDiagnostics> {
  const enabled = providerResultPersistenceEnabled()
  const { supabaseUrl, serviceRoleKey } = providerResultSupabaseConfig()

  if (!enabled && (!supabaseUrl || !serviceRoleKey)) {
    return {
      enabled,
      status: 'disabled',
      tableReachable: false,
      totalStoredRecords: null,
      newestStoredProviderRecordTimestamp: null,
      coverageBySourceProvider: [],
      detail: 'Provider result persistence is disabled because NONREVY_STORE_PROVIDER_RESULTS is not set to true. No Supabase provider result query was attempted because server-side Supabase persistence credentials are not configured.',
      recommendedNextAction: 'No action needed unless storage should be enabled. To enable it later, set NONREVY_STORE_PROVIDER_RESULTS=true server-side, keep SUPABASE_SERVICE_ROLE_KEY server-only, and apply docs/provider-results-table.sql manually.'
    }
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      enabled,
      status: 'missing-config',
      tableReachable: false,
      totalStoredRecords: null,
      newestStoredProviderRecordTimestamp: null,
      coverageBySourceProvider: [],
      detail: enabled
        ? 'Provider result persistence is enabled, but server-side Supabase URL or service-role key configuration is missing. Writes and diagnostics will use local/no-op fallback.'
        : 'Provider result persistence is disabled because NONREVY_STORE_PROVIDER_RESULTS is not set to true, and provider result table reachability cannot be checked without server-side Supabase credentials.',
      recommendedNextAction: enabled
        ? 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY server-side, then apply docs/provider-results-table.sql manually.'
        : 'No action needed unless storage should be enabled.'
    }
  }

  const baseUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${providerResultTableName}`

  try {
    const countResult = await fetchJsonWithTimeout(`${baseUrl}?select=id`, {
      method: 'GET',
      headers: providerResultHeaders(serviceRoleKey, {
        Prefer: 'count=exact',
        Range: '0-0'
      })
    })

    if (!countResult.response.ok) {
      const message = typeof countResult.data === 'object' && countResult.data && 'message' in countResult.data
        ? String(countResult.data.message)
        : `Supabase returned ${countResult.response.status}`
      return {
        enabled,
        status: 'unreachable',
        tableReachable: false,
        totalStoredRecords: null,
        newestStoredProviderRecordTimestamp: null,
        coverageBySourceProvider: [],
        detail: `Provider results table ${providerResultTableName} is unreachable or rejected the diagnostics query. ${safeMessage(message)}`,
        recommendedNextAction: 'Apply docs/provider-results-table.sql manually and verify service-role REST access. Existing itinerary functionality remains unaffected.'
      }
    }

    const totalStoredRecords = parseExactCount(countResult.response, Array.isArray(countResult.data) ? countResult.data.length : 0)

    const newestResult = await fetchJsonWithTimeout(`${baseUrl}?select=source_checked_at,created_at&order=source_checked_at.desc.nullslast&limit=1`, {
      headers: providerResultHeaders(serviceRoleKey)
    })

    if (!newestResult.response.ok) {
      return {
        enabled,
        status: 'unreachable',
        tableReachable: false,
        totalStoredRecords,
        newestStoredProviderRecordTimestamp: null,
        coverageBySourceProvider: [],
        detail: `Provider results table ${providerResultTableName} responded to count but rejected newest-record diagnostics (${newestResult.response.status}).`,
        recommendedNextAction: 'Verify provider result table columns match docs/provider-results-table.sql.'
      }
    }

    const newestRows = Array.isArray(newestResult.data)
      ? newestResult.data as Array<{ source_checked_at?: string; created_at?: string }>
      : []
    const newestStoredProviderRecordTimestamp = newestRows[0]?.source_checked_at || newestRows[0]?.created_at || null

    const coverageResult = await fetchJsonWithTimeout(`${baseUrl}?select=source_provider&limit=10000`, {
      headers: providerResultHeaders(serviceRoleKey)
    })

    if (!coverageResult.response.ok) {
      return {
        enabled,
        status: 'unreachable',
        tableReachable: false,
        totalStoredRecords,
        newestStoredProviderRecordTimestamp,
        coverageBySourceProvider: [],
        detail: `Provider results table ${providerResultTableName} responded to count but rejected source-provider coverage diagnostics (${coverageResult.response.status}).`,
        recommendedNextAction: 'Verify provider result table columns match docs/provider-results-table.sql.'
      }
    }

    const coverageRows = Array.isArray(coverageResult.data)
      ? coverageResult.data as Array<{ source_provider?: string | null }>
      : []
    const coverageMap = new Map<string, number>()
    for (const row of coverageRows) {
      const sourceProvider = row.source_provider?.trim() || 'Not provided'
      coverageMap.set(sourceProvider, (coverageMap.get(sourceProvider) || 0) + 1)
    }

    return {
      enabled,
      status: enabled ? 'ready' : 'disabled',
      tableReachable: true,
      totalStoredRecords,
      newestStoredProviderRecordTimestamp,
      coverageBySourceProvider: [...coverageMap.entries()]
        .map(([sourceProvider, count]) => ({ sourceProvider, count }))
        .sort((left, right) => right.count - left.count || left.sourceProvider.localeCompare(right.sourceProvider)),
      detail: enabled
        ? `Provider result persistence is enabled and ${providerResultTableName} is reachable for server-side diagnostics.`
        : `Provider result persistence is disabled because NONREVY_STORE_PROVIDER_RESULTS is not set to true. ${providerResultTableName} is reachable, but FlightAware schedule results will not be stored until the flag is enabled.`,
      recommendedNextAction: enabled
        ? 'Monitor stored record counts and source-provider coverage after FlightAware schedule searches.'
        : 'No action needed unless storage should be enabled; set NONREVY_STORE_PROVIDER_RESULTS=true server-side when ready.'
    }
  } catch (error) {
    return {
      enabled,
      status: 'unreachable',
      tableReachable: false,
      totalStoredRecords: null,
      newestStoredProviderRecordTimestamp: null,
      coverageBySourceProvider: [],
      detail: `Provider results diagnostics could not complete. ${safeMessage(error)}`,
      recommendedNextAction: 'Check Supabase REST access and apply docs/provider-results-table.sql manually if the table is missing. Existing itinerary functionality remains unaffected.'
    }
  }
}

function checkProviderResultPersistence(): HealthItem {
  const enabled = providerResultPersistenceEnabled()
  const hasSupabaseUrl = Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (!enabled) {
    return item({
      key: 'provider-result-persistence',
      label: 'Provider result persistence',
      status: 'Limited',
      safeErrorMessage: '',
      recommendedFix: 'No action needed unless provider result storage should be enabled; set NONREVY_STORE_PROVIDER_RESULTS=true server-side when ready.',
      detail: `Persistence is off/no-op by default. FlightAware schedule results will not be written to ${providerResultTableName}.`
    })
  }

  if (!hasSupabaseUrl || !hasServiceRoleKey) {
    return item({
      key: 'provider-result-persistence',
      label: 'Provider result persistence',
      status: 'Missing',
      safeErrorMessage: 'NONREVY_STORE_PROVIDER_RESULTS=true is enabled, but server-only Supabase URL or service-role key configuration is missing.',
      recommendedFix: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY server-side, then manually apply docs/provider-results-table.sql when ready.',
      detail: `Persistence is enabled, but writes will use local/no-op fallback until ${providerResultTableName} can be reached with server credentials.`
    })
  }

  return item({
    key: 'provider-result-persistence',
    label: 'Provider result persistence',
    status: 'Connected',
    safeErrorMessage: '',
    recommendedFix: `Verify docs/provider-results-table.sql has been applied manually; the repository will fall back safely if ${providerResultTableName} is unavailable.`,
    detail: `NONREVY_STORE_PROVIDER_RESULTS=true is enabled. FlightAware schedule results can be written server-side to ${providerResultTableName}; service-role key values are not exposed.`
  })
}

async function checkSupabaseFlights(): Promise<HealthItem> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return item({
      key: 'supabase-flight-data',
      label: 'Supabase flight data',
      status: 'Missing',
      safeErrorMessage: 'Supabase URL or key is not configured.',
      recommendedFix: 'Set Supabase environment variables and seed the flights table.',
      detail: 'Primary flight data source is not configured.'
    })
  }

  try {
    const { response, data } = await fetchJsonWithTimeout(
      `${supabaseUrl}/rest/v1/flights?select=id&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    )

    if (!response.ok) {
      const message = typeof data === 'object' && data && 'message' in data ? String(data.message) : `Supabase returned ${response.status}`
      return item({
        key: 'supabase-flight-data',
        label: 'Supabase flight data',
        status: 'Limited',
        safeErrorMessage: safeMessage(message),
        recommendedFix: 'Verify Supabase credentials, REST access, and flights table permissions.',
        detail: 'Flights table probe failed.'
      })
    }

    const count = Array.isArray(data) ? data.length : 0
    return item({
      key: 'supabase-flight-data',
      label: 'Supabase flight data',
      status: count > 0 ? 'Connected' : 'Limited',
      safeErrorMessage: '',
      recommendedFix: count > 0 ? 'No action needed.' : 'Seed or sync recent flight rows so planner results are available.',
      detail: count > 0 ? 'Flights table responded with data.' : 'Flights table responded, but no flight rows were returned.'
    })
  } catch (error) {
    return item({
      key: 'supabase-flight-data',
      label: 'Supabase flight data',
      status: 'Limited',
      safeErrorMessage: safeMessage(error),
      recommendedFix: 'Check network access, Supabase URL, and service availability.',
      detail: 'Supabase health check could not complete; stored/local fallback paths remain active.'
    })
  }
}

function isoDateOnly(value?: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return value.slice(0, 10)
  return parsed.toISOString().slice(0, 10)
}

function daysBetween(left?: string, right?: string) {
  if (!left || !right) return Infinity
  const leftTime = Date.parse(`${left.slice(0, 10)}T00:00:00.000Z`)
  const rightTime = Date.parse(`${right.slice(0, 10)}T00:00:00.000Z`)
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Infinity
  return Math.round((leftTime - rightTime) / 86400000)
}

async function checkSupabaseFlightFreshness(): Promise<HealthItem> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return item({
      key: 'supabase-flight-data-freshness',
      label: 'Supabase flight data freshness',
      status: 'Missing',
      safeErrorMessage: 'Supabase URL or key is not configured.',
      recommendedFix: 'Set Supabase environment variables before checking stored flight data freshness.',
      detail: 'Stored flight data freshness could not be checked.'
    })
  }

  try {
    const { response, data } = await fetchJsonWithTimeout(
      `${supabaseUrl}/rest/v1/flights?select=flight_date,source_checked_at&order=flight_date.desc.nullslast&limit=25`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    )

    if (!response.ok) {
      const message = typeof data === 'object' && data && 'message' in data ? String(data.message) : `Supabase returned ${response.status}`
      return item({
        key: 'supabase-flight-data-freshness',
        label: 'Supabase flight data freshness',
        status: 'Limited',
        safeErrorMessage: safeMessage(message),
        recommendedFix: 'Verify the flights table exposes flight_date and source_checked_at columns.',
        detail: 'Stored flight data freshness probe failed.'
      })
    }

    const rows = Array.isArray(data) ? data as Array<{ flight_date?: string; source_checked_at?: string }> : []
    const latestFlightDate = rows.map((row) => isoDateOnly(row.flight_date)).filter(Boolean).sort().slice(-1)[0]
    const latestSourceCheck = rows.map((row) => row.source_checked_at).filter(Boolean).sort().slice(-1)[0]
    const today = new Date().toISOString().slice(0, 10)
    const daysUntilLatestFlight = daysBetween(latestFlightDate, today)
    const sourceCheckAgeDays = latestSourceCheck ? Math.abs(daysBetween(today, isoDateOnly(latestSourceCheck))) : Infinity
    const staleByFlightDate = Number.isFinite(daysUntilLatestFlight) && daysUntilLatestFlight < 0
    const staleBySourceCheck = Number.isFinite(sourceCheckAgeDays) && sourceCheckAgeDays > 7

    if (!rows.length || !latestFlightDate) {
      return item({
        key: 'supabase-flight-data-freshness',
        label: 'Supabase flight data freshness',
        status: 'Limited',
        safeErrorMessage: 'No flight_date values were found in stored Supabase rows.',
        recommendedFix: 'Sync current or future provider schedule rows into Supabase before relying on stored data.',
        detail: 'Stored flight data exists check may pass, but freshness could not be established.'
      })
    }

    if (staleByFlightDate || staleBySourceCheck) {
      return item({
        key: 'supabase-flight-data-freshness',
        label: 'Supabase flight data freshness',
        status: 'Limited',
        safeErrorMessage: staleByFlightDate ? `Latest stored flight date is ${latestFlightDate}, before today ${today}.` : `Latest source check is older than 7 days.`,
        recommendedFix: 'Refresh stored flight rows from live provider APIs or keep them clearly marked as stored historical/testing data.',
        detail: `Latest flight date ${latestFlightDate}; latest source check ${latestSourceCheck || 'not recorded'}. Stale stored data must not be shown as production availability.`
      })
    }

    return item({
      key: 'supabase-flight-data-freshness',
      label: 'Supabase flight data freshness',
      status: 'Connected',
      safeErrorMessage: '',
      recommendedFix: 'No action needed.',
      detail: `Latest stored flight date ${latestFlightDate}; latest source check ${latestSourceCheck || 'not recorded'}.`
    })
  } catch (error) {
    return item({
      key: 'supabase-flight-data-freshness',
      label: 'Supabase flight data freshness',
      status: 'Limited',
      safeErrorMessage: safeMessage(error),
      recommendedFix: 'Check network access, Supabase URL, and flights table availability.',
      detail: 'Stored flight data freshness check could not complete; route cards keep source/date warning labels.'
    })
  }
}

async function checkAviationstack(): Promise<HealthItem> {
  const apiKey = process.env.AVIATIONSTACK_API_KEY
  if (!apiKey) {
    return item({
      key: 'aviationstack-fallback',
      label: 'Aviationstack fallback',
      status: 'Missing',
      safeErrorMessage: 'Aviationstack API key is not configured.',
      recommendedFix: 'Add AVIATIONSTACK_API_KEY to enable fallback flight search.',
      detail: 'Fallback search will be skipped until configured.'
    })
  }

  try {
    const params = new URLSearchParams({ access_key: apiKey, limit: '1' })
    const { response, data } = await fetchJsonWithTimeout(`https://api.aviationstack.com/v1/flights?${params.toString()}`)
    const apiError = typeof data === 'object' && data && 'error' in data ? data.error : null
    if (!response.ok || apiError) {
      const message = typeof apiError === 'object' && apiError && 'message' in apiError ? String(apiError.message) : `Aviationstack returned ${response.status}`
      return item({
        key: 'aviationstack-fallback',
        label: 'Aviationstack fallback',
        status: 'Limited',
        safeErrorMessage: safeMessage(message),
        recommendedFix: 'Verify Aviationstack plan status, quota, and API key configuration.',
        detail: 'Fallback provider probe returned an error.'
      })
    }

    return item({
      key: 'aviationstack-fallback',
      label: 'Aviationstack fallback',
      status: 'Connected',
      safeErrorMessage: '',
      recommendedFix: 'No action needed.',
      detail: 'Fallback provider is reachable.'
    })
  } catch (error) {
    return item({
      key: 'aviationstack-fallback',
      label: 'Aviationstack fallback',
      status: 'Limited',
      safeErrorMessage: safeMessage(error),
      recommendedFix: 'Check provider availability and outbound network access.',
      detail: 'Aviationstack health check could not complete.'
    })
  }
}

async function checkFlightAware(): Promise<HealthItem> {
  const apiKey = process.env.FLIGHTAWARE_API_KEY
  if (!apiKey) {
    return item({
      key: 'flightaware-enrichment',
      label: 'FlightAware enrichment',
      status: 'Missing',
      safeErrorMessage: 'FlightAware API key is not configured.',
      recommendedFix: 'Add FLIGHTAWARE_API_KEY to enable AeroAPI enrichment.',
      detail: 'Planner can still use base flight records without enrichment.'
    })
  }

  try {
    const { response, data } = await fetchJsonWithTimeout('https://aeroapi.flightaware.com/aeroapi/flights/UAL1?max_pages=1', {
      headers: { 'x-apikey': apiKey }
    })

    if (!response.ok) {
      const message = typeof data === 'object' && data && 'title' in data ? String(data.title) : `FlightAware returned ${response.status}`
      return item({
        key: 'flightaware-enrichment',
        label: 'FlightAware enrichment',
        status: 'Limited',
        safeErrorMessage: safeMessage(message),
        recommendedFix: 'Verify AeroAPI key, entitlement, quota, and billing status.',
        detail: 'FlightAware enrichment probe returned an error.'
      })
    }

    return item({
      key: 'flightaware-enrichment',
      label: 'FlightAware enrichment',
      status: 'Connected',
      safeErrorMessage: '',
      recommendedFix: 'No action needed.',
      detail: 'AeroAPI is reachable for enrichment requests.'
    })
  } catch (error) {
    return item({
      key: 'flightaware-enrichment',
      label: 'FlightAware enrichment',
      status: 'Limited',
      safeErrorMessage: safeMessage(error),
      recommendedFix: 'Check provider availability and outbound network access.',
      detail: 'FlightAware health check could not complete.'
    })
  }
}

function readinessStatusFromHealth(check: HealthItem): ProviderReadinessRuntimeStatus {
  if (check.status === 'Connected') return 'Configured'
  if (check.status === 'Missing') return 'Missing'
  return 'Limited'
}

function liveStatusFromHealth(check?: HealthItem, readyWhenConnected: LiveReadinessStatus = 'Ready'): LiveReadinessStatus {
  if (!check) return 'Blocked'
  if (check.status === 'Connected') return readyWhenConnected
  if (check.status === 'Limited') return 'Limited'
  return 'Blocked'
}

function buildLiveItineraryReadiness(checks: HealthItem[]): LiveItineraryReadiness {
  const isTestDataModeEnabled = testDataModeEnabled()
  const byKey = new Map(checks.map((check) => [check.key, check]))
  const supabase = byKey.get('supabase-flight-data')
  const freshness = byKey.get('supabase-flight-data-freshness')
  const aviationstack = byKey.get('aviationstack-fallback')
  const flightAware = byKey.get('flightaware-enrichment')
  const providerChecks = [aviationstack, flightAware].filter((check): check is HealthItem => Boolean(check))

  const flightAwareReady = flightAware?.status === 'Connected'
  const aviationstackReady = aviationstack?.status === 'Connected'
  const anyLiveProviderReady = flightAwareReady || aviationstackReady
  const anyProviderLimited = providerChecks.some((check) => check.status === 'Limited')
  const anyProviderReachable = providerChecks.some((check) => check.status === 'Connected' || check.status === 'Limited')

  const checklist: LiveItineraryReadinessItem[] = [
    {
      key: 'itinerary-data-mode-switch',
      label: 'Itinerary data mode switch',
      status: isTestDataModeEnabled ? 'Limited' : 'Ready',
      detail: isTestDataModeEnabled
        ? 'NONREVY_TEST_DATA_MODE=true is enabled. Nearest-date testing and demo fallback cards may appear for personal testing and are not production availability.'
        : 'NONREVY_TEST_DATA_MODE is missing or false. Production-safe mode blocks nearest-date testing matches and demo fallback availability cards.',
      recommendedNextAction: isTestDataModeEnabled
        ? 'Disable NONREVY_TEST_DATA_MODE before production checks or public demos that must show only true live/exact-date availability.'
        : 'No action needed for production-safe behavior; enable NONREVY_TEST_DATA_MODE=true only for personal testing.'
    },
    {
      key: 'supabase-live-schedule-feed',
      label: 'Supabase live schedule feed',
      status: supabase?.status === 'Connected' && freshness?.status === 'Connected' ? 'Limited' : liveStatusFromHealth(supabase, 'Limited'),
      detail: supabase?.status === 'Connected'
        ? 'Supabase is reachable for stored schedule rows. This supports cache/readback but is not live provider API availability by itself.'
        : supabase?.detail || 'Supabase schedule storage is unavailable.',
      recommendedNextAction: supabase?.status === 'Connected'
        ? 'Add a scheduled ingestion job from the selected live provider and keep stored rows labeled separately from live availability.'
        : supabase?.recommendedFix || 'Configure Supabase URL/key and flights table access before enabling live schedule ingestion.'
    },
    {
      key: 'aviationstack-future-schedule-capability',
      label: 'Aviationstack future schedule capability',
      status: liveStatusFromHealth(aviationstack),
      detail: aviationstack?.status === 'Connected'
        ? 'Aviationstack is reachable for fallback schedule search and can contribute date-scoped provider data when quota/plan allows.'
        : aviationstack?.detail || 'Aviationstack fallback schedule search is unavailable.',
      recommendedNextAction: aviationstack?.status === 'Connected'
        ? 'Verify the plan supports the required future-date schedule windows before treating Aviationstack as production coverage.'
        : aviationstack?.recommendedFix || 'Set AVIATIONSTACK_API_KEY or choose another future schedule provider.'
    },
    {
      key: 'flightaware-enrichment-capability',
      label: 'FlightAware enrichment capability',
      status: liveStatusFromHealth(flightAware),
      detail: flightAware?.status === 'Connected'
        ? 'FlightAware AeroAPI is reachable for operational enrichment and the app can keep it first for live itinerary schedule results.'
        : flightAware?.detail || 'FlightAware enrichment/live schedule capability is unavailable.',
      recommendedNextAction: flightAware?.status === 'Connected'
        ? 'Keep FlightAware first for live itinerary search; monitor AeroAPI quota and schedule endpoint responses.'
        : flightAware?.recommendedFix || 'Set FLIGHTAWARE_API_KEY and verify AeroAPI entitlements.'
    },
    {
      key: 'route-search-availability',
      label: 'Route search availability',
      status: anyLiveProviderReady ? 'Ready' : supabase?.status === 'Connected' ? 'Limited' : 'Blocked',
      detail: anyLiveProviderReady
        ? 'At least one live provider path is reachable for origin/destination itinerary search.'
        : supabase?.status === 'Connected'
          ? 'Only stored Supabase route rows are currently reachable; results may be historical, nearest-date testing, or demo fallback.'
          : 'No live route-search provider is reachable.',
      recommendedNextAction: anyLiveProviderReady
        ? 'No action needed beyond monitoring provider responses.'
        : 'Restore FlightAware or Aviationstack provider access before presenting route search as true live availability.'
    },
    {
      key: 'date-freshness-coverage',
      label: 'Date freshness coverage',
      status: anyLiveProviderReady ? 'Ready' : liveStatusFromHealth(freshness, 'Limited'),
      detail: anyLiveProviderReady
        ? 'Live provider access is available for requested-date checks; stored rows still remain labeled as stored data.'
        : freshness?.detail || 'Stored schedule freshness could not be verified.',
      recommendedNextAction: anyLiveProviderReady
        ? 'Keep card-level requested-date versus matched-date warnings enabled for stored and testing paths.'
        : freshness?.recommendedFix || 'Sync current/future schedule rows or restore live provider access before claiming requested-date availability.'
    },
    {
      key: 'provider-rate-limits',
      label: 'Provider rate limits',
      status: anyProviderLimited ? 'Limited' : anyProviderReachable ? 'Ready' : 'Blocked',
      detail: anyProviderLimited
        ? 'At least one live provider probe is limited, which may indicate quota, plan, entitlement, or rate-limit pressure.'
        : anyProviderReachable
          ? 'No live provider health probe is currently reporting rate-limit pressure.'
          : 'No live provider is reachable, so rate-limit health cannot be confirmed.',
      recommendedNextAction: anyProviderLimited
        ? 'Check provider dashboards for quota/rate-limit status and add backoff/caching before production traffic.'
        : anyProviderReachable
          ? 'No action needed; continue monitoring provider responses.'
          : 'Configure and verify at least one live provider before evaluating rate limits.'
    }
  ]

  const status: LiveReadinessStatus = checklist.some((entry) => entry.status === 'Blocked')
    ? 'Blocked'
    : checklist.some((entry) => entry.status === 'Limited')
      ? 'Limited'
      : 'Ready'

  return {
    status,
    activeDataMode: isTestDataModeEnabled ? 'test-data' : 'production-safe',
    testDataModeEnabled: isTestDataModeEnabled,
    trueLiveAvailabilityMessage: status === 'Ready'
      ? 'True live itinerary availability is ready for live provider-backed results. Stored, nearest-date testing, and demo fallback cards must still remain labeled separately.'
      : 'Current itinerary results are not guaranteed true live availability. Treat stored Supabase rows, nearest-date testing matches, and demo fallback cards as non-production availability until blocked checklist items are resolved.',
    checklist
  }
}

function providerReadinessFromChecks(checks: HealthItem[]): ScheduleProviderReadiness[] {
  const byKey = new Map(checks.map((check) => [check.key, check]))
  const overrides: Partial<Record<LiveScheduleProviderKey, { status: ProviderReadinessRuntimeStatus; detail: string; recommendedNextAction: string }>> = {}

  const supabase = byKey.get('supabase-flight-data')
  if (supabase) {
    overrides['supabase-schedule-ingestion'] = {
      status: readinessStatusFromHealth(supabase),
      detail: supabase.detail,
      recommendedNextAction: supabase.recommendedFix
    }
  }

  const aviationstack = byKey.get('aviationstack-fallback')
  if (aviationstack) {
    overrides.aviationstack = {
      status: readinessStatusFromHealth(aviationstack),
      detail: aviationstack.detail,
      recommendedNextAction: aviationstack.recommendedFix
    }
  }

  const flightAware = byKey.get('flightaware-enrichment')
  if (flightAware) {
    overrides.flightaware = {
      status: readinessStatusFromHealth(flightAware),
      detail: flightAware.detail,
      recommendedNextAction: flightAware.recommendedFix === 'No action needed.'
        ? 'Implement the FlightAware schedules adapter as the primary live itinerary provider path.'
        : flightAware.recommendedFix
    }
  }

  return getLiveScheduleProviderReadiness({ overrides })
}


function supabasePersistenceConfig() {
  const hasServerUrl = Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const missingEnvironmentVariables = [
    ...(!hasServerUrl ? ['SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL'] : []),
    ...(!hasAnonKey ? ['NEXT_PUBLIC_SUPABASE_ANON_KEY'] : []),
    ...(!hasServiceRoleKey ? ['SUPABASE_SERVICE_ROLE_KEY'] : [])
  ]
  return {
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    hasServerUrl,
    hasAnonKey,
    hasServiceRoleKey,
    missingEnvironmentVariables
  }
}

async function accountPersistenceDiagnostics(): Promise<AccountPersistenceDiagnostics> {
  const config = supabasePersistenceConfig()
  const tableNames = [persistentSavedSearchesTableName, persistentBetaFeedbackTableName, persistentTripOutcomesTableName]

  if (!config.hasServerUrl || !config.hasServiceRoleKey) {
    return {
      status: 'missing-config',
      storageMode: 'local-fallback',
      missingEnvironmentVariables: config.missingEnvironmentVariables,
      checkedTables: tableNames.map((table) => ({ table, reachable: false, recordCount: null, detail: 'Skipped because server-side Supabase service persistence is not configured.' })),
      detail: 'Account-backed beta persistence is not fully configured. Browser localStorage fallback remains active for saved searches, beta feedback, outcomes, watchlists, and alerts.',
      recommendedNextAction: 'Set SUPABASE_SERVICE_ROLE_KEY server-side and apply docs/account-beta-persistence.sql plus docs/persistent-watchlists-alerts.sql before private beta cross-device persistence checks.'
    }
  }

  const baseUrl = config.supabaseUrl.replace(/\/$/, '')
  const checkedTables: AccountPersistenceDiagnostics['checkedTables'] = []

  for (const table of tableNames) {
    try {
      const { response, data } = await fetchJsonWithTimeout(`${baseUrl}/rest/v1/${table}?select=id`, {
        headers: providerResultHeaders(config.serviceRoleKey, { Prefer: 'count=exact', Range: '0-0' })
      })
      if (!response.ok) {
        const message = typeof data === 'object' && data && 'message' in data ? String(data.message) : `Supabase returned ${response.status}`
        checkedTables.push({ table, reachable: false, recordCount: null, detail: safeMessage(message) })
        continue
      }
      checkedTables.push({ table, reachable: true, recordCount: parseExactCount(response, Array.isArray(data) ? data.length : 0), detail: 'Reachable with service-role REST diagnostics.' })
    } catch (error) {
      checkedTables.push({ table, reachable: false, recordCount: null, detail: safeMessage(error) })
    }
  }

  const allReachable = checkedTables.every((entry) => entry.reachable)
  return {
    status: allReachable ? 'ready' : 'unreachable',
    storageMode: allReachable ? 'supabase' : 'local-fallback',
    missingEnvironmentVariables: config.missingEnvironmentVariables,
    checkedTables,
    detail: allReachable
      ? 'Account-backed beta persistence tables are reachable with server-side service-role diagnostics.'
      : 'At least one account persistence table was unreachable. Client features keep localStorage fallback active.',
    recommendedNextAction: allReachable
      ? 'No action needed beyond private beta monitoring.'
      : 'Apply docs/account-beta-persistence.sql and verify service-role REST access for all account persistence tables.'
  }
}

function checkSupabaseAccountPersistence(accountPersistence: AccountPersistenceDiagnostics): HealthItem {
  if (accountPersistence.status === 'ready') {
    return item({
      key: 'supabase-account-persistence',
      label: 'Supabase account persistence',
      status: 'Connected',
      safeErrorMessage: '',
      recommendedFix: 'No action needed.',
      detail: accountPersistence.detail
    })
  }

  return item({
    key: 'supabase-account-persistence',
    label: 'Supabase account persistence',
    status: accountPersistence.status === 'missing-config' ? 'Missing' : 'Limited',
    safeErrorMessage: accountPersistence.missingEnvironmentVariables.length
      ? `Missing ${accountPersistence.missingEnvironmentVariables.join(', ')}.`
      : 'One or more Supabase account persistence tables could not be reached.',
    recommendedFix: accountPersistence.recommendedNextAction,
    detail: accountPersistence.detail
  })
}

function routeFreshnessProbeDiagnostics(checks: HealthItem[]): RouteFreshnessProbeDiagnostics {
  const byKey = new Map(checks.map((check) => [check.key, check]))
  const flightAware = byKey.get('flightaware-enrichment')
  const aviationstack = byKey.get('aviationstack-fallback')
  const freshness = byKey.get('supabase-flight-data-freshness')
  const anyLiveReady = flightAware?.status === 'Connected' || aviationstack?.status === 'Connected'
  const storedFreshnessReady = freshness?.status === 'Connected'
  const probes: RouteFreshnessProbeDiagnostics['probes'] = [
    {
      key: 'live-provider-requested-date-probe',
      status: anyLiveReady ? 'ready' : 'warning',
      detail: anyLiveReady
        ? 'At least one live provider is reachable for requested-date route freshness checks.'
        : 'No live provider is currently reachable; route freshness relies on stored-data labeling and local/demo-safe fallbacks.'
    },
    {
      key: 'stored-route-freshness-probe',
      status: storedFreshnessReady ? 'ready' : 'warning',
      detail: freshness?.detail || 'Stored route freshness could not be verified.'
    },
    {
      key: 'production-safe-fallback-probe',
      status: testDataModeEnabled() ? 'warning' : 'ready',
      detail: testDataModeEnabled()
        ? 'NONREVY_TEST_DATA_MODE=true is enabled, so nearest-date/demo fallback route cards may appear for testing.'
        : 'Production-safe mode is active; nearest-date/demo fallback route cards are blocked unless test mode is explicitly enabled.'
    }
  ]
  const hasBlocked = probes.some((probe) => probe.status === 'blocked')
  const hasWarning = probes.some((probe) => probe.status === 'warning')
  return {
    status: hasBlocked ? 'blocked' : hasWarning ? 'warning' : 'ready',
    probes,
    detail: hasWarning
      ? 'Route freshness probes are operational with warnings. Existing itinerary responses should continue showing source/date labels and fallback warnings.'
      : 'Route freshness probes are ready for live or exact-date/stored-data labeling.',
    recommendedNextAction: hasWarning
      ? 'Resolve live provider or stored freshness warnings before claiming private beta route results are fully live/current.'
      : 'No action needed beyond monitoring provider freshness labels.'
  }
}

function envMissing(names: string[]) {
  return names.filter((name) => !process.env[name] && !(name === 'SUPABASE_URL' && process.env.NEXT_PUBLIC_SUPABASE_URL))
}

function providerReadinessMatrix(checks: HealthItem[], accountPersistence: AccountPersistenceDiagnostics, routeFreshness: RouteFreshnessProbeDiagnostics): ProviderReadinessMatrixRow[] {
  const byKey = new Map(checks.map((check) => [check.key, check]))
  const statusFor = (check?: HealthItem): ProviderReadinessMatrixRow['status'] => check?.status === 'Connected' ? 'Ready' : check?.status === 'Missing' ? 'Missing' : 'Warning'
  return [
    {
      provider: 'FlightAware AeroAPI',
      status: statusFor(byKey.get('flightaware-enrichment')),
      missingEnvironmentVariables: envMissing(['FLIGHTAWARE_API_KEY']),
      fallbackBehavior: 'Planner skips FlightAware safely, then uses stored Supabase rows, Aviationstack fallback, and test/demo fallback only when enabled.',
      rateLimits: byKey.get('flightaware-enrichment')?.safeErrorMessage.toLowerCase().includes('rate limit') ? 'Warning from latest probe; check AeroAPI quota.' : 'Monitor AeroAPI quota/entitlements; 429 responses are treated as Limited warnings.'
    },
    {
      provider: 'AviationStack',
      status: statusFor(byKey.get('aviationstack-fallback')),
      missingEnvironmentVariables: envMissing(['AVIATIONSTACK_API_KEY']),
      fallbackBehavior: 'Fallback provider is skipped safely; planner continues with FlightAware, stored Supabase rows, and local/test-safe fallbacks.',
      rateLimits: byKey.get('aviationstack-fallback')?.safeErrorMessage.toLowerCase().includes('rate limit') ? 'Warning from latest probe; check AviationStack plan quota.' : 'Monitor AviationStack plan limits; quota/rate-limit responses are treated as Limited warnings.'
    },
    {
      provider: 'Mapbox',
      status: statusFor(byKey.get('mapbox-maps')),
      missingEnvironmentVariables: envMissing(['NEXT_PUBLIC_MAPBOX_TOKEN']),
      fallbackBehavior: 'Airport map cards render a placeholder/context card instead of failing the page.',
      rateLimits: byKey.get('mapbox-maps')?.safeErrorMessage.toLowerCase().includes('429') ? 'Warning from latest probe; check Mapbox quota.' : 'Monitor Mapbox account quota and URL restrictions; 429 responses are treated as Limited warnings.'
    },
    {
      provider: 'Supabase persistence',
      status: accountPersistence.status === 'ready' ? 'Ready' : accountPersistence.status === 'missing-config' ? 'Missing' : 'Warning',
      missingEnvironmentVariables: accountPersistence.missingEnvironmentVariables,
      fallbackBehavior: 'Saved searches, beta feedback, outcomes, watchlists, and alerts continue using browser localStorage/local fallback when server persistence is unavailable.',
      rateLimits: 'Supabase REST diagnostics are bounded to count/range probes; monitor project API limits during beta traffic.'
    },
    {
      provider: 'Route freshness probes',
      status: routeFreshness.status === 'ready' ? 'Ready' : routeFreshness.status === 'blocked' ? 'Missing' : 'Warning',
      missingEnvironmentVariables: [],
      fallbackBehavior: 'Cards retain requested-date/source warnings; production-safe mode blocks nearest-date/demo availability unless test mode is enabled.',
      rateLimits: 'Freshness probes reuse lightweight provider/Supabase diagnostics and do not add high-volume route search traffic.'
    }
  ]
}

async function checkMapbox(): Promise<HealthItem> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) {
    return item({
      key: 'mapbox-maps',
      label: 'Mapbox maps',
      status: 'Missing',
      safeErrorMessage: 'Mapbox public token is not configured.',
      recommendedFix: 'Set NEXT_PUBLIC_MAPBOX_TOKEN so airport maps can render.',
      detail: 'Map cards will show fallback airport context only.'
    })
  }

  try {
    const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s-airport+38bdf8(-118.4085,33.9416)/-118.4085,33.9416,9,0/200x120?access_token=${encodeURIComponent(token)}`
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    if (!response.ok) {
      return item({
        key: 'mapbox-maps',
        label: 'Mapbox maps',
        status: 'Limited',
        safeErrorMessage: `Mapbox returned ${response.status}.`,
        recommendedFix: 'Verify Mapbox token scopes, URL restrictions, and account quota.',
        detail: 'Static map probe returned an error.'
      })
    }

    return item({
      key: 'mapbox-maps',
      label: 'Mapbox maps',
      status: 'Connected',
      safeErrorMessage: '',
      recommendedFix: 'No action needed.',
      detail: 'Static map endpoint is reachable.'
    })
  } catch (error) {
    return item({
      key: 'mapbox-maps',
      label: 'Mapbox maps',
      status: 'Limited',
      safeErrorMessage: safeMessage(error),
      recommendedFix: 'Check Mapbox availability and outbound network access.',
      detail: 'Mapbox health check could not complete.'
    })
  }
}

export async function GET() {
  const [baseChecks, providerPersistence, accountPersistence] = await Promise.all([
    Promise.all([
      checkSupabaseFlights(),
      checkSupabaseFlightFreshness(),
      checkAviationstack(),
      checkFlightAware(),
      checkMapbox(),
      Promise.resolve(checkProviderResultPersistence())
    ]),
    providerPersistenceDiagnostics(),
    accountPersistenceDiagnostics()
  ])
  const checks = [...baseChecks, checkSupabaseAccountPersistence(accountPersistence)]
  const routeFreshnessProbes = routeFreshnessProbeDiagnostics(checks)

  return NextResponse.json({
    checkedAt: checkedAt(),
    checks,
    liveItineraryReadiness: buildLiveItineraryReadiness(checks),
    scheduleProviderReadiness: providerReadinessFromChecks(checks),
    providerPersistence,
    accountPersistence,
    routeFreshnessProbes,
    providerReadiness: providerReadinessMatrix(checks, accountPersistence, routeFreshnessProbes)
  })
}
