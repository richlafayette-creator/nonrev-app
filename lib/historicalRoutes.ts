import { type SupportedCarrierValue, normalizeCarrierFamily } from './carrierScope'

export type HistoricalRoute = {
  carrier: 'United' | 'Delta' | 'Alaska Group'
  route: string
  score: number
  successRate: number
  reportCount: number
  notes: string
}

export const historicalRoutes: HistoricalRoute[] = [
  {
    carrier: 'United',
    route: 'LAX → DEN → HNL',
    score: 82,
    successRate: 74,
    reportCount: 18,
    notes: 'DEN connection keeps recovery options open when Hawaii loads tighten.'
  },
  {
    carrier: 'United',
    route: 'SFO → ORD → EWR',
    score: 78,
    successRate: 71,
    reportCount: 14,
    notes: 'Hub-to-hub frequency gives this route a stronger backup profile.'
  },
  {
    carrier: 'Delta',
    route: 'LAX → ATL → FLL',
    score: 84,
    successRate: 77,
    reportCount: 16,
    notes: 'ATL routing has strong daily frequency and workable fallback banks.'
  },
  {
    carrier: 'Delta',
    route: 'SEA → DTW → BOS',
    score: 76,
    successRate: 69,
    reportCount: 11,
    notes: 'Medium risk placeholder because eastbound demand can compress options.'
  },
  {
    carrier: 'Alaska Group',
    route: 'SEA → HNL',
    score: 83,
    successRate: 75,
    reportCount: 13,
    notes: 'Strong SEA leisure route, but Hawaii seasonality still needs monitoring.'
  },
  {
    carrier: 'Alaska Group',
    route: 'PDX → SEA → OGG',
    score: 80,
    successRate: 72,
    reportCount: 10,
    notes: 'SEA backup path gives this scaffold better resilience than a single nonstop.'
  }
]

const carrierLabels: Record<Exclude<SupportedCarrierValue, 'all'>, HistoricalRoute['carrier']> = {
  united: 'United',
  delta: 'Delta',
  'alaska-group': 'Alaska Group'
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export function routesForCarrier(value: string) {
  const carrier = normalizeCarrierFamily(value)
  if (carrier === 'all') return historicalRoutes
  return historicalRoutes.filter((route) => route.carrier === carrierLabels[carrier])
}

export function historicalRouteStats(value: string) {
  const routes = routesForCarrier(value)
  const averageScore = average(routes.map((route) => route.score))
  const averageSuccessRate = average(routes.map((route) => route.successRate))
  const reportCount = routes.reduce((total, route) => total + route.reportCount, 0)
  const topRoute = [...routes].sort((a, b) => b.score - a.score)[0]

  return {
    routes,
    averageScore,
    averageSuccessRate,
    reportCount,
    topRoute,
    explanation: topRoute
      ? `Historical route scaffold: ${routes.length} route samples, ${averageScore} average score, ${averageSuccessRate}% average success rate, ${reportCount} placeholder reports. Top sample: ${topRoute.route}.`
      : 'Historical route scaffold pending for this carrier.'
  }
}
