export type WeatherIntegrationFlagStatus = 'enabled' | 'disabled'
export type WeatherIntegrationReadinessLevel = 'disabled' | 'partial' | 'cache-read-ready' | 'server-refresh-ready'

export type WeatherIntegrationGate = {
  flag: WeatherIntegrationFlagName
  status: WeatherIntegrationFlagStatus
  purpose: string
  requiredFor: 'cached-route-weather' | 'cache-population' | 'server-refresh' | 'prefetch' | 'scheduler'
}

export type WeatherIntegrationFlagName =
  | 'NONREV_ROUTE_LIVE_WEATHER_ENABLED'
  | 'NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED'
  | 'NONREV_SERVER_WEATHER_REFRESH_ENABLED'
  | 'NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED'
  | 'NONREV_SERVER_WEATHER_REFRESH_SCHEDULER_ENABLED'

export type WeatherIntegrationReadiness = {
  readinessLevel: WeatherIntegrationReadinessLevel
  advisoryOnly: true
  clientLiveCallsAllowed: false
  appliesToScoring: false
  unknownWeatherNeutral: true
  gates: WeatherIntegrationGate[]
  enabledFlags: WeatherIntegrationFlagName[]
  disabledFlags: WeatherIntegrationFlagName[]
  diagnostics: string[]
  limitations: string[]
}

const weatherIntegrationGateDefinitions: Array<Omit<WeatherIntegrationGate, 'status'>> = [
  {
    flag: 'NONREV_ROUTE_LIVE_WEATHER_ENABLED',
    purpose: 'Allows route weather to read fresh cached observations as advisory route context.',
    requiredFor: 'cached-route-weather'
  },
  {
    flag: 'NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED',
    purpose: 'Allows server-side AviationWeather.gov cache population when explicitly invoked.',
    requiredFor: 'cache-population'
  },
  {
    flag: 'NONREV_SERVER_WEATHER_REFRESH_ENABLED',
    purpose: 'Allows server-side weather refresh orchestration to populate cache entries.',
    requiredFor: 'server-refresh'
  },
  {
    flag: 'NONREV_INTERNAL_WEATHER_PREFETCH_ENABLED',
    purpose: 'Allows API-internal/server-action prefetch hooks to request weather refreshes.',
    requiredFor: 'prefetch'
  },
  {
    flag: 'NONREV_SERVER_WEATHER_REFRESH_SCHEDULER_ENABLED',
    purpose: 'Allows the server-side scheduler wrapper to trigger weather refreshes.',
    requiredFor: 'scheduler'
  }
]

const limitations = [
  'Weather integrations are advisory only and do not confirm operational disruption, cancellation, delay, seat inventory, or standby availability.',
  'Unknown, missing, stale, disabled, or partial weather integrations must remain neutral for itinerary scoring and ranking.',
  'Weather integration readiness never permits client-side provider calls or airline website scraping.'
]

function flagStatus(env: Record<string, string | undefined>, flag: WeatherIntegrationFlagName): WeatherIntegrationFlagStatus {
  return String(env[flag] || '').trim().toLowerCase() === 'true' ? 'enabled' : 'disabled'
}

function readinessLevel(enabled: Set<WeatherIntegrationFlagName>): WeatherIntegrationReadinessLevel {
  if (!enabled.size) return 'disabled'
  if (!enabled.has('NONREV_ROUTE_LIVE_WEATHER_ENABLED')) return 'partial'
  if (enabled.has('NONREV_SERVER_WEATHER_REFRESH_ENABLED') && enabled.has('NONREV_AVIATION_WEATHER_CACHE_POPULATION_ENABLED')) return 'server-refresh-ready'
  return 'cache-read-ready'
}

export function getWeatherIntegrationReadiness(env: Record<string, string | undefined> = process.env): WeatherIntegrationReadiness {
  const gates = weatherIntegrationGateDefinitions.map((gate) => ({ ...gate, status: flagStatus(env, gate.flag) }))
  const enabledFlags = gates.filter((gate) => gate.status === 'enabled').map((gate) => gate.flag)
  const disabledFlags = gates.filter((gate) => gate.status === 'disabled').map((gate) => gate.flag)
  const enabledSet = new Set(enabledFlags)
  const level = readinessLevel(enabledSet)
  const diagnostics = [
    level === 'disabled'
      ? 'Weather integration flags are disabled; route weather remains unknown and neutral.'
      : level === 'partial'
        ? 'Some weather integration flags are enabled, but route weather cache reads are not fully enabled.'
        : level === 'cache-read-ready'
          ? 'Route weather can read fresh cached observations if present; refresh/population may still require separate server-side flags.'
          : 'Route weather cache read and server refresh gates are enabled; provider failures must still fail closed and remain advisory.',
    'Client-side live weather provider calls remain disallowed by this readiness contract.'
  ]

  return {
    readinessLevel: level,
    advisoryOnly: true,
    clientLiveCallsAllowed: false,
    appliesToScoring: false,
    unknownWeatherNeutral: true,
    gates,
    enabledFlags,
    disabledFlags,
    diagnostics,
    limitations
  }
}
