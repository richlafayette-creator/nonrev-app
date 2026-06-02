import { airportCodesFromRoute } from './airportMapScaffold'

export type ConnectionDifficulty = 'Easy' | 'Moderate' | 'Hard' | 'Complex'
export type WalkingDistanceCategory = 'Short' | 'Medium' | 'Long' | 'Very Long'
export type HubStrength = 'Primary Hub' | 'Strong Hub' | 'Focus City' | 'Limited Hub'
export type BackupAvailability = 'Excellent' | 'Good' | 'Fair' | 'Limited'

export type AirportIntelligence = {
  code: string
  name: string
  terminalInformation: string
  typicalConnectionTerminals: string
  connectionDifficulty: ConnectionDifficulty
  walkingDistanceCategory: WalkingDistanceCategory
  hubStrength: HubStrength
  backupFlightAvailability: BackupAvailability
  connectionRiskScore: number
  notes: string[]
}

export type RouteAirportIntelligence = {
  route: string
  airports: AirportIntelligence[]
  connectionAirports: AirportIntelligence[]
  connectionRiskScore: number
  overallConnectionDifficulty: ConnectionDifficulty
  walkingDistanceCategory: WalkingDistanceCategory
  hubStrengthSummary: string
  backupFlightAvailability: BackupAvailability
  explanation: string[]
}

type AirportSeed = Omit<AirportIntelligence, 'connectionRiskScore'> & { baseRisk: number }

