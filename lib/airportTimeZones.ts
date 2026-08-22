import airportTimezoneRows from 'airport-timezone/airports.json' with { type: 'json' }

type AirportTimezoneRow = {
  code?: unknown
  timezone?: unknown
}

function validAirportCode(value: unknown) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(code) ? code : ''
}

function buildAirportTimeZoneIndex(rows: AirportTimezoneRow[]) {
  const supportedCodes = new Set<string>()
  const unresolvedCodes = new Set<string>()
  const mapped: Record<string, string> = {}

  rows.forEach((row) => {
    const code = validAirportCode(row.code)
    if (!code) return
    supportedCodes.add(code)

    const timeZone = typeof row.timezone === 'string' ? row.timezone.trim() : ''
    if (!timeZone) {
      if (!mapped[code]) unresolvedCodes.add(code)
      return
    }

    mapped[code] ||= timeZone
    unresolvedCodes.delete(code)
  })

  return {
    mapped,
    supportedCount: supportedCodes.size,
    unresolvedCodes: [...unresolvedCodes].sort()
  }
}

const airportTimeZoneIndex = buildAirportTimeZoneIndex(airportTimezoneRows as AirportTimezoneRow[])

export const airportTimeZones: Readonly<Record<string, string>> = Object.freeze(airportTimeZoneIndex.mapped)

export const airportTimeZoneCoverage = Object.freeze({
  source: 'airport-timezone@1.1.1',
  supportedIataAirportCount: airportTimeZoneIndex.supportedCount,
  mappedAirportCount: Object.keys(airportTimeZones).length,
  unresolvedAirportCount: airportTimeZoneIndex.unresolvedCodes.length,
  unresolvedAirportCodes: airportTimeZoneIndex.unresolvedCodes,
  coveragePercentage: airportTimeZoneIndex.supportedCount
    ? Math.round((Object.keys(airportTimeZones).length / airportTimeZoneIndex.supportedCount) * 10000) / 100
    : 0
})

export function airportTimeZone(airportCode: unknown) {
  const code = typeof airportCode === 'string' ? airportCode.trim().toUpperCase() : ''
  return airportTimeZones[code]
}

function dateTimeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  }
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = dateTimeParts(date, timeZone)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime()
}

function parseLocalDateTime(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/)
  if (!match) return undefined
  const [, year, month, day, hour, minute, second = '00', millisecond = '0'] = match
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond: Number(millisecond.padEnd(3, '0'))
  }
}

function hasExplicitOffset(value: string) {
  return /(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())
}

export function providerDateTimeToUtcIso(value: unknown, timeZone?: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return undefined

  if (hasExplicitOffset(text)) {
    const parsed = Date.parse(text)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
  }

  const local = timeZone ? parseLocalDateTime(text) : undefined
  if (!local || !timeZone) return undefined

  let utcMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = timeZoneOffsetMs(new Date(utcMs), timeZone)
    const nextUtcMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond) - offset
    if (Math.abs(nextUtcMs - utcMs) < 1) break
    utcMs = nextUtcMs
  }

  const candidate = new Date(utcMs)
  const projected = dateTimeParts(candidate, timeZone)
  if (
    projected.year !== local.year ||
    projected.month !== local.month ||
    projected.day !== local.day ||
    projected.hour !== local.hour ||
    projected.minute !== local.minute
  ) return undefined

  return candidate.toISOString()
}
