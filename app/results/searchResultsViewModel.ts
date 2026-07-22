import { type BetaSearchStoredResult } from '../../lib/betaSearchClient'
import { type SearchApiSuccessResponse } from '../../lib/searchResponse'

export type SearchResultsViewModel = {
  title: string
  subtitle: string
  dataQualityLabel: string
  staticOnlyNotice: string
  providerReadinessLabel: string
  warnings: string[]
  missingData: string[]
  hasStoredResult: boolean
  mobileStructure: {
    usesSingleColumnCards: boolean
    hasSemanticHeadings: boolean
    hasTapTargets: boolean
  }
  cards: SearchPlanCardViewModel[]
}

export type SearchPlanCardViewModel = {
  key: string
  label: 'Plan A' | 'Plan B' | 'Plan C'
  rank: number
  status: string
  gateway: string
  destinationLabel: string
  destinationContext: string
  finalScore: number
  confidence: number
  planningSuccessScore: number
  planningScoreNote: string
  wholePartyZedLabel: string
  eligibleZedAirlinesLabel: string
  shortSummary: string
  strengths: string[]
  weaknesses: string[]
  risks: string[]
  switchConditions: string[]
  transportModes: string[]
  fallbacks: string[]
  dataWarnings: string[]
  dataQualityLevel: SearchApiSuccessResponse['dataQuality']
  unknownIndicators: string[]
  segments: SearchSegmentViewModel[]
}

export type SearchSegmentViewModel = {
  key: string
  origin: string
  destination: string
  transportType: string
  carrierLabel: string
  notes: string[]
  scheduleStatus: string
  loadStatus: string
}

const planningScoreNote = 'This is a planning score based on available signals, not a guarantee of boarding.'

function clampScore(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function knownText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() && !/^unknown\b/i.test(value.trim()) ? value.trim() : fallback
}

function scheduleStatus(schedule: SearchApiSuccessResponse['segments'][number]['schedule']) {
  const values = [schedule.flightNumber, schedule.departureTime, schedule.arrivalTime]
  return values.some((value) => /^unknown\b/i.test(value)) ? 'Schedule not yet verified' : 'Schedule verified'
}

function loadStatus(schedule: SearchApiSuccessResponse['segments'][number]['schedule']) {
  return /^unknown\b/i.test(schedule.seatCount) ? 'Live load unavailable' : schedule.seatCount
}

function zedLabel(detail: SearchApiSuccessResponse['recommendationDetails'][number] | undefined) {
  if (!detail) return 'Carrier unknown'
  const text = [
    ...detail.dataWarnings,
    ...detail.risks.map((risk) => `${risk.code} ${risk.title} ${risk.description}`)
  ].join(' ').toLowerCase()
  if (/stale-zed-verification|stale or expired/.test(text)) return 'Agreement stale'
  if (/carrier codes unavailable|carrier unknown|zed eligibility cannot be carrier-confirmed/.test(text)) return 'Carrier unknown'
  if (detail.wholePartyZedEligible) return 'Entire party eligible'
  if (detail.eligibleZedAirlines.length) return 'Partially eligible'
  return 'No verified agreement'
}

function fallbackSummaries(fallbacks: SearchApiSuccessResponse['fallbacks']) {
  return uniqueStrings(fallbacks.map((fallback) => `${fallback.label}: ${fallback.summary}`))
}

function dataQualityLabel(value: SearchApiSuccessResponse['dataQuality']) {
  return `Data quality: ${value}`
}

function providerReadinessLabel(result: SearchApiSuccessResponse) {
  const configured = result.providerReadiness.schedule.filter((provider) => provider.enabled && provider.credentialConfigured).length
  const enabled = result.providerReadiness.schedule.filter((provider) => provider.enabled).length
  if (!enabled) return 'Schedule providers are not enabled.'
  if (!configured) return 'Schedule providers are enabled but credentials are not configured.'
  return `${configured} of ${enabled} enabled schedule provider${enabled === 1 ? '' : 's'} configured.`
}

function staticOnlyNotice(result: SearchApiSuccessResponse) {
  const text = [
    ...result.warnings,
    ...result.unknownScheduleIndicators,
    ...result.missingData
  ].join(' ').toLowerCase()
  if (/live|unknown|not attached|unavailable|not provided/.test(text)) {
    return 'Current recommendations use route and profile intelligence. Live schedules and standby loads are not yet connected.'
  }
  return 'Recommendations include only the data returned by the beta search API.'
}

function cardDestination(stored: BetaSearchStoredResult) {
  if (stored.destination.mode === 'region') {
    return {
      destinationLabel: stored.destination.label,
      destinationContext: `Region search: ${stored.destination.label}. ${stored.destination.placeholderAirport || 'A schema-safe airport'} was used only to satisfy the API request and is not the final destination.`
    }
  }
  return {
    destinationLabel: stored.destination.label,
    destinationContext: `Specific airport search: ${stored.destination.label}.`
  }
}