const airportSeeds: Record<string, AirportSeed> = {
  LAX: {
    code: 'LAX',
    name: 'Los Angeles International Airport',
    terminalInformation: 'Large multi-terminal airport; airline terminals vary and inter-terminal movement may require walking or shuttle planning.',
    typicalConnectionTerminals: 'United T7/T8, Delta T2/T3, Alaska T6, international Tom Bradley connections.',
    connectionDifficulty: 'Hard',
    walkingDistanceCategory: 'Long',
    hubStrength: 'Strong Hub',
    backupFlightAvailability: 'Excellent',
    baseRisk: 62,
    notes: ['Strong backup depth, but terminal changes can be slow.', 'Build buffer when moving between domestic and international terminals.']
  },
  SFO: {
    code: 'SFO',
    name: 'San Francisco International Airport',
    terminalInformation: 'United-heavy hub with domestic/international adjacency; weather and runway flow can affect connection reliability.',
    typicalConnectionTerminals: 'United T3/International G, Alaska/other domestic terminals depending on carrier.',
    connectionDifficulty: 'Moderate',
    walkingDistanceCategory: 'Medium',
    hubStrength: 'Primary Hub',
    backupFlightAvailability: 'Good',
    baseRisk: 48,
    notes: ['Good United recovery options.', 'Weather-driven delay programs can raise same-day risk.']
  },
  SEA: {
    code: 'SEA',
    name: 'Seattle-Tacoma International Airport',
    terminalInformation: 'Concourses and satellites connected by train; Alaska presence creates strong West Coast backup options.',
    typicalConnectionTerminals: 'Alaska North/C/D, Delta A/B/S, international S satellite.',
    connectionDifficulty: 'Moderate',
    walkingDistanceCategory: 'Medium',
    hubStrength: 'Strong Hub',
    backupFlightAvailability: 'Good',
    baseRisk: 46,
    notes: ['Satellite transfers add time.', 'Strong Alaska/Delta alternate frequency.']
  },
  DEN: {
    code: 'DEN',
    name: 'Denver International Airport',
    terminalInformation: 'Large concourse layout connected by train; strong hub depth but weather can create rolling delays.',
    typicalConnectionTerminals: 'United mostly Concourse B, other domestic A/C depending on carrier.',
    connectionDifficulty: 'Moderate',
    walkingDistanceCategory: 'Long',
    hubStrength: 'Primary Hub',
    backupFlightAvailability: 'Excellent',
    baseRisk: 52,
    notes: ['Excellent backup flight depth.', 'Train dependency and weather can affect tight connects.']
  },
  ORD: {
    code: 'ORD',
    name: "Chicago O'Hare International Airport",
    terminalInformation: 'Large multi-terminal hub; connection paths depend heavily on carrier and terminal pair.',
    typicalConnectionTerminals: 'United T1/T2, American T3, international T5 arrivals.',
    connectionDifficulty: 'Hard',
    walkingDistanceCategory: 'Long',
    hubStrength: 'Primary Hub',
    backupFlightAvailability: 'Excellent',
    baseRisk: 66,
    notes: ['Very strong backup inventory.', 'Terminal changes and weather make short connections risky.']
  },
  IAH: {
    code: 'IAH',
    name: 'George Bush Intercontinental Airport',
    terminalInformation: 'United hub with multiple terminals connected by train/walkways; international-to-domestic needs buffer.',
    typicalConnectionTerminals: 'United B/C/E, international D/E depending on arrival flow.',
    connectionDifficulty: 'Moderate',
    walkingDistanceCategory: 'Medium',
    hubStrength: 'Primary Hub',
    backupFlightAvailability: 'Excellent',
    baseRisk: 45,
    notes: ['Strong United recovery depth.', 'International connections should keep extra time.']
  },
  ATL: {
    code: 'ATL',
    name: 'Hartsfield-Jackson Atlanta International Airport',
    terminalInformation: 'Linear concourse layout connected by Plane Train; very high frequency but high-volume banks.',
    typicalConnectionTerminals: 'Delta across T/A/B/C/D/E/F depending on bank and international flow.',
    connectionDifficulty: 'Moderate',
    walkingDistanceCategory: 'Medium',
    hubStrength: 'Primary Hub',
    backupFlightAvailability: 'Excellent',
    baseRisk: 43,
    notes: ['Excellent backup frequency.', 'High volume means small delays can ripple through banks.']
  },
  DTW: {
    code: 'DTW',
    name: 'Detroit Metropolitan Wayne County Airport',
    terminalInformation: 'Delta-friendly McNamara layout is efficient; North terminal connections vary by carrier.',
    typicalConnectionTerminals: 'Delta McNamara A/B/C, other carriers Evans/North terminal.',
    connectionDifficulty: 'Easy',
    walkingDistanceCategory: 'Medium',
    hubStrength: 'Primary Hub',
    backupFlightAvailability: 'Good',
    baseRisk: 32,
    notes: ['Efficient Delta hub for connections.', 'Carrier terminal mismatch can raise difficulty.']
  },
  MSP: {
    code: 'MSP',
    name: 'Minneapolis-Saint Paul International Airport',
    terminalInformation: 'Delta hub with mostly efficient domestic connections; terminal split matters for non-Delta carriers.',
    typicalConnectionTerminals: 'Delta Terminal 1 concourses, other carriers split between Terminal 1 and Terminal 2.',
    connectionDifficulty: 'Easy',
    walkingDistanceCategory: 'Medium',
    hubStrength: 'Primary Hub',
    backupFlightAvailability: 'Good',
    baseRisk: 34,
    notes: ['Generally reliable connection layout.', 'Winter operations can add seasonal risk.']
  },
  HNL: {
    code: 'HNL',
    name: 'Daniel K. Inouye International Airport',
    terminalInformation: 'Hawaii gateway with interisland and long-haul flows; terminal/gate walks can be exposed and slower.',
    typicalConnectionTerminals: 'Main overseas terminal plus interisland gates for Hawaiian and partner flows.',
    connectionDifficulty: 'Moderate',
    walkingDistanceCategory: 'Medium',
    hubStrength: 'Strong Hub',
    backupFlightAvailability: 'Fair',
    baseRisk: 44,
    notes: ['Good interisland options, fewer mainland recovery choices.', 'Leave buffer for overseas-to-interisland turns.']
  },
  OGG: {
    code: 'OGG',
    name: 'Kahului Airport',
    terminalInformation: 'Smaller Maui airport with simpler terminal layout but limited long-haul recovery frequency.',
    typicalConnectionTerminals: 'Single-terminal style operations; interisland and mainland gates vary by schedule.',
    connectionDifficulty: 'Easy',
    walkingDistanceCategory: 'Short',
    hubStrength: 'Limited Hub',
    backupFlightAvailability: 'Limited',
    baseRisk: 38,
    notes: ['Easy on-airport movement.', 'Backup availability can be thin when mainland flights fill.']
  }
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function difficultyRank(value: ConnectionDifficulty) {
  return value === 'Complex' ? 4 : value === 'Hard' ? 3 : value === 'Moderate' ? 2 : 1
}

function walkingRank(value: WalkingDistanceCategory) {
  return value === 'Very Long' ? 4 : value === 'Long' ? 3 : value === 'Medium' ? 2 : 1
}

function backupRank(value: BackupAvailability) {
  return value === 'Excellent' ? 4 : value === 'Good' ? 3 : value === 'Fair' ? 2 : 1
}

function difficultyFromScore(score: number): ConnectionDifficulty {
  if (score >= 75) return 'Complex'
  if (score >= 58) return 'Hard'
  if (score >= 38) return 'Moderate'
  return 'Easy'
}

function walkingFromRank(rank: number): WalkingDistanceCategory {
  if (rank >= 4) return 'Very Long'
  if (rank >= 3) return 'Long'
  if (rank >= 2) return 'Medium'
  return 'Short'
}

function backupFromRank(rank: number): BackupAvailability {
  if (rank >= 3.5) return 'Excellent'
  if (rank >= 2.5) return 'Good'
  if (rank >= 1.5) return 'Fair'
  return 'Limited'
}

export function connectionRiskColor(score: number) {
  if (score >= 70) return '#f87171'
  if (score >= 50) return '#facc15'
  if (score >= 35) return '#38bdf8'
  return '#22c55e'
}

export function airportIntelligenceFor(code: string): AirportIntelligence {
  const airport = airportSeeds[code.toUpperCase()]
  if (!airport) {
    return {
      code: code.toUpperCase(),
      name: `${code.toUpperCase()} airport`,
      terminalInformation: 'Terminal intelligence pending for this airport.',
      typicalConnectionTerminals: 'Typical connection terminals pending static data expansion.',
      connectionDifficulty: 'Moderate',
      walkingDistanceCategory: 'Medium',
      hubStrength: 'Limited Hub',
      backupFlightAvailability: 'Fair',
      connectionRiskScore: 50,
      notes: ['Placeholder airport profile until this station is added to the major-hub intelligence set.']
    }
  }

  return {
    ...airport,
    connectionRiskScore: clamp(airport.baseRisk)
  }
}

export function buildRouteAirportIntelligence(route: string): RouteAirportIntelligence {
  const airportCodes = airportCodesFromRoute(route)
  const airports = airportCodes.map(airportIntelligenceFor)
  const connectionAirports = airports.length > 2 ? airports.slice(1, -1) : airports.slice(0, 1)
  const riskAirports = connectionAirports.length ? connectionAirports : airports
  const connectionRiskScore = riskAirports.length
    ? clamp(riskAirports.reduce((total, airport) => total + airport.connectionRiskScore, 0) / riskAirports.length + Math.max(0, airportCodes.length - 2) * 5)
    : 45
  const hardestDifficulty = riskAirports.reduce<ConnectionDifficulty>((hardest, airport) => difficultyRank(airport.connectionDifficulty) > difficultyRank(hardest) ? airport.connectionDifficulty : hardest, 'Easy')
  const longestWalking = walkingFromRank(riskAirports.reduce((rank, airport) => Math.max(rank, walkingRank(airport.walkingDistanceCategory)), 1))
  const backupAverage = riskAirports.length ? riskAirports.reduce((total, airport) => total + backupRank(airport.backupFlightAvailability), 0) / riskAirports.length : 2
  const backupFlightAvailability = backupFromRank(backupAverage)
  const hubStrengthSummary = airports.length
    ? airports.map((airport) => `${airport.code}: ${airport.hubStrength}`).join(' · ')
    : 'Airport hub strength pending route data.'

  return {
    route,
    airports,
    connectionAirports,
    connectionRiskScore,
    overallConnectionDifficulty: difficultyFromScore(Math.max(connectionRiskScore, difficultyRank(hardestDifficulty) * 20)),
    walkingDistanceCategory: longestWalking,
    hubStrengthSummary,
    backupFlightAvailability,
    explanation: [
      `Connection Risk Score is ${connectionRiskScore}/100 using static airport difficulty, walking distance, hub strength, and backup availability placeholders.`,
      connectionAirports.length
        ? `Connection airport focus: ${connectionAirports.map((airport) => `${airport.code} (${airport.connectionDifficulty})`).join(', ')}.`
        : 'No true connection airport detected; score reflects origin/destination operating complexity.',
      `Backup flight availability is ${backupFlightAvailability}; higher availability lowers operational recovery risk but does not guarantee nonrev seat availability.`,
      `Walking distance category is ${longestWalking}; use this to avoid overly tight terminal changes.`
    ]
  }
}

export const supportedAirportIntelligenceCodes = Object.keys(airportSeeds)
