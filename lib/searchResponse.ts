import { getGroundTransportProviderReadiness } from './groundTransportReadiness'
import { getHotelProviderReadiness } from './hotelProviderReadiness'
import { providerInfrastructureSnapshot } from './providerInfrastructure'
import { runSearchPipeline, runSearchPipelineWithExecution, type SearchPipelineOptions, type SearchResult } from './searchPipeline'
import { toSearchPipelineRequest } from './searchRequest'
import { validateSearchRequest, type SearchValidationIssue } from './searchValidation'
import { getWeatherIntegrationReadiness } from './weatherIntegrationReadiness'

export type SearchProviderReadiness = {
  schedule: Array<{
    provider: string
    label: string
    enabled: boolean
    credentialConfigured: boolean
    missingEnvKeys: string[]
    healthStatus?: string
  }>
  groundTransport: ReturnType<typeof getGroundTransportProviderReadiness>
  hotel: ReturnType<typeof getHotelProviderReadiness>
  weather: ReturnType<typeof getWeatherIntegrationReadiness>
  limitations: string[]
}

export type SearchApiSuccessResponse = {
  id: string
  generatedAt: string
  tripType: SearchResult['tripType']
  planA?: SearchResult['recommendations']['planA']
  planB?: SearchResult['recommendations']['planB']
  planC?: SearchResult['recommendations']['planC']
  warnings: string[]
  confidence: SearchResult['confidence']
  recommendations: SearchResult['recommendations']
  recommendationDetails: Array<{
    id: string
    label: 'Plan A' | 'Plan B' | 'Plan C'
    rank: number
    status: string
    gateway: string
    finalScore: number
    confidence: number
    estimatedSuccess: number
    wholePartyZedEligible: boolean
    eligibleZedAirlines: string[]
    strengths: string[]
    weaknesses: string[]
    switchConditions: string[]
    risks: Array<{ code: string; title: string; description: string; severity: string; trigger?: string }>
    dataWarnings: string[]
  }>
  dataQuality: SearchResult['recommendationResult']['dataQuality']
  segments: SearchResult['segments']
  timeline: SearchResult['timeline']
  summary: string
  fallbacks: SearchResult['fallbacks']
  providerReadiness: SearchProviderReadiness
  providerRuns: SearchResult['providerRuns']
  unknownScheduleIndicators: string[]
  itineraries: SearchResult['itineraries']
  pipelineTrace: SearchResult['pipelineTrace']
  missingData: string[]
}

export type SearchApiErrorResponse = {
  error: string
  code: string
  status: 400 | 422 | 500
  issues?: SearchValidationIssue[]
}

export type ExecuteSearchApiOptions = {
  now?: Date
  env?: Record<string, string | undefined>
  pipelineOptions?: Omit<SearchPipelineOptions, 'now'>
  runPipeline?: typeof runSearchPipeline
}

export type ExecuteSearchApiResult =
  | { status: 200; body: SearchApiSuccessResponse }
  | { status: 400 | 422 | 500; body: SearchApiErrorResponse }

function providerReadiness(env: Record<string, string | undefined> = process.env): SearchProviderReadiness {
  return {
    schedule: providerInfrastructureSnapshot(undefined, env).map((snapshot) => ({
      provider: snapshot.config.key,
      label: snapshot.config.label,
      enabled: snapshot.config.enabled,
      credentialConfigured: snapshot.credentialState.configured,
      missingEnvKeys: snapshot.credentialState.missingEnvKeys,
      healthStatus: snapshot.health?.status
    })),
    groundTransport: getGroundTransportProviderReadiness(env),
    hotel: getHotelProviderReadiness(env),
    weather: getWeatherIntegrationReadiness(env),
    limitations: [
      'Search API returns route frameworks, not guaranteed seats or live standby availability.',
      'Flight numbers, operating times, load counts, weather, hotels, and ground transport remain unknown unless a readiness-approved provider supplies verified data.',
      'Provider credentials and health are reported without exposing secret values.'
    ]
  }
}

