import type { CommunityLoadReport } from './communityLoads'

type CommunityLoadSearch = {
  flightNumber?: string
  route?: string
  origin?: string
  destination?: string
  date?: string
  carrier?: string
}

const serverCommunityLoads: CommunityLoadReport[] = []

function normalized(value?: string) {
  return String(value || '').trim().toUpperCase()
}

export function addServerCommunityLoadReport(report: CommunityLoadReport) {
  serverCommunityLoads.unshift(report)
  serverCommunityLoads.splice(500)
  return report
}

export function listServerCommunityLoadReports() {
  return [...serverCommunityLoads]
}

export function findServerCommunityLoadReports(search: CommunityLoadSearch = {}) {
  const flightNumber = normalized(search.flightNumber).replace(/\s+/g, '')
  const route = normalized(search.route)
  const origin = normalized(search.origin)
  const destination = normalized(search.destination)
  const date = String(search.date || '')
  const carrier = normalized(search.carrier)

  return serverCommunityLoads.filter((report) => {
    const reportRoute = normalized(report.route)
    const routeMatches = !route || reportRoute === route || reportRoute.includes(route) || route.includes(reportRoute)
    const originMatches = !origin || normalized(report.origin) === origin || reportRoute.includes(origin)
    const destinationMatches = !destination || normalized(report.destination) === destination || reportRoute.includes(destination)
    const flightMatches = !flightNumber || normalized(report.flightNumber).replace(/\s+/g, '') === flightNumber
    const dateMatches = !date || report.date === date
    const carrierMatches = !carrier || carrier === 'ALL' || normalized(report.carrier).includes(carrier) || normalized(report.flightNumber).startsWith(carrier)
    return routeMatches && originMatches && destinationMatches && flightMatches && dateMatches && carrierMatches
  })
}
