import { NextResponse } from 'next/server'
import { getLiveScheduleProviderReadiness, type LiveScheduleProviderKey, type ScheduleProviderReadiness } from '../../../lib/liveScheduleProviders'

export const dynamic = 'force-dynamic'

type HealthStatus = 'Connected' | 'Missing' | 'Limited' | 'Error'
type ProviderReadinessRuntimeStatus = 'Configured' | 'Missing' | 'Limited'

type HealthItem = {
  key: string
  label: string
  status: HealthStatus
  lastChecked: string
  safeErrorMessage: string
  recommendedFix: string
  detail: string
}

const timeoutMs = 5000

function checkedAt() {
  return new Date().toISOString()
}

function item(input: Omit<HealthItem, 'lastChecked'>): HealthItem {
  return { ...input, lastChecked: checkedAt() }
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
        status: 'Error',
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
      status: 'Error',
      safeErrorMessage: safeMessage(error),
      recommendedFix: 'Check network access, Supabase URL, and service availability.',
      detail: 'Supabase health check could not complete.'
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
        status: response.status === 429 ? 'Limited' : 'Error',
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
      status: 'Error',
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
        status: response.status === 429 ? 'Limited' : 'Error',
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
      status: 'Error',
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
        status: response.status === 429 ? 'Limited' : 'Error',
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
      status: 'Error',
      safeErrorMessage: safeMessage(error),
      recommendedFix: 'Check Mapbox availability and outbound network access.',
      detail: 'Mapbox health check could not complete.'
    })
  }
}

export async function GET() {
  const checks = await Promise.all([
    checkSupabaseFlights(),
    checkAviationstack(),
    checkFlightAware(),
    checkMapbox()
  ])

  return NextResponse.json({
    checkedAt: checkedAt(),
    checks,
    scheduleProviderReadiness: providerReadinessFromChecks(checks)
  })
}