function segmentsForPlan(result: SearchApiSuccessResponse, label: SearchPlanCardViewModel['label']): SearchSegmentViewModel[] {
  const itinerary = result.itineraries.find((item) => item.recommendationLabel === label)
  const segments = itinerary?.segments || result.segments.filter((segment) => segment.id.includes(label.toLowerCase().replace(/\s+/g, '-')))
  return segments.map((segment, index) => ({
    key: segment.id || `${label}-segment-${index + 1}`,
    origin: segment.origin,
    destination: segment.destination,
    transportType: segment.mode,
    carrierLabel: knownText(segment.carrier, 'Carrier not confirmed'),
    notes: segment.notes,
    scheduleStatus: scheduleStatus(segment.schedule),
    loadStatus: loadStatus(segment.schedule)
  }))
}

function transportModes(segments: SearchSegmentViewModel[]) {
  return uniqueStrings(segments.map((segment) => segment.transportType))
}

function risks(detail: SearchApiSuccessResponse['recommendationDetails'][number] | undefined, compactRisks: string[]) {
  if (detail?.risks.length) return detail.risks.map((risk) => `${risk.title}: ${risk.description}`)
  return compactRisks
}

export function buildSearchResultsViewModel(stored: BetaSearchStoredResult | null): SearchResultsViewModel {
  if (!stored) {
    return {
      title: 'No beta search result found',
      subtitle: 'Run a search from the homepage to see ranked beta recommendations.',
      dataQualityLabel: 'Data quality: unavailable',
      staticOnlyNotice: 'No stored search result is available.',
      providerReadinessLabel: 'Provider readiness unavailable.',
      warnings: [],
      missingData: [],
      hasStoredResult: false,
      mobileStructure: { usesSingleColumnCards: true, hasSemanticHeadings: true, hasTapTargets: true },
      cards: []
    }
  }

  const result = stored.result
  const byLabel = new Map<SearchPlanCardViewModel['label'], SearchApiSuccessResponse['recommendations']['ranked'][number]>()
  result.recommendations.ranked.forEach((recommendation) => {
    if (!byLabel.has(recommendation.label)) byLabel.set(recommendation.label, recommendation)
  })
  const destination = cardDestination(stored)
  const detailByLabel = new Map(result.recommendationDetails.map((detail) => [detail.label, detail]))
  const cards = (['Plan A', 'Plan B', 'Plan C'] as const).flatMap((label) => {
    const recommendation = byLabel.get(label)
    if (!recommendation) return []
    const detail = detailByLabel.get(label)
    const segments = segmentsForPlan(result, label)
    return [{
      key: `${label}-${recommendation.gateway}`,
      label,
      rank: recommendation.rank,
      status: recommendation.status,
      gateway: recommendation.gateway,
      ...destination,
      finalScore: clampScore(recommendation.finalScore),
      confidence: clampScore(recommendation.confidence),
      planningSuccessScore: clampScore(recommendation.estimatedSuccess),
      planningScoreNote,
      wholePartyZedLabel: zedLabel(detail),
      eligibleZedAirlinesLabel: detail?.eligibleZedAirlines.length ? detail.eligibleZedAirlines.join(', ') : 'None carrier-confirmed',
      shortSummary: recommendation.summary,
      strengths: detail?.strengths || [],
      weaknesses: detail?.weaknesses || [],
      risks: risks(detail, recommendation.risks),
      switchConditions: detail?.switchConditions || [],
      transportModes: transportModes(segments),
      fallbacks: fallbackSummaries(result.fallbacks),
      dataWarnings: uniqueStrings([...(detail?.dataWarnings || []), ...recommendation.warnings]),
      dataQualityLevel: result.dataQuality,
      unknownIndicators: result.unknownScheduleIndicators,
      segments
    }]
  })

  return {
    title: `Beta search results for ${stored.request.origin} to ${stored.destination.label}`,
    subtitle: stored.destination.mode === 'region'
      ? `Region-based search from ${stored.request.origin}; final destination remains ${stored.destination.label}.`
      : `Airport search from ${stored.request.origin} to ${stored.destination.label}.`,
    dataQualityLabel: dataQualityLabel(result.dataQuality),
    staticOnlyNotice: staticOnlyNotice(result),
    providerReadinessLabel: providerReadinessLabel(result),
    warnings: uniqueStrings(result.warnings).slice(0, 6),
    missingData: uniqueStrings(result.missingData).slice(0, 8),
    hasStoredResult: true,
    mobileStructure: { usesSingleColumnCards: true, hasSemanticHeadings: true, hasTapTargets: true },
    cards
  }
}
