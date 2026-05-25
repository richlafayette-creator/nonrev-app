export type FlightSignals = {
  flight_number?: string | null
  origin?: string | null
  destination?: string | null
  aircraft?: string | null
  status?: string | null
  score?: number | null
  created_at?: string | null
}

export type ItinerarySignals = {
  route: string
  confidence: string
  segments: string[]
  backupOptions?: number
  travelerFriction?: number
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term))
}

export function delayRiskScore(flight: FlightSignals) {
  const status = (flight.status || '').toLowerCase()
  const route = `${flight.origin || ''}-${flight.destination || ''}`.toUpperCase()
  const aircraft = (flight.aircraft || '').toLowerCase()
  let risk = 28
  const reasons: string[] = ['Baseline scaffold risk']

  if (includesAny(status, ['delayed', 'late', 'weather', 'irrop', 'cancel'])) {
    risk += 35
    reasons.push('Current status suggests operational disruption')
  }

  if (includesAny(route, ['SFO', 'EWR', 'ORD', 'DEN'])) {
    risk += 10
    reasons.push('Route touches a weather/congestion-sensitive hub')
  }

  if (includesAny(aircraft, ['regional', 'crj', 'embraer', 'e75'])) {
    risk += 8
    reasons.push('Smaller aircraft can reduce recovery options')
  }

  if ((flight.score || 0) >= 75) {
    risk -= 8
    reasons.push('Strong load score offsets some delay risk')
  }

  const score = Math.max(5, Math.min(95, risk))
  const label = score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low'

  return { score, label, reasons }
}

export function rankItinerary(itinerary: ItinerarySignals) {
  let score = 50
  const notes: string[] = []

  if (itinerary.confidence === 'Strong') {
    score += 20
    notes.push('Strong initial confidence')
  }

  const backupOptions = itinerary.backupOptions ?? itinerary.segments.length
  score += Math.min(20, backupOptions * 5)
  notes.push(`${backupOptions} backup/recovery signal(s)`)

  if (itinerary.route.includes('→')) {
    const hops = itinerary.route.split('→').length - 1
    score -= Math.max(0, hops - 1) * 6
    if (hops > 1) notes.push('Extra connection adds nonrev complexity')
  }

  if ((itinerary.travelerFriction || 0) > 0) {
    score -= itinerary.travelerFriction || 0
    notes.push('Traveler friction penalty applied')
  }

  const rank = Math.max(1, Math.min(99, score))
  return {
    score: rank,
    label: rank >= 75 ? 'Best fit' : rank >= 60 ? 'Good backup' : 'Use cautiously',
    notes
  }
}
