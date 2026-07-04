export type ItineraryDisplayLeg = {
  origin?: string
  destination?: string
}

export type ItineraryDisplayInput = {
  route?: string
  legs?: ItineraryDisplayLeg[]
  connections?: number
}

export type ItineraryDisplayIntegrity = {
  displayRoute: string
  displayAirports: string[]
  displayConnectionCount: number
  routeAirports: string[]
  legAirports: string[]
  routeMatchesLegs: boolean
  rebuiltFromLegs: boolean
  warning?: string
}

function airportCode(value?: string) {
  const normalized = value?.trim().toUpperCase()
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : undefined
}

export function airportCodesFromDisplayRoute(route?: string) {
  return (route || '')
    .split('→')
    .map((part) => airportCode(part.match(/[A-Za-z]{3}/)?.[0]))
    .filter((code): code is string => Boolean(code))
}

export function airportPathFromDisplayLegs(legs?: ItineraryDisplayLeg[]) {
  const path: string[] = []
  ;(legs || []).forEach((leg) => {
    const origin = airportCode(leg.origin)
    const destination = airportCode(leg.destination)
    if (!origin || !destination) return
    if (!path.length) path.push(origin)
    if (path[path.length - 1] !== origin) path.push(origin)
    path.push(destination)
  })
  return path
}

function sameAirportPath(left: string[], right: string[]) {
  return left.length === right.length && left.every((code, index) => code === right[index])
}

export function itineraryDisplayIntegrityFor(input: ItineraryDisplayInput): ItineraryDisplayIntegrity {
  const routeAirports = airportCodesFromDisplayRoute(input.route)
  const legAirports = airportPathFromDisplayLegs(input.legs)
  const hasLegPath = legAirports.length >= 2
  const displayAirports = hasLegPath ? legAirports : routeAirports
  const displayRoute = displayAirports.length >= 2 ? displayAirports.join(' → ') : (input.route || '').trim()
  const displayConnectionCount = Math.max(0, displayAirports.length - 2)
  const routeMatchesLegs = !hasLegPath || sameAirportPath(routeAirports, legAirports)
  const rebuiltFromLegs = hasLegPath && !routeMatchesLegs

  return {
    displayRoute,
    displayAirports,
    displayConnectionCount,
    routeAirports,
    legAirports,
    routeMatchesLegs,
    rebuiltFromLegs,
    warning: rebuiltFromLegs
      ? 'Displayed route rebuilt from generated legs so itinerary cards and details do not omit connections.'
      : undefined
  }
}