export function serializeSearchResult(result: SearchResult, env?: Record<string, string | undefined>): SearchApiSuccessResponse {
  return {
    id: result.id,
    generatedAt: result.generatedAt,
    tripType: result.tripType,
    planA: result.recommendations.planA,
    planB: result.recommendations.planB,
    planC: result.recommendations.planC,
    warnings: result.warnings,
    confidence: result.confidence,
    recommendations: result.recommendations,
    recommendationDetails: result.recommendationResult.recommendations.map((recommendation) => ({
      id: recommendation.id,
      label: recommendation.label,
      rank: recommendation.rank,
      status: recommendation.status,
      gateway: recommendation.plan.gateway,
      finalScore: recommendation.finalScore,
      confidence: recommendation.confidence,
      estimatedSuccess: recommendation.estimatedSuccess,
      wholePartyZedEligible: recommendation.wholePartyZedEligible,
      eligibleZedAirlines: recommendation.eligibleZedAirlines,
      strengths: recommendation.explanation.strengths,
      weaknesses: recommendation.explanation.weaknesses,
      switchConditions: recommendation.explanation.switchConditions,
      risks: recommendation.risks.map((risk) => ({
        code: risk.code,
        title: risk.title,
        description: risk.description,
        severity: risk.severity,
        ...(risk.trigger ? { trigger: risk.trigger } : {})
      })),
      dataWarnings: recommendation.dataWarnings
    })),
    dataQuality: result.recommendationResult.dataQuality,
    segments: result.segments,
    timeline: result.timeline,
    summary: result.summary,
    fallbacks: result.fallbacks,
    providerReadiness: providerReadiness(env),
    providerRuns: result.providerRuns,
    unknownScheduleIndicators: result.unknownScheduleIndicators,
    itineraries: result.itineraries,
    pipelineTrace: result.pipelineTrace,
    missingData: result.missingData
  }
}

export function executeSearchApi(body: unknown, options: ExecuteSearchApiOptions = {}): ExecuteSearchApiResult {
  const validation = validateSearchRequest(body)
  if (!validation.ok) {
    return {
      status: validation.status,
      body: {
        error: validation.status === 400 ? 'Invalid search request.' : 'Search request failed validation.',
        code: validation.code,
        status: validation.status,
        issues: validation.issues
      }
    }
  }

  try {
    const pipelineRequest = toSearchPipelineRequest(validation.request)
    const runPipeline = options.runPipeline || runSearchPipeline
    const result = runPipeline(pipelineRequest, {
      ...options.pipelineOptions,
      now: options.now
    })
    return { status: 200, body: serializeSearchResult(result, options.env) }
  } catch (error) {
    return {
      status: 500,
      body: {
        error: 'Search pipeline failed unexpectedly.',
        code: 'search_pipeline_failed',
        status: 500,
        issues: [{ field: 'pipeline', message: error instanceof Error ? error.message : String(error) }]
      }
    }
  }
}

export async function executeSearchApiAsync(body: unknown, options: ExecuteSearchApiOptions = {}): Promise<ExecuteSearchApiResult> {
  const validation = validateSearchRequest(body)
  if (!validation.ok) {
    return {
      status: validation.status,
      body: {
        error: validation.status === 400 ? 'Invalid search request.' : 'Search request failed validation.',
        code: validation.code,
        status: validation.status,
        issues: validation.issues
      }
    }
  }

  try {
    const pipelineRequest = toSearchPipelineRequest(validation.request)
    const result = await runSearchPipelineWithExecution(pipelineRequest, {
      ...options.pipelineOptions,
      now: options.now
    })
    return { status: 200, body: serializeSearchResult(result, options.env) }
  } catch (error) {
    return {
      status: 500,
      body: {
        error: 'Search pipeline failed unexpectedly.',
        code: 'search_pipeline_failed',
        status: 500,
        issues: [{ field: 'pipeline', message: error instanceof Error ? error.message : String(error) }]
      }
    }
  }
}
