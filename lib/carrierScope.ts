export type SupportedCarrierValue = 'all' | 'united' | 'delta' | 'alaska-group'

export const alaskaGroupAirlines = ['Alaska Airlines', 'Hawaiian Airlines']

export type RouteRecommendation = {
  rank: number
  route: string
  score: number
  risk: string
  carrier: string
}

export const supportedCarrierOptions: { value: SupportedCarrierValue; label: string }[] = [
  { value: 'all', label: 'All Supported Carriers' },
  { value: 'united', label: 'United' },
  { value: 'delta', label: 'Delta' },
  { value: 'alaska-group', label: 'Alaska Group (Alaska Airlines + Hawaiian Airlines)' }
]

export const carrierFamilyLabels: Record<SupportedCarrierValue, string> = {
  all: 'All Supported Carriers',
  united: 'United',
  delta: 'Delta',
  'alaska-group': 'Alaska Group'
}

export const carrierFamilyMembers: Record<SupportedCarrierValue, string[]> = {
  all: ['United', 'Delta', 'Alaska Airlines', 'Hawaiian Airlines'],
  united: ['United'],
  delta: ['Delta'],
  'alaska-group': alaskaGroupAirlines
}

export const carrierScoringProfiles: Record<Exclude<SupportedCarrierValue, 'all'>, { label: string; weights: Record<string, string>; routeIntelligence: Record<string, string>; routeRecommendations: Omit<RouteRecommendation, 'rank' | 'carrier'>[] }> = {
  united: {
    label: 'United',
    weights: {
      'Hub Strength': '40%',
      'Route Complexity': '20%',
      'Seasonal Demand': '20%',
      'Historical Performance': '20%'
    },
    routeIntelligence: {
      'Best Hub': 'DEN',
      'Alternate Routing': 'ORD or IAH backup path',
      'Risk Level': 'Medium',
      'Connection Count': '1 connection preferred'
    },
    routeRecommendations: [
      { route: 'LAX → DEN → HNL', score: 82, risk: 'Medium' },
      { route: 'SFO → ORD → EWR', score: 78, risk: 'Medium-Low' },
      { route: 'IAH → DEN → SEA', score: 74, risk: 'Medium' }
    ]
  },
  delta: {
    label: 'Delta',
    weights: {
      'Hub Strength': '40%',
      'Route Complexity': '20%',
      'Seasonal Demand': '20%',
      'Historical Performance': '20%'
    },
    routeIntelligence: {
      'Best Hub': 'ATL',
      'Alternate Routing': 'MSP or DTW backup path',
      'Risk Level': 'Medium-Low',
      'Connection Count': '1 connection preferred'
    },
    routeRecommendations: [
      { route: 'LAX → ATL → FLL', score: 84, risk: 'Medium-Low' },
      { route: 'SFO → MSP → JFK', score: 79, risk: 'Medium' },
      { route: 'SEA → DTW → BOS', score: 76, risk: 'Medium' }
    ]
  },
  'alaska-group': {
    label: 'Alaska Group',
    weights: {
      'Hub Strength': '40%',
      'Route Complexity': '20%',
      'Seasonal Demand': '20%',
      'Historical Performance': '20%'
    },
    routeIntelligence: {
      'Best Hub': 'SEA',
      'Alternate Routing': 'PDX, SFO, or HNL backup path',
      'Risk Level': 'Medium',
      'Connection Count': '0-1 connections preferred'
    },
    routeRecommendations: [
      { route: 'SEA → HNL', score: 83, risk: 'Medium' },
      { route: 'PDX → SEA → OGG', score: 80, risk: 'Medium' },
      { route: 'SFO → HNL → KOA', score: 77, risk: 'Medium-High' }
    ]
  }
}

export function normalizeCarrierFamily(value: string): SupportedCarrierValue {
  if (value === 'united' || value === 'delta' || value === 'alaska-group') return value
  return 'all'
}

export function getCarrierFamilySummary(value: string) {
  const carrier = normalizeCarrierFamily(value)
  return {
    value: carrier,
    label: carrierFamilyLabels[carrier],
    members: carrierFamilyMembers[carrier]
  }
}

function rankedRouteRecommendations(carrier: SupportedCarrierValue): RouteRecommendation[] {
  const profiles =
    carrier === 'all'
      ? Object.values(carrierScoringProfiles)
      : [carrierScoringProfiles[carrier]]

  return profiles
    .flatMap((profile) =>
      profile.routeRecommendations.map((recommendation) => ({
        ...recommendation,
        carrier: profile.label
      }))
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((recommendation, index) => ({
      ...recommendation,
      rank: index + 1
    }))
}

export function getCarrierScoringScaffold(value: string) {
  const carrier = normalizeCarrierFamily(value)
  const family = getCarrierFamilySummary(carrier)
  const profile = carrier === 'all' ? carrierScoringProfiles.united : carrierScoringProfiles[carrier]

  return {
    carrier,
    familyLabel: family.label,
    selectedCarrier: profile.label,
    recommendationScope: carrier === 'all' ? 'United, Delta, and Alaska Group' : family.label,
    members: family.members,
    weights: profile.weights,
    routeIntelligence: profile.routeIntelligence,
    routeRecommendations: rankedRouteRecommendations(carrier),
    breakdown: [
      { label: 'Overall Score', value: '82', note: `Placeholder composite score for ${family.label}` },
      { label: 'Hub Strength', value: '8/10', note: `Weight ${profile.weights['Hub Strength']} · Hub signal scaffold treats ${family.members.join(' + ')} as ${family.label}` },
      { label: 'Route Complexity', value: 'Moderate', note: `Weight ${profile.weights['Route Complexity']} · Connection and fallback complexity placeholder` },
      { label: 'Seasonal Demand', value: 'Medium', note: `Weight ${profile.weights['Seasonal Demand']} · Holiday and peak-travel demand scaffold` },
      { label: 'Historical Performance', value: 'Good', note: `Weight ${profile.weights['Historical Performance']} · Future outcome history signal placeholder` }
    ]
  }
}
