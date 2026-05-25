export const passengerFlightCoverageNotes = [
  'Architecture target: all commercial passenger airports and all available passenger flights.',
  'Actual coverage depends on the selected data provider, Aviationstack/API plan limits, polling cadence, and licensing.',
  'Private, cargo-only, military, and unavailable carrier inventory should be excluded unless explicitly licensed.'
]

export const richFlightFieldLabels = [
  { key: 'gate', label: 'Gate' },
  { key: 'departure_gate', label: 'Departure gate' },
  { key: 'arrival_gate', label: 'Arrival gate' },
  { key: 'terminal', label: 'Terminal' },
  { key: 'departure_terminal', label: 'Departure terminal' },
  { key: 'arrival_terminal', label: 'Arrival terminal' },
  { key: 'departure_time', label: 'Departure time' },
  { key: 'arrival_time', label: 'Arrival time' },
  { key: 'boarding_time', label: 'Boarding time' },
  { key: 'delay_minutes', label: 'Delay' },
  { key: 'aircraft', label: 'Aircraft' },
  { key: 'airline', label: 'Airline/operator' },
  { key: 'operator', label: 'Operator' },
  { key: 'lounges_nearby', label: 'Lounges nearby' },
  { key: 'airport_map_url', label: 'Airport map' },
  { key: 'gps_latitude', label: 'GPS latitude' },
  { key: 'gps_longitude', label: 'GPS longitude' }
]

export function fieldValue(flight: Record<string, unknown>, key: string, fallback = 'Not available yet') {
  const value = flight[key]
  if (value === null || value === undefined || value === '') return fallback
  if (Array.isArray(value)) return value.length ? value.join(', ') : fallback
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function allFlightFields(flight: Record<string, unknown>) {
  return Object.entries(flight).sort(([a], [b]) => a.localeCompare(b))
}
