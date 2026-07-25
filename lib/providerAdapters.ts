import { createAviationstackExecutionProvider, type AviationstackExecutionProviderOptions } from './aviationstackExecutionProvider'
import {
  ProviderManager,
  type ProviderHealth,
  type ProviderMetadata,
  type StandardFlightProvider,
  type StandardProviderSearchResult
} from './providerManager'
import {
  type SearchExecutionProviderCapabilities,
  type SearchExecutionProviderReadiness,
  type SearchExecutionRequest
} from './searchExecutionEngine'

type PlaceholderProviderOptions = {
  id: string
  name: string
  message: string
  capabilities: SearchExecutionProviderCapabilities
  confidenceWeight?: number
}

function nowIso() {
  return new Date().toISOString()
}

function skippedResult(name: string, message: string): StandardProviderSearchResult {
  return {
    itineraries: [],
    status: 'skipped',
    warnings: [`${name} skipped: ${message}`],
    diagnostics: {
      lastRequestStatus: 'disabled',
      responseLatencyMs: 0,
      recordsReceived: 0,
      recordsNormalized: 0,
      recordsMatched: 0,
      recordsUnmatched: 0,
      errorCategory: 'unsupported_request',
      retryUsed: false,
      fetchedAt: nowIso(),
      cached: false,
      requestCount: 0
    }
  }
}

function providerHealth(metadata: ProviderMetadata, readiness: SearchExecutionProviderReadiness): ProviderHealth {
  return {
    providerId: metadata.id,
    providerName: metadata.name,
    status: readiness.status,
    enabled: readiness.enabled,
    checkedAt: nowIso(),
    responseLatencyMs: 0,
    confidenceWeight: metadata.confidenceWeight,
    recordsReceived: 0,
    recordsNormalized: 0,
    warnings: readiness.message ? [readiness.message] : []
  }
}

export function createAviationstackManagedProvider(options: AviationstackExecutionProviderOptions = {}): StandardFlightProvider {
  const executionProvider = createAviationstackExecutionProvider(options)
  const metadata: ProviderMetadata = {
    id: executionProvider.id,
    name: executionProvider.name,
    enabled: executionProvider.readiness.enabled,
    confidenceWeight: 58,
    capabilities: executionProvider.capabilities
  }
  return {
    searchFlights: (request: SearchExecutionRequest) => executionProvider.search(request),
    searchSchedules: (request: SearchExecutionRequest) => executionProvider.search(request),
    async healthCheck() {
      return providerHealth(metadata, executionProvider.readiness)
    },
    providerMetadata() {
      return metadata
    }
  }
}

export function createPlaceholderFlightProvider(options: PlaceholderProviderOptions): StandardFlightProvider {
  const metadata: ProviderMetadata = {
    id: options.id,
    name: options.name,
    enabled: false,
    placeholder: true,
    confidenceWeight: options.confidenceWeight || 0,
    capabilities: options.capabilities
  }
  const readiness: SearchExecutionProviderReadiness = {
    enabled: false,
    status: 'disabled',
    message: options.message
  }
  return {
    async searchFlights() {
      return skippedResult(options.name, options.message)
    },
    async searchSchedules() {
      return skippedResult(options.name, options.message)
    },
    async healthCheck() {
      return providerHealth(metadata, readiness)
    },
    providerMetadata() {
      return metadata
    }
  }
}

export function createGoogleFlightsParserPlaceholder() {
  return createPlaceholderFlightProvider({
    id: 'google-flights-parser',
    name: 'Google Flights parser placeholder',
    message: 'Parser integration is not enabled for beta; no scraping or schedule inference is performed.',
    capabilities: { schedules: false, routeSearch: false, loads: false, fares: false, zedEligibility: false }
  })
}

export function createStaffTravelerPlaceholder() {
  return createPlaceholderFlightProvider({
    id: 'stafftraveler',
    name: 'Future StaffTraveler adapter',
    message: 'StaffTraveler adapter is reserved for a future approved integration and returns no beta data.',
    capabilities: { schedules: false, routeSearch: false, loads: true, fares: false, zedEligibility: false }
  })
}

export function createMyIdTravelPlaceholder() {
  return createPlaceholderFlightProvider({
    id: 'myidtravel',
    name: 'Future myIDTravel adapter',
    message: 'myIDTravel adapter is reserved for a future approved integration and returns no beta data.',
    capabilities: { schedules: false, routeSearch: false, loads: false, fares: true, zedEligibility: true }
  })
}

export function createZedPlaceholder() {
  return createPlaceholderFlightProvider({
    id: 'zed',
    name: 'Future ZED adapter',
    message: 'ZED adapter is reserved for future agreement verification and returns no live availability.',
    capabilities: { schedules: false, routeSearch: false, loads: false, fares: false, zedEligibility: true }
  })
}

export function createDefaultProviderManager(options: AviationstackExecutionProviderOptions & { timeoutMs?: number } = {}) {
  return new ProviderManager({
    timeoutMs: options.timeoutMs,
    providers: [
      createAviationstackManagedProvider(options),
      createGoogleFlightsParserPlaceholder(),
      createStaffTravelerPlaceholder(),
      createMyIdTravelPlaceholder(),
      createZedPlaceholder()
    ]
  })
}

