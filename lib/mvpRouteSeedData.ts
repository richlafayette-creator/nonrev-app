// Static MVP route seed data for personal testing only.
// These rows are not live airline schedules, inventory, load data, or operational truth.

import type { ParsedItineraryRequest } from './itinerarySearch'

export const mvpRouteSeedDate = '2026-07-15'
export const mvpRouteSeedSource = 'mvp-route-seed-test-data'

export const mvpRouteSeedFlights: Record<string, unknown>[] = [
  // LAX-HNL direct examples
  { id: 'mvp-seed-UA1170-LAX-HNL', flight_number: 'UA1170', carrier: 'United', origin: 'LAX', destination: 'HNL', departure_time: '2026-07-15T08:15:00-07:00', arrival_time: '2026-07-15T11:10:00-10:00', aircraft: 'Boeing 777-200 test data', status: 'MVP test data — not live', score: 82, source_provider: mvpRouteSeedSource },
  { id: 'mvp-seed-DL480-LAX-HNL', flight_number: 'DL480', carrier: 'Delta', origin: 'LAX', destination: 'HNL', departure_time: '2026-07-15T10:05:00-07:00', arrival_time: '2026-07-15T13:05:00-10:00', aircraft: 'Airbus A330-300 test data', status: 'MVP test data — not live', score: 76, source_provider: mvpRouteSeedSource },
  { id: 'mvp-seed-HA9-LAX-HNL', flight_number: 'HA9', carrier: 'Hawaiian', origin: 'LAX', destination: 'HNL', departure_time: '2026-07-15T17:30:00-07:00', arrival_time: '2026-07-15T20:25:00-10:00', aircraft: 'Airbus A330-200 test data', status: 'MVP test data — not live', score: 88, source_provider: mvpRouteSeedSource },

  // SFO-HNL direct examples
  { id: 'mvp-seed-UA1509-SFO-HNL', flight_number: 'UA1509', carrier: 'United', origin: 'SFO', destination: 'HNL', departure_time: '2026-07-15T09:00:00-07:00', arrival_time: '2026-07-15T11:35:00-10:00', aircraft: 'Boeing 777-300ER test data', status: 'MVP test data — not live', score: 84, source_provider: mvpRouteSeedSource },
  { id: 'mvp-seed-AS877-SFO-HNL', flight_number: 'AS877', carrier: 'Alaska', origin: 'SFO', destination: 'HNL', departure_time: '2026-07-15T11:40:00-07:00', arrival_time: '2026-07-15T14:15:00-10:00', aircraft: 'Boeing 737 MAX 9 test data', status: 'MVP test data — not live', score: 79, source_provider: mvpRouteSeedSource },
  { id: 'mvp-seed-HA11-SFO-HNL', flight_number: 'HA11', carrier: 'Hawaiian', origin: 'SFO', destination: 'HNL', departure_time: '2026-07-15T18:15:00-07:00', arrival_time: '2026-07-15T20:50:00-10:00', aircraft: 'Airbus A330-200 test data', status: 'MVP test data — not live', score: 86, source_provider: mvpRouteSeedSource },

  // SEA-HNL direct examples
  { id: 'mvp-seed-AS811-SEA-HNL', flight_number: 'AS811', carrier: 'Alaska', origin: 'SEA', destination: 'HNL', departure_time: '2026-07-15T08:20:00-07:00', arrival_time: '2026-07-15T11:45:00-10:00', aircraft: 'Boeing 737 MAX 9 test data', status: 'MVP test data — not live', score: 81, source_provider: mvpRouteSeedSource },
  { id: 'mvp-seed-DL419-SEA-HNL', flight_number: 'DL419', carrier: 'Delta', origin: 'SEA', destination: 'HNL', departure_time: '2026-07-15T12:35:00-07:00', arrival_time: '2026-07-15T16:00:00-10:00', aircraft: 'Airbus A321neo test data', status: 'MVP test data — not live', score: 73, source_provider: mvpRouteSeedSource },
  { id: 'mvp-seed-HA21-SEA-HNL', flight_number: 'HA21', carrier: 'Hawaiian', origin: 'SEA', destination: 'HNL', departure_time: '2026-07-15T18:05:00-07:00', arrival_time: '2026-07-15T21:30:00-10:00', aircraft: 'Airbus A330-200 test data', status: 'MVP test data — not live', score: 85, source_provider: mvpRouteSeedSource },

  // LAX-OGG direct examples
  { id: 'mvp-seed-UA1212-LAX-OGG', flight_number: 'UA1212', carrier: 'United', origin: 'LAX', destination: 'OGG', departure_time: '2026-07-15T08:55:00-07:00', arrival_time: '2026-07-15T11:45:00-10:00', aircraft: 'Boeing 757-300 test data', status: 'MVP test data — not live', score: 78, source_provider: mvpRouteSeedSource },
  { id: 'mvp-seed-DL464-LAX-OGG', flight_number: 'DL464', carrier: 'Delta', origin: 'LAX', destination: 'OGG', departure_time: '2026-07-15T11:25:00-07:00', arrival_time: '2026-07-15T14:15:00-10:00', aircraft: 'Boeing 767-300 test data', status: 'MVP test data — not live', score: 74, source_provider: mvpRouteSeedSource },
  { id: 'mvp-seed-HA33-LAX-OGG', flight_number: 'HA33', carrier: 'Hawaiian', origin: 'LAX', destination: 'OGG', departure_time: '2026-07-15T17:05:00-07:00', arrival_time: '2026-07-15T19:55:00-10:00', aircraft: 'Airbus A330-200 test data', status: 'MVP test data — not live', score: 86, source_provider: mvpRouteSeedSource },

  // SFO-OGG direct examples
  { id: 'mvp-seed-UA1749-SFO-OGG', flight_number: 'UA1749', carrier: 'United', origin: 'SFO', destination: 'OGG', departure_time: '2026-07-15T09:35:00-07:00', arrival_time: '2026-07-15T12:05:00-10:00', aircraft: 'Boeing 737 MAX 9 test data', status: 'MVP test data — not live', score: 80, source_provider: mvpRouteSeedSource },
  { id: 'mvp-seed-AS879-SFO-OGG', flight_number: 'AS879', carrier: 'Alaska', origin: 'SFO', destination: 'OGG', departure_time: '2026-07-15T12:45:00-07:00', arrival_time: '2026-07-15T15:15:00-10:00', aircraft: 'Boeing 737 MAX 9 test data', status: 'MVP test data — not live', score: 77, source_provider: mvpRouteSeedSource },
  { id: 'mvp-seed-HA41-SFO-OGG', flight_number: 'HA41', carrier: 'Hawaiian', origin: 'SFO', destination: 'OGG', departure_time: '2026-07-15T18:40:00-07:00', arrival_time: '2026-07-15T21:10:00-10:00', aircraft: 'Airbus A321neo test data', status: 'MVP test data — not live', score: 84, source_provider: mvpRouteSeedSource }
]

export function mvpRouteSeedFlightsForRequest(request: ParsedItineraryRequest) {
  return mvpRouteSeedFlights.filter((flight) => {
    const originMatches = request.origin ? flight.origin === request.origin : true
    const destinationMatches = request.destination ? flight.destination === request.destination : true
    const dateMatches = request.date ? String(flight.departure_time).includes(request.date) : true
    const carrierText = `${flight.carrier || ''} ${flight.flight_number || ''}`.toLowerCase()
    const carrierMatches = !request.carrier || request.carrier === 'all'
      ? true
      : request.carrier === 'alaska-group'
        ? ['alaska', 'hawaiian', 'as', 'ha'].some((alias) => carrierText.includes(alias))
        : carrierText.includes(request.carrier.toLowerCase())
    return originMatches && destinationMatches && dateMatches && carrierMatches
  })
}
