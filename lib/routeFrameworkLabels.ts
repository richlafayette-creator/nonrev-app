export const routeFrameworkOnlyBadge = 'Route framework only'
export const liveAvailabilityUnavailableBadge = 'Live availability unavailable'
export const routeFrameworkDataFreshnessLabel = 'Route framework only — live availability unavailable'
export const routeFrameworkSourceLabel = 'Route frameworks only — live availability unavailable'
export const routeFrameworkWarning = 'Route framework only. This is planning guidance, not live availability; flight numbers, times, loads, and standby clearance remain unavailable until provider data returns them.'

export type RouteFrameworkLabeledItem = {
  source?: string
  sourceProvider?: string
  providerBadges?: string[]
  dataFreshnessLabel?: string
  dataFreshnessDetail?: string
  dataFreshnessRule?: string
  dataFreshnessWarning?: string
  productionAvailability?: boolean
  isLive?: boolean
  status?: string
  legs?: Array<{
    source?: string
    sourceProvider?: string
    status?: string
    flightNumber?: string
    departureTime?: string
    arrivalTime?: string
  }>
}

export function routeFrameworkProviderBadges(existing: string[] = []) {
  return [...new Set([routeFrameworkOnlyBadge, liveAvailabilityUnavailableBadge, ...existing])]
}

export function isRouteFrameworkLabeled(item: RouteFrameworkLabeledItem) {
  return item.dataFreshnessRule === 'route-framework' || item.source === 'route-framework' || item.sourceProvider === 'route-framework'
}

export function ensureRouteFrameworkLabels<T extends RouteFrameworkLabeledItem>(item: T): T {
  if (!isRouteFrameworkLabeled(item)) return item

  return {
    ...item,
    source: 'source' in item ? 'route-framework' : item.source,
    sourceProvider: 'sourceProvider' in item ? 'route-framework' : item.sourceProvider,
    providerBadges: routeFrameworkProviderBadges(item.providerBadges),
    dataFreshnessLabel: routeFrameworkDataFreshnessLabel,
    dataFreshnessRule: 'route-framework',
    dataFreshnessWarning: routeFrameworkWarning,
    productionAvailability: 'productionAvailability' in item ? false : item.productionAvailability,
    isLive: 'isLive' in item ? false : item.isLive,
    status: item.status && /route framework|live availability unavailable|planning guidance/i.test(item.status)
      ? item.status
      : routeFrameworkWarning,
    legs: item.legs?.map((leg) => ({
      ...leg,
      source: 'source' in leg ? 'route-framework' : leg.source,
      sourceProvider: 'sourceProvider' in leg ? 'route-framework' : leg.sourceProvider,
      status: leg.status && /route framework|live availability unavailable|waiting for live schedule|planning guidance/i.test(leg.status)
        ? leg.status
        : 'Route framework leg only; live availability unavailable.',
      flightNumber: leg.flightNumber && !/unavailable|pending|tbd/i.test(leg.flightNumber)
        ? leg.flightNumber
        : 'Flight numbers unavailable',
      departureTime: leg.departureTime && !/pending|unavailable/i.test(leg.departureTime)
        ? leg.departureTime
        : 'Pending live schedule',
      arrivalTime: leg.arrivalTime && !/pending|unavailable/i.test(leg.arrivalTime)
        ? leg.arrivalTime
        : 'Pending live schedule'
    }))
  }
}
