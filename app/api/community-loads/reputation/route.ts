import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type ReputationRecord = {
  contributorId: string
  totalReports: number
  acceptedReports: number
  trustScore: number
  updatedAt: string
}

const inMemoryReputation = new Map<string, ReputationRecord>()

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function initialReputation(contributorId: string): ReputationRecord {
  return {
    contributorId,
    totalReports: 0,
    acceptedReports: 0,
    trustScore: 50,
    updatedAt: new Date().toISOString()
  }
}

function scoreFor(totalReports: number, acceptedReports: number) {
  if (!totalReports) return 50
  const acceptanceRate = acceptedReports / totalReports
  return clamp(50 + acceptanceRate * 35 + Math.min(totalReports, 30) * 0.5 - (totalReports - acceptedReports) * 8, 0, 100)
}

export async function GET(request: Request) {
  const contributorId = new URL(request.url).searchParams.get('contributorId') || 'anonymous-community-contributor'
  return NextResponse.json({ reputation: inMemoryReputation.get(contributorId) || initialReputation(contributorId) })
}

export async function POST(request: Request) {
  let body: { contributorId?: string; accepted?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const contributorId = body.contributorId || 'anonymous-community-contributor'
  const current = inMemoryReputation.get(contributorId) || initialReputation(contributorId)
  const totalReports = current.totalReports + 1
  const acceptedReports = current.acceptedReports + (body.accepted === false ? 0 : 1)
  const reputation: ReputationRecord = {
    contributorId,
    totalReports,
    acceptedReports,
    trustScore: scoreFor(totalReports, acceptedReports),
    updatedAt: new Date().toISOString()
  }
  inMemoryReputation.set(contributorId, reputation)
  return NextResponse.json({ reputation }, { status: 201 })
}
