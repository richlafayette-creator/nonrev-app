import { airportCodesFromRoute } from './airportMapScaffold'

export type WeatherRiskCategory = 'Low' | 'Moderate' | 'High' | 'Severe'

export type WeatherRiskStatus = 'placeholder' | 'live-unavailable'

export type WeatherRisk = {
  category: WeatherRiskCategory
  scoreImpact: number
  successProbabilityImpact: number
  routeRankingImpact: number
  source: string
  status: WeatherRiskStatus
  details: string[]
  diagnostics: string[]
}

type AirportWeatherSeed = {
  impact: number
  detail: string
}

const placeholderWeatherProvider = 'Placeholder Weather Intelligence'

const airportWeatherSeeds: Record<string, AirportWeatherSeed> = {
  SFO: { impact: 12, detail: 'SFO weather sensitivity: marine layer/low ceilings can reduce arrival rates.' },
  JFK: { impact: 10, detail: 'JFK weather sensitivity: Northeast convective and winter ops can cascade into banks.' },
  LGA: { impact: 10, detail: 'LGA weather sensitivity: short-haul flow programs can tighten recovery options.' },
  EWR: { impact: 11, detail: 'EWR weather sensitivity: congestion and flow control can compound delay risk.' },
  ORD: { impact: 12, detail: 'ORD weather sensitivity: storms, winter ops, and banked connections raise variance.' },
  DEN: { impact: 9, detail: 'DEN weather sensitivity: thunderstorms, wind, or deicing windows can affect turns.' },
  DFW: { impact: 9, detail: 'DFW weather sensitivity: storm cells can create rolling delay programs.' },
  ATL: { impact: 7, detail: 'ATL weather sensitivity: high-volume banks can amplify late inbound aircraft.' },
  SEA: { impact: 7, detail: 'SEA weather sensitivity: low ceilings and rain can slow turns.' },
  HNL: { impact: 4, detail: 'HNL weather sensitivity: island operations are usually stable but backup frequencies matter.' },
  OGG: { impact: 5, detail: 'OGG weather sensitivity: fewer long-haul frequencies increase recovery exposure.' }
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function weatherRiskColor(category: WeatherRiskCategory) {
  if (category === 'Low') return '#22c55e'
  if (category === 'Moderate') return '#facc15'
  if (category === 'High') return '#fb7185'
  return '#f87171'
}

export function categoryFromWeatherImpact(scoreImpact: number): WeatherRiskCategory {
  if (scoreImpact >= 30) return 'Severe'
  if (scoreImpact >= 18) return 'High'
  if (scoreImpact >= 7) return 'Moderate'
  return 'Low'
}

export function getRouteWeatherRisk(route: string): WeatherRisk {
  const airports = airportCodesFromRoute(route)
  const matched = airports
    .map((code) => ({ code, seed: airportWeatherSeeds[code] }))
    .filter((item): item is { code: string; seed: AirportWeatherSeed } => Boolean(item.seed))
  const scoreImpact = clamp(matched.reduce((total, item) => total + item.seed.impact, 0), 0, 40)
  const category = categoryFromWeatherImpact(scoreImpact)
  const successProbabilityImpact = category === 'Severe' ? -12 : category === 'High' ? -8 : category === 'Moderate' ? -4 : 0
  const routeRankingImpact = category === 'Severe' ? -10 : category === 'High' ? -6 : category === 'Moderate' ? -3 : 0
  const unmatchedAirports = airports.filter((code) => !airportWeatherSeeds[code])

  return {
    category,
    scoreImpact,
    successProbabilityImpact,
    routeRankingImpact,
    source: placeholderWeatherProvider,
    status: 'placeholder',
    details: matched.length ? matched.map((item) => item.seed.detail) : ['No route-specific weather sensitivity matched in the placeholder provider.'],
    diagnostics: [
      'Live weather provider not configured; using placeholder route weather intelligence.',
      matched.length ? `Matched weather profiles: ${matched.map((item) => item.code).join(', ')}.` : 'No airport-specific placeholder weather profiles matched this route.',
      unmatchedAirports.length ? `No placeholder weather profile for: ${unmatchedAirports.join(', ')}.` : 'All route airports have placeholder weather profiles.'
    ]
  }
}
