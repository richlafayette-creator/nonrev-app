import type { ProviderAgnosticScheduleRow, ScheduleProviderAdapterResult } from './scheduleProviderAdapter'

export type ScheduleProviderComparisonDiagnostics = {
  flightsUniqueToEachProvider: Record<string, string[]>
  missingAirports: Record<string, string[]>
  missingAirlines: Record<string, string[]>
  overlapPercentage: number
}

export type ScheduleProviderCoverageReport = {
  byCountry: Record<string, { flights: number; airports: string[]; airlines: string[]; providers: string[] }>
  byAirport: Record<string, { flights: number; airlines: string[]; providers: string[] }>
  byAirline: Record<string, { flights: number; airports: string[]; providers: string[] }>
  knownDataGaps: string[]
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function rowMergeKey(row: ProviderAgnosticScheduleRow) {
  return [row.operating_flight_number || row.flight_number, row.origin, row.destination, row.departure_time, row.arrival_time].join('|')
}

export function mergeDuplicateScheduleRows(rows: ProviderAgnosticScheduleRow[]): ProviderAgnosticScheduleRow[] {
  const merged = new Map<string, ProviderAgnosticScheduleRow>()
  rows.forEach((row) => {
    const key = rowMergeKey(row)
    const existing = merged.get(key)
    if (!existing) {
      const scheduleSources = uniqueStrings(row.schedule_sources?.length ? row.schedule_sources : [row.source_provider])
      merged.set(key, { ...row, schedule_sources: scheduleSources, providers: scheduleSources, duplicate_count: row.duplicate_count || 0 })
      return
    }
    const scheduleSources = uniqueStrings([...existing.schedule_sources, ...(row.schedule_sources || []), row.source_provider])
    const marketingFlights = uniqueStrings([...existing.marketing_flight_numbers, ...row.marketing_flight_numbers, row.flight_number])
      .filter((flightNumber) => flightNumber !== existing.operating_flight_number)
    merged.set(key, {
      ...existing,
      source_provider: scheduleSources.join('+'),
      schedule_source: scheduleSources.join('+'),
      schedule_sources: scheduleSources,
      providers: scheduleSources,
      aircraft: existing.aircraft !== 'Unknown' && existing.aircraft !== 'Not provided' ? existing.aircraft : row.aircraft,
      status: existing.status !== 'Unknown' && existing.status !== 'Not provided' ? existing.status : row.status,
      confidence: Math.max(existing.confidence || 0, row.confidence || 0),
      coverage_status: existing.coverage_status === 'covered' || row.coverage_status === 'covered' ? 'covered' : existing.coverage_status === 'partial' || row.coverage_status === 'partial' ? 'partial' : existing.coverage_status,
      missing_data_reason: existing.missing_data_reason || row.missing_data_reason,
      marketing_flight_numbers: marketingFlights,
      codeshare_relationships: uniqueStrings([...existing.codeshare_relationships, ...row.codeshare_relationships]),
      duplicate_count: (existing.duplicate_count || 0) + 1 + (row.duplicate_count || 0)
    })
  })
  return [...merged.values()]
}

function flightKeys(rows: ProviderAgnosticScheduleRow[]) {
  return new Set(rows.map(rowMergeKey))
}

export function compareScheduleProviders(results: ScheduleProviderAdapterResult[]): ScheduleProviderComparisonDiagnostics {
  const providerRows = new Map(results.map((result) => [result.provider, result.rows]))
  const allAirports = new Set(results.flatMap((result) => result.rows.flatMap((row) => [row.origin, row.destination]).filter(Boolean)))
  const allAirlines = new Set(results.flatMap((result) => result.rows.map((row) => row.airline).filter(Boolean)))
  const providerFlightKeys = new Map(results.map((result) => [result.provider, flightKeys(result.rows)]))
  const allKeys = new Set([...providerFlightKeys.values()].flatMap((keys) => [...keys]))
  const sharedKeys = [...allKeys].filter((key) => [...providerFlightKeys.values()].filter((keys) => keys.has(key)).length > 1)

  return {
    flightsUniqueToEachProvider: Object.fromEntries(results.map((result) => {
      const otherKeys = new Set(results.filter((other) => other.provider !== result.provider).flatMap((other) => [...flightKeys(other.rows)]))
      return [result.provider, result.rows.filter((row) => !otherKeys.has(rowMergeKey(row))).map(rowMergeKey)]
    })),
    missingAirports: Object.fromEntries(results.map((result) => {
      const airports = new Set((providerRows.get(result.provider) || []).flatMap((row) => [row.origin, row.destination]).filter(Boolean))
      return [result.provider, [...allAirports].filter((airport) => !airports.has(airport))]
    })),
    missingAirlines: Object.fromEntries(results.map((result) => {
      const airlines = new Set((providerRows.get(result.provider) || []).map((row) => row.airline).filter(Boolean))
      return [result.provider, [...allAirlines].filter((airline) => !airlines.has(airline))]
    })),
    overlapPercentage: allKeys.size ? Math.round((sharedKeys.length / allKeys.size) * 10000) / 100 : 100
  }
}

const airportCountries: Record<string, string> = {
  ATL: 'US', BOS: 'US', DEN: 'US', DFW: 'US', EWR: 'US', HNL: 'US', IAD: 'US', IAH: 'US', JFK: 'US', LAX: 'US', NRT: 'JP', HND: 'JP', OGG: 'US', ORD: 'US', PDX: 'US', PHX: 'US', SAN: 'US', SBP: 'US', SEA: 'US', SFO: 'US'
}

function addCoverageEntry<T extends { flights: number; airports?: string[]; airlines?: string[]; providers: string[] }>(entry: T, row: ProviderAgnosticScheduleRow) {
  entry.flights += 1
  if (entry.airports) entry.airports = uniqueStrings([...entry.airports, row.origin, row.destination]).sort()
  if (entry.airlines) entry.airlines = uniqueStrings([...entry.airlines, row.airline]).sort()
  entry.providers = uniqueStrings([...entry.providers, ...row.schedule_sources]).sort()
}

export function buildScheduleProviderCoverageReport(rows: ProviderAgnosticScheduleRow[], results: ScheduleProviderAdapterResult[]): ScheduleProviderCoverageReport {
  const byCountry: ScheduleProviderCoverageReport['byCountry'] = {}
  const byAirport: ScheduleProviderCoverageReport['byAirport'] = {}
  const byAirline: ScheduleProviderCoverageReport['byAirline'] = {}
  rows.forEach((row) => {
    uniqueStrings([airportCountries[row.origin] || 'unknown', airportCountries[row.destination] || 'unknown']).forEach((country) => {
      byCountry[country] ||= { flights: 0, airports: [], airlines: [], providers: [] }
      addCoverageEntry(byCountry[country], row)
    })
    ;[row.origin, row.destination].filter(Boolean).forEach((airport) => {
      byAirport[airport] ||= { flights: 0, airlines: [], providers: [] }
      byAirport[airport].flights += 1
      byAirport[airport].airlines = uniqueStrings([...byAirport[airport].airlines, row.airline]).sort()
      byAirport[airport].providers = uniqueStrings([...byAirport[airport].providers, ...row.schedule_sources]).sort()
    })
    byAirline[row.airline] ||= { flights: 0, airports: [], providers: [] }
    byAirline[row.airline].flights += 1
    byAirline[row.airline].airports = uniqueStrings([...byAirline[row.airline].airports, row.origin, row.destination]).sort()
    byAirline[row.airline].providers = uniqueStrings([...byAirline[row.airline].providers, ...row.schedule_sources]).sort()
  })
  const knownDataGaps = results
    .filter((result) => result.status !== 'success' || !result.rows.length || result.warning)
    .map((result) => `${result.provider}: ${result.warning || result.detail || 'no usable schedule rows returned'}`)
  return { byCountry, byAirport, byAirline, knownDataGaps }
}
