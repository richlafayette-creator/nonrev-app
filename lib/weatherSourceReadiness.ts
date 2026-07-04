export type WeatherSourceReadinessStatus = 'adapter-ready' | 'credential-configured' | 'credential-missing' | 'not-implemented'
export type WeatherProvider =
  | 'Placeholder Weather Intelligence'
  | 'NOAA'
  | 'National Weather Service'
  | 'AviationWeather.gov / METAR / TAF'
  | 'Tomorrow.io'
  | 'OpenWeather'
  | 'FlightAware weather alerts'
  | 'Unknown'

export type WeatherSourceReadiness = {
  provider: WeatherProvider
  status: WeatherSourceReadinessStatus
  credentialEnvVar?: string
  liveCallsEnabled: false
  advisoryOnly: true
  canProvide: string[]
  cannotProvide: string[]
  nextAction: string
}

export const weatherIntelligenceFutureDataSources: WeatherProvider[] = [
  'NOAA',
  'National Weather Service',
  'AviationWeather.gov / METAR / TAF',
  'Tomorrow.io',
  'OpenWeather',
  'FlightAware weather alerts'
]

const weatherSourceCapabilities: Array<Omit<WeatherSourceReadiness, 'status' | 'liveCallsEnabled' | 'advisoryOnly'>> = [
  {
    provider: 'NOAA',
    canProvide: ['Public weather observations and forecast context once an adapter is approved.'],
    cannotProvide: ['Confirmed flight delay, cancellation, standby, or seat availability.'],
    nextAction: 'Add a server-side NOAA adapter with timeout, cache, and advisory-only labels.'
  },
  {
    provider: 'National Weather Service',
    canProvide: ['Public forecast office alerts and gridpoint forecasts once an adapter is approved.'],
    cannotProvide: ['Guaranteed airport operating rates or non-rev clearance probability.'],
    nextAction: 'Map airports to NWS gridpoints/stations before enabling live calls.'
  },
  {
    provider: 'AviationWeather.gov / METAR / TAF',
    canProvide: ['Aviation observations/forecasts such as METAR and TAF once an adapter is approved.'],
    cannotProvide: ['Seat inventory, standby lists, or airline-specific recovery commitments.'],
    nextAction: 'Opt-in METAR adapter exists; next wire it behind server-side cache and explicit feature flag before route weather uses live calls.'
  },
  {
    provider: 'Tomorrow.io',
    credentialEnvVar: 'TOMORROW_IO_API_KEY',
    canProvide: ['Commercial forecast layers if credentials are configured and use is approved.'],
    cannotProvide: ['Airline operational decisions or confirmed passenger outcomes.'],
    nextAction: 'Keep disabled until credentials, budget, and request limits are explicitly approved.'
  },
  {
    provider: 'OpenWeather',
    credentialEnvVar: 'OPENWEATHER_API_KEY',
    canProvide: ['General forecast/observation context if credentials are configured and use is approved.'],
    cannotProvide: ['Aviation-specific METAR/TAF certainty unless separately validated.'],
    nextAction: 'Keep disabled until credentials, budget, and request limits are explicitly approved.'
  },
  {
    provider: 'FlightAware weather alerts',
    credentialEnvVar: 'FLIGHTAWARE_API_KEY',
    canProvide: ['Aviation-adjacent weather alerts if the approved FlightAware plan exposes them.'],
    cannotProvide: ['Load factors, non-rev list position, or guaranteed flight operation.'],
    nextAction: 'Verify endpoint availability and plan limits before adding weather-alert calls.'
  }
]

function hasCredential(env: Record<string, string | undefined>, key?: string) {
  return Boolean(key && env[key]?.trim())
}

export function getWeatherSourceReadiness(env: Record<string, string | undefined> = process.env): WeatherSourceReadiness[] {
  return weatherSourceCapabilities.map((source) => {
    const needsCredential = Boolean(source.credentialEnvVar)
    return {
      ...source,
      status: needsCredential
        ? hasCredential(env, source.credentialEnvVar) ? 'credential-configured' : 'credential-missing'
        : 'adapter-ready',
      liveCallsEnabled: false,
      advisoryOnly: true
    }
  })
}
