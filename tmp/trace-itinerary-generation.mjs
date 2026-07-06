import fs from 'node:fs'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
}

const originFieldKeys = ['origin', 'origin_airport', 'origin_airport_code', 'origin_iata', 'departure_airport', 'departure_airport_code', 'departure_iata', 'departure_iata_code', 'dep_iata', 'dep_airport', 'departure.iata', 'departure.icao']
const destinationFieldKeys = ['destination', 'destination_airport', 'destination_airport_code', 'destination_iata', 'arrival_airport', 'arrival_airport_code', 'arrival_iata', 'arrival_iata_code', 'arr_iata', 'arr_airport', 'arrival.iata', 'arrival.icao']
const dateFieldKeys = ['date', 'flight_date', 'departure_date', 'scheduled_date']
const departureTimeFieldKeys = ['departure_time', 'scheduled_departure', 'scheduled_out', 'actual_out', 'created_at', 'departure.scheduled', 'departure.estimated', 'departure.actual']

function airportCode(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(normalized) ? normalized : undefined
}
function nestedValueFrom(record, key) {
  if (!key.includes('.')) return record[key]
  return key.split('.').reduce((current, part) => current && typeof current === 'object' && part in current ? current[part] : undefined, record)
}
function valueFrom(flight, keys) {
  for (const key of keys) {
    const value = nestedValueFrom(flight, key)
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return ''
}
function nextIsoDate(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime())) return undefined
  parsed.setUTCDate(parsed.getUTCDate() + 1)
  return parsed.toISOString().slice(0, 10)
}
function dayNumber(date) { return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86400000) }
function daysBetween(a, b) { return Math.abs(dayNumber(a) - dayNumber(b)) }
function flightDate(flight) {
  const raw = [valueFrom(flight, dateFieldKeys), valueFrom(flight, departureTimeFieldKeys)].filter(Boolean).join(' ')
  return raw.match(/20\d{2}-\d{2}-\d{2}/)?.[0]
}
function normFlight(flight) {
  return {
    id: valueFrom(flight, ['id']) || valueFrom(flight, ['flight_number', 'ident', 'fa_flight_id']),
    flightNumber: valueFrom(flight, ['operating_flight_number', 'flight_number', 'ident', 'fa_flight_id']) || 'Flight TBD',
    origin: airportCode(valueFrom(flight, originFieldKeys)) || 'TBD',
    destination: airportCode(valueFrom(flight, destinationFieldKeys)) || 'TBD',
    departureTime: valueFrom(flight, ['departure_time', 'scheduled_departure', 'scheduled_out', 'actual_out', 'departure', 'departure.scheduled']) || 'Pending',
    arrivalTime: valueFrom(flight, ['arrival_time', 'scheduled_arrival', 'scheduled_in', 'actual_in', 'arrival']) || 'Pending',
    date: flightDate(flight),
    raw: flight
  }
}
function matchesDate(flight, date) { return !date || [valueFrom(flight, dateFieldKeys), valueFrom(flight, departureTimeFieldKeys)].join(' ').includes(date) }
function matchesCarrier() { return true }
function minutesUntil(a, b) {
  const arr = Date.parse(a.arrivalTime)
  const dep = Date.parse(b.departureTime)
  if (!Number.isFinite(arr) || !Number.isFinite(dep)) return null
  return Math.round((dep - arr) / 60000)
}
function feasible(a, b) {
  const minutes = minutesUntil(a, b)
  return minutes !== null && minutes >= 35 && minutes <= 8 * 60
}
function keyFlight(f) { return [f.id, f.flight_number || f.ident || f.fa_flight_id, f.origin, f.destination, f.departure_time || f.scheduled_departure || f.flight_date].filter(Boolean).join('|') }
function uniqueFlights(flights) {
  const seen = new Set()
  return flights.filter((flight, index) => {
    const key = keyFlight(flight) || `row-${index}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}
function supabaseQueryUrl(supabaseUrl, request, mode) {
  const params = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: mode === 'recent' || mode === 'routeCoverage' ? '300' : '600' })
  if (mode === 'direct') {
    if (request.origin) params.set('origin', `eq.${request.origin}`)
    if (request.destination) params.set('destination', `eq.${request.destination}`)
    if (request.date) { const next = nextIsoDate(request.date); params.append('departure_time', `gte.${request.date}`); if (next) params.append('departure_time', `lt.${next}`) }
  }
  if (mode === 'connection') {
    if (request.origin && request.destination) params.set('or', `(origin.eq.${request.origin},destination.eq.${request.destination})`)
    else if (request.origin) params.set('origin', `eq.${request.origin}`)
    else if (request.destination) params.set('destination', `eq.${request.destination}`)
    if (request.date) { const next = nextIsoDate(request.date); params.append('departure_time', `gte.${request.date}`); if (next) params.append('departure_time', `lt.${next}`) }
  }
  if (mode === 'routeCoverage') {
    if (request.origin && request.destination) params.set('or', `(origin.eq.${request.origin},destination.eq.${request.destination})`)
    else if (request.origin) params.set('origin', `eq.${request.origin}`)
    else if (request.destination) params.set('destination', `eq.${request.destination}`)
  }
  return `${supabaseUrl}/rest/v1/flights?${params.toString()}`
}
async function fetchSupabase(request) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const out = { direct: [], connection: [], routeCoverage: [], recent: [] }
  for (const mode of ['direct', 'connection']) {
    const res = await fetch(supabaseQueryUrl(url, request, mode), { headers })
    out[mode] = res.ok ? await res.json() : []
  }
  const targeted = [...out.direct, ...out.connection]
  const targetedHasMatches = targeted.some(f => normFlight(f).origin === request.origin && normFlight(f).destination === request.destination && matchesDate(f, request.date))
  if (!targetedHasMatches) {
    for (const mode of ['routeCoverage', 'recent']) {
      const res = await fetch(supabaseQueryUrl(url, request, mode), { headers })
      out[mode] = res.ok ? await res.json() : []
    }
  }
  out.all = uniqueFlights([...out.direct, ...out.connection, ...out.routeCoverage, ...out.recent])
  return out
}
function nearestDateRequest(flights, request, tolerance = 45) {
  const routeCarrierFlights = flights.filter(f => {
    const n = normFlight(f)
    return n.origin === request.origin && n.destination === request.destination
  })
  const scoped = routeCarrierFlights.length ? routeCarrierFlights : flights
  const dates = [...new Set(scoped.map(flightDate).filter(Boolean))].sort((a,b) => daysBetween(a, request.date) - daysBetween(b, request.date) || b.localeCompare(a))
  const nearest = dates[0]
  return nearest && daysBetween(nearest, request.date) <= tolerance ? { ...request, date: nearest } : request
}
async function flightAwareRaw(request) {
  const key = process.env.FLIGHTAWARE_API_KEY
  if (!key) return { status: 'missing-key', scheduled: [] }
  const start = request.date
  const end = nextIsoDate(start)
  const params = new URLSearchParams({ origin: request.origin, destination: request.destination, max_pages: '1' })
  const res = await fetch(`https://aeroapi.flightaware.com/aeroapi/schedules/${start}/${end}?${params}`, { headers: { 'x-apikey': key } })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, scheduled: Array.isArray(data.scheduled) ? data.scheduled : [], detail: data.title || data.error || data.message }
}
function analyzeGeneration(flights, request) {
  const normalized = flights.filter(f => matchesCarrier(f, request.carrier) && matchesDate(f, request.date)).map(normFlight)
  const directCandidates = normalized.filter(l => l.origin === request.origin && l.destination === request.destination)
  const firstLegs = normalized.filter(l => l.origin === request.origin && l.destination !== request.destination)
  const secondLegs = normalized.filter(l => l.destination === request.destination && l.origin !== request.origin)
  const oneStop = []
  const oneStopDiscards = []
  for (const first of firstLegs) for (const second of secondLegs) {
    const minutes = minutesUntil(first, second)
    if (second.origin !== first.destination) oneStopDiscards.push({ legs: [first.flightNumber, second.flightNumber], path: `${first.origin}-${first.destination} + ${second.origin}-${second.destination}`, reason: `connection airport mismatch: first destination ${first.destination} != second origin ${second.origin}` })
    else if (minutes === null) oneStopDiscards.push({ legs: [first.flightNumber, second.flightNumber], path: `${first.origin}-${first.destination} + ${second.origin}-${second.destination}`, reason: 'connection time unavailable/unparseable' })
    else if (minutes < 35 || minutes > 480) oneStopDiscards.push({ legs: [first.flightNumber, second.flightNumber], path: `${first.origin}-${first.destination} + ${second.origin}-${second.destination}`, reason: `connection time ${minutes} min outside allowed 35-480 min` })
    else oneStop.push([first, second])
  }
  const twoStop = []
  const twoStopDiscards = []
  for (const first of firstLegs) for (const middle of normalized) {
    const m1 = minutesUntil(first, middle)
    let firstReason = ''
    if (middle.origin !== first.destination) firstReason = `middle origin ${middle.origin} != first destination ${first.destination}`
    else if (middle.destination === request.destination) firstReason = `middle destination ${middle.destination} is final destination; belongs to 1-stop generation`
    else if (middle.destination === request.origin) firstReason = `middle destination ${middle.destination} returns to requested origin`
    else if (middle.destination === first.origin) firstReason = `middle destination ${middle.destination} returns to first origin`
    else if (m1 === null) firstReason = 'first connection time unavailable/unparseable'
    else if (m1 < 35 || m1 > 480) firstReason = `first connection time ${m1} min outside allowed 35-480 min`
    if (firstReason) { twoStopDiscards.push({ stage: 'first-to-middle', legs: [first.flightNumber, middle.flightNumber], path: `${first.origin}-${first.destination} + ${middle.origin}-${middle.destination}`, reason: firstReason }); continue }
    for (const final of secondLegs) {
      const m2 = minutesUntil(middle, final)
      if (final.origin !== middle.destination) twoStopDiscards.push({ stage: 'middle-to-final', legs: [first.flightNumber, middle.flightNumber, final.flightNumber], path: `${first.origin}-${first.destination} + ${middle.origin}-${middle.destination} + ${final.origin}-${final.destination}`, reason: `final origin ${final.origin} != middle destination ${middle.destination}` })
      else if (final.destination !== request.destination) twoStopDiscards.push({ stage: 'middle-to-final', legs: [first.flightNumber, middle.flightNumber, final.flightNumber], path: `${first.origin}-${first.destination} + ${middle.origin}-${middle.destination} + ${final.origin}-${final.destination}`, reason: `final destination ${final.destination} != requested destination ${request.destination}` })
      else if (final.origin === first.origin) twoStopDiscards.push({ stage: 'middle-to-final', legs: [first.flightNumber, middle.flightNumber, final.flightNumber], path: `${first.origin}-${first.destination} + ${middle.origin}-${middle.destination} + ${final.origin}-${final.destination}`, reason: `final origin ${final.origin} equals first origin` })
      else if (final.origin === first.destination) twoStopDiscards.push({ stage: 'middle-to-final', legs: [first.flightNumber, middle.flightNumber, final.flightNumber], path: `${first.origin}-${first.destination} + ${middle.origin}-${middle.destination} + ${final.origin}-${final.destination}`, reason: `final origin ${final.origin} equals first destination` })
      else if (m2 === null) twoStopDiscards.push({ stage: 'middle-to-final', legs: [first.flightNumber, middle.flightNumber, final.flightNumber], path: `${first.origin}-${first.destination} + ${middle.origin}-${middle.destination} + ${final.origin}-${final.destination}`, reason: 'second connection time unavailable/unparseable' })
      else if (m2 < 35 || m2 > 480) twoStopDiscards.push({ stage: 'middle-to-final', legs: [first.flightNumber, middle.flightNumber, final.flightNumber], path: `${first.origin}-${first.destination} + ${middle.origin}-${middle.destination} + ${final.origin}-${final.destination}`, reason: `second connection time ${m2} min outside allowed 35-480 min` })
      else twoStop.push([first, middle, final])
    }
  }
  const summarize = (items) => [...items.reduce((m, item) => m.set(item.reason, (m.get(item.reason) || 0) + 1), new Map())].sort((a,b)=>b[1]-a[1]).map(([reason,count])=>({reason,count}))
  return { normalizedCount: normalized.length, directCount: directCandidates.length, firstLegCount: firstLegs.length, secondLegCount: secondLegs.length, oneStopCount: oneStop.length, twoStopCount: twoStop.length, oneStopDiscardSummary: summarize(oneStopDiscards), twoStopDiscardSummary: summarize(twoStopDiscards), oneStopDiscardSamples: oneStopDiscards.slice(0, 20), twoStopDiscardSamples: twoStopDiscards.slice(0, 20), directCandidates: directCandidates.slice(0, 20), oneStop: oneStop.slice(0, 10), twoStop: twoStop.slice(0, 10) }
}

const routes = [['LAX','OGG'], ['BOS','SBP'], ['SBP','OGG'], ['SBP','NRT']]
const result = {}
for (const [origin, destination] of routes) {
  const request = { origin, destination, date: '2026-07-01', carrier: 'all', maxLegs: 3 }
  const fa = await flightAwareRaw(request)
  const supabase = await fetchSupabase(request)
  const matchingRequest = nearestDateRequest(supabase.all, request)
  const generation = analyzeGeneration(supabase.all, matchingRequest)
  result[`${origin}-${destination}`] = {
    airportParsing: request,
    originAirportExpansion: { liveScheduleOriginsQueried: [origin], frameworkPositioningOnly: true, note: 'Current live provider search does not expand origins into hubs for segment-level schedule retrieval.' },
    destinationAirportExpansion: { liveScheduleDestinationsQueried: [destination], frameworkAlternatesOnly: true, note: 'Current live provider search does not expand destinations into inbound hubs for segment-level schedule retrieval.' },
    liveScheduleRetrieval: { flightAwareExactRouteStatus: fa.status, flightAwareRawRows: fa.scheduled.length, flightAwareSample: fa.scheduled.slice(0, 10).map(f => ({ ident_iata: f.ident_iata, actual_ident_iata: f.actual_ident_iata, origin: f.origin_iata, destination: f.destination_iata, out: f.scheduled_out, in: f.scheduled_in })), aviationstackKnownFromApi: 'see API trace: rate-limited/no usable rows' },
    candidateFlightList: { supabaseDirectRows: supabase.direct.length, supabaseConnectionRows: supabase.connection.length, supabaseRouteCoverageRows: supabase.routeCoverage.length, supabaseRecentRows: supabase.recent.length, supabaseUniqueRows: supabase.all.length, generationDateUsed: matchingRequest.date, normalizedCandidatesOnGenerationDate: generation.normalizedCount, firstLegCandidates: generation.firstLegCount, secondLegCandidates: generation.secondLegCount },
    directItineraryGeneration: { generated: generation.directCount, candidates: generation.directCandidates },
    oneStopGeneration: { generated: generation.oneStopCount, discardSummary: generation.oneStopDiscardSummary, discardSamples: generation.oneStopDiscardSamples, generatedSamples: generation.oneStop },
    twoStopGeneration: { generated: generation.twoStopCount, discardSummary: generation.twoStopDiscardSummary, discardSamples: generation.twoStopDiscardSamples, generatedSamples: generation.twoStop },
    finalScheduledItineraryCountFromSupabaseTrace: generation.directCount + generation.oneStopCount + generation.twoStopCount
  }
}
fs.writeFileSync('tmp/trace-itineraries/full-generation-trace.json', JSON.stringify(result, null, 2))
for (const [route, trace] of Object.entries(result)) {
  console.log(`\n${route}`)
  console.log(JSON.stringify({ parsing: trace.airportParsing, liveRows: trace.liveScheduleRetrieval.flightAwareRawRows, candidates: trace.candidateFlightList, direct: trace.directItineraryGeneration.generated, oneStop: trace.oneStopGeneration.generated, twoStop: trace.twoStopGeneration.generated, topOneStopDiscard: trace.oneStopGeneration.discardSummary[0], topTwoStopDiscard: trace.twoStopGeneration.discardSummary[0], final: trace.finalScheduledItineraryCountFromSupabaseTrace }, null, 2))
}
