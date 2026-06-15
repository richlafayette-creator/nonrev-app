import { NextResponse } from 'next/server'
import {
  calculateCommunityContributorTrustScore,
  communityContributorTrustBreakdown,
  initialCommunityContributorReputation,
  type CommunityLoadContributorReputation,
  type CommunityLoadValidationStatus
} from '../../../../lib/communityLoads'

export const dynamic = 'force-dynamic'

const inMemoryReputation = new Map<string, CommunityLoadContributorReputation>()

function reputationFor(contributorId: string) {
  return inMemoryReputation.get(contributorId) || initialCommunityContributorReputation(contributorId)
}

export async function GET(request: Request) {
  const contributorId = new URL(request.url).searchParams.get('contributorId') || 'anonymous-community-contributor'
  const reputation = reputationFor(contributorId)
  return NextResponse.json({ reputation, breakdown: communityContributorTrustBreakdown(reputation) })
}

export async function POST(request: Request) {
  let body: { contributorId?: string; accepted?: boolean; sourceTrustScore?: number; validationStatus?: CommunityLoadValidationStatus }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const contributorId = body.contributorId || 'anonymous-community-contributor'
  const current = reputationFor(contributorId)
  const isSubmissionUpdate = body.accepted !== undefined
  const totalReports = current.totalReports + (isSubmissionUpdate ? 1 : 0)
  const acceptedReports = current.acceptedReports + (isSubmissionUpdate && body.accepted === false ? 0 : isSubmissionUpdate ? 1 : 0)
  const sourceTrustScore = Number(body.sourceTrustScore)
  const averageSourceTrustScore = isSubmissionUpdate && Number.isFinite(sourceTrustScore)
    ? Math.round(((current.averageSourceTrustScore * current.totalReports) + Math.max(0, Math.min(100, sourceTrustScore))) / Math.max(1, totalReports))
    : current.averageSourceTrustScore
  const confirmedValidations = current.confirmedValidations + (body.validationStatus === 'Confirmed' ? 1 : 0)
  const outdatedValidations = current.outdatedValidations + (body.validationStatus === 'Outdated' ? 1 : 0)
  const inaccurateValidations = current.inaccurateValidations + (body.validationStatus === 'Inaccurate' ? 1 : 0)
  const breakdown = calculateCommunityContributorTrustScore({
    totalReports,
    acceptedReports,
    confirmedValidations,
    outdatedValidations,
    inaccurateValidations,
    averageSourceTrustScore
  })
  const reputation: CommunityLoadContributorReputation = {
    ...current,
    contributorId,
    totalReports,
    acceptedReports,
    confirmedValidations,
    outdatedValidations,
    inaccurateValidations,
    averageSourceTrustScore,
    trustScore: breakdown.trustScore,
    trustLevel: breakdown.trustLevel,
    updatedAt: new Date().toISOString()
  }
  inMemoryReputation.set(contributorId, reputation)
  return NextResponse.json({ reputation, breakdown }, { status: 201 })
}
