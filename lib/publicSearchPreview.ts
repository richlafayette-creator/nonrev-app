import type { SearchApiSuccessResponse } from './searchResponse'

export const publicPreviewLockedMessage = 'Verify airline eligibility to unlock ZED compatibility, load intelligence, personalized scoring and member tools.'

const lockedFeatures = [
  'ZED compatibility',
  'load intelligence',
  'personalized scoring',
  'saved trips',
  'watchlists',
  'load requests'
]

function publicLoadText(value: string) {
  return /^unknown\b|unavailable|not attached/i.test(value) ? value : 'Verify to unlock load intelligence'
}

function redactRecommendation(recommendation: SearchApiSuccessResponse['recommendations']['ranked'][number]) {
  return {
    ...recommendation,
    finalScore: 0,
    confidence: 0,
    estimatedSuccess: 0,
    summary: 'Public schedule preview. Verify airline eligibility to unlock personalized route confidence.',
    warnings: [
      publicPreviewLockedMessage,
      ...recommendation.warnings.filter((warning) => !/zed|load|community|personal|success probability|score/i.test(warning))
    ],
    risks: recommendation.risks.filter((risk) => !/zed|load|community|personal|success probability|score/i.test(risk))
  }
}

function redactDetail(detail: SearchApiSuccessResponse['recommendationDetails'][number]) {
  return {
    ...detail,
    finalScore: 0,
    confidence: 0,
    estimatedSuccess: 0,
    wholePartyZedEligible: false,
    eligibleZedAirlines: [],
    strengths: detail.strengths.filter((item) => !/zed|load|community|personal|success probability|score/i.test(item)),
    weaknesses: [
      publicPreviewLockedMessage,
      ...detail.weaknesses.filter((item) => !/zed|load|community|personal|success probability|score/i.test(item))
    ],
    switchConditions: detail.switchConditions.filter((item) => !/zed|load|community|personal|success probability|score/i.test(item)),
    risks: detail.risks.filter((risk) => !/zed|load|community|personal|success probability|score/i.test(`${risk.code} ${risk.title} ${risk.description}`)),
    dataWarnings: [
      publicPreviewLockedMessage,
      ...detail.dataWarnings.filter((item) => !/zed|load|community|personal|success probability|score/i.test(item))
    ]
  }
}

function redactSegment(segment: SearchApiSuccessResponse['segments'][number]) {
  return {
    ...segment,
    schedule: {
      ...segment.schedule,
      seatCount: publicLoadText(segment.schedule.seatCount)
    },
    notes: segment.notes.filter((note) => !/zed|community|success probability|personal/i.test(note))
  }
}

function redactItinerary(itinerary: SearchApiSuccessResponse['itineraries'][number]) {
  return {
    ...itinerary,
    confidence: 0,
    detailedSummary: 'Public schedule preview. Member-only ZED, load and personalized confidence details are locked until verification.',
    requiredZedAirlines: [],
    eligibleZedAirlines: [],
    revenueAirlines: [],
    zedEligibility: {
      status: 'unknown' as const,
      label: 'Verify to unlock ZED compatibility',
      requiredCarriers: [],
      eligibleCarriers: [],
      ineligibleCarriers: [],
      unknownCarriers: [],
      revenueAlternative: false,
      action: 'Verify airline eligibility',
      reasons: [publicPreviewLockedMessage]
    },
    providerHubQuality: itinerary.providerHubQuality ? {
      ...itinerary.providerHubQuality,
      score: 0,
      reasons: itinerary.providerHubQuality.reasons.filter((reason) => !/load|community|personal|score/i.test(reason))
    } : undefined,
    segments: itinerary.segments.map(redactSegment),
    missingData: [
      publicPreviewLockedMessage,
      ...itinerary.missingData.filter((item) => !/zed|load|community|personal|success probability|score/i.test(item))
    ],
    unknownScheduleIndicators: itinerary.unknownScheduleIndicators.filter((item) => !/zed|community|personal|success probability/i.test(item)),
    journeys: itinerary.journeys.map((journey) => ({
      ...journey,
      segments: journey.segments.map(redactSegment)
    }))
  }
}

export function redactSearchResponseForPublicPreview(response: SearchApiSuccessResponse): SearchApiSuccessResponse {
  const ranked = response.recommendations.ranked.map(redactRecommendation)
  return {
    ...response,
    publicPreview: {
      enabled: true,
      lockedMessage: publicPreviewLockedMessage,
      lockedFeatures
    },
    planA: ranked.find((recommendation) => recommendation.label === 'Plan A'),
    planB: ranked.find((recommendation) => recommendation.label === 'Plan B'),
    planC: ranked.find((recommendation) => recommendation.label === 'Plan C'),
    confidence: {
      score: 0,
      label: 'low',
      reason: 'Public schedule preview. Verify airline eligibility to unlock personalized route confidence.'
    },
    recommendations: {
      planA: ranked.find((recommendation) => recommendation.label === 'Plan A'),
      planB: ranked.find((recommendation) => recommendation.label === 'Plan B'),
      planC: ranked.find((recommendation) => recommendation.label === 'Plan C'),
      ranked
    },
    recommendationDetails: response.recommendationDetails.map(redactDetail),
    segments: response.segments.map(redactSegment),
    itineraries: response.itineraries.map(redactItinerary),
    warnings: [
      publicPreviewLockedMessage,
      ...response.warnings.filter((warning) => !/zed|load|community|personal|success probability|score/i.test(warning))
    ],
    missingData: [
      publicPreviewLockedMessage,
      ...response.missingData.filter((item) => !/zed|load|community|personal|success probability|score/i.test(item))
    ],
    unknownScheduleIndicators: response.unknownScheduleIndicators.filter((item) => !/zed|community|personal|success probability/i.test(item)),
    summary: response.itineraries.length
      ? 'Public schedule preview returned scheduled flight options. Verify airline eligibility to unlock member-only non-rev intelligence.'
      : response.summary
  }
}
