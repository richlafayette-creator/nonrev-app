import type { NormalizedScheduleResult } from './liveScheduleProviders'

export type ProviderResultRecord = {
  source_provider: string
  source_checked_at: string
  origin: string
  destination: string
  departure_time: string
  arrival_time: string
  flight_number: string
  carrier: string
  aircraft: string
  status: string
}

export type ProviderResultStoreResult = {
  enabled: boolean
  attempted: boolean
  stored: number
  status: 'disabled' | 'skipped' | 'stored' | 'fallback-noop'
  detail: string
}

export type ProviderResultRepository = {
  storeNormalizedResults: (results: NormalizedScheduleResult[]) => Promise<ProviderResultStoreResult>
}

type ProviderResultRepositoryEnv = Record<string, string | undefined>

export const providerResultTableName = 'provider_itinerary_results'
const defaultStoreTimeoutMs = 2500

function storeProviderResultsEnabled(env: ProviderResultRepositoryEnv) {
  return env.NONREVY_STORE_PROVIDER_RESULTS === 'true'
}

function cleanValue(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed || 'Not provided'
}

export function normalizedResultToProviderResultRecord(result: NormalizedScheduleResult): ProviderResultRecord {
  return {
    source_provider: cleanValue(result.source),
    source_checked_at: result.sourceCheckedAt || new Date().toISOString(),
    origin: cleanValue(result.origin),
    destination: cleanValue(result.destination),
    departure_time: cleanValue(result.departureTime),
    arrival_time: cleanValue(result.arrivalTime),
    flight_number: cleanValue(result.flightNumber),
    carrier: cleanValue(result.carrier),
    aircraft: cleanValue(result.aircraft),
    status: cleanValue(result.status)
  }
}

export function createNoopProviderResultRepository(detail = 'Provider result persistence is disabled.'): ProviderResultRepository {
  return {
    async storeNormalizedResults() {
      return {
        enabled: false,
        attempted: false,
        stored: 0,
        status: 'disabled',
        detail
      }
    }
  }
}

export function createProviderResultRepository(env: ProviderResultRepositoryEnv = process.env): ProviderResultRepository {
  if (!storeProviderResultsEnabled(env)) {
    return createNoopProviderResultRepository('Set NONREVY_STORE_PROVIDER_RESULTS=true to persist normalized provider results.')
  }

  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      async storeNormalizedResults() {
        return {
          enabled: true,
          attempted: false,
          stored: 0,
          status: 'fallback-noop',
          detail: 'Provider result persistence requested, but Supabase URL or server-only service role key is unavailable; using local/no-op fallback.'
        }
      }
    }
  }

  return {
    async storeNormalizedResults(results) {
      const records = results.map(normalizedResultToProviderResultRecord)
      if (!records.length) {
        return {
          enabled: true,
          attempted: false,
          stored: 0,
          status: 'skipped',
          detail: 'No normalized provider results to persist.'
        }
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), defaultStoreTimeoutMs)

      try {
        const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${providerResultTableName}`, {
          method: 'POST',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify(records),
          signal: controller.signal,
          cache: 'no-store'
        })

        if (!response.ok) {
          return {
            enabled: true,
            attempted: true,
            stored: 0,
            status: 'fallback-noop',
            detail: `Provider result persistence table unavailable or rejected insert (${response.status}); using local/no-op fallback.`
          }
        }

        return {
          enabled: true,
          attempted: true,
          stored: records.length,
          status: 'stored',
          detail: `${records.length} normalized provider result${records.length === 1 ? '' : 's'} stored.`
        }
      } catch {
        return {
          enabled: true,
          attempted: true,
          stored: 0,
          status: 'fallback-noop',
          detail: 'Provider result persistence failed or timed out; using local/no-op fallback.'
        }
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
