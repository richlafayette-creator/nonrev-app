import { NextResponse } from 'next/server'
import { communityLoadFreshness, communityScoringSignalArchitecture, normalizeCommunityFlightNumber, type CommunityLoadReport } from '../../../lib/communityLoads'
import { addServerCommunityLoadReport, findServerCommunityLoadReports } from '../../../lib/communityLoadServerStore'

export const dynamic = 'force-dynamic'

type CommunityLoadRequest = {
  flightNumber?: string
  carrier?: string
  route?: string
  origin?: string
  destination?: string
  date?: string
  availableSeats?: number
  standbyCount?: number
  cabin?: string
  notes?: string
  boardedResult?: boolean | null
  missedResult?: boolean | null
  cabinUpgradeResult?: boolean | null
  gateClearTime?: string | null
  contributorId?: string
  contributorTrustScore?: number
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function routeAirports(route: string) {
  const matches = route.toUpperCase().match(/\b[A-Z]{3}\b/g) || []
  return {
    origin: matches[0] || '',
    destination: matches[matches.length - 1] || ''
  }
}

function sourceTrustScore(input: CommunityLoadRequest) {
  const contributorTrustScore = clamp(Number(input.contributorTrustScore ?? 50), 0, 100)
  const completeness = [
    Boolean(input.flightNumber),
    Boolean(input.date),
    Number.isFinite(input.availableSeats),
    Number.isFinite(input.standbyCount),
    Boolean(input.route || (input.origin && input.destination)),
    Boolean(input.cabin)
  ].filter(Boolean).length
  return clamp(contributorTrustScore * 0.7 + (completeness / 6) * 30, 0, 100)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const flightNumber = normalizeCommunityFlightNumber(searchParams.get('flightNumber') || '')
  const route = (searchParams.get('route') || '').toUpperCase()
  const date = searchParams.get('date') || ''
  const airports = routeAirports(route)
  const reports = findServerCommunityLoadReports({
    flightNumber,
    route,
    origin: searchParams.get('origin') || airports.origin,
    destination: searchParams.get('destination') || airports.destination,
    date,
    carrier: searchParams.get('carrier') || undefined
  })

  return NextResponse.json({
    reports,
    count: reports.length,
    architecture: communityScoringSignalArchitecture
  })
}

export async function POST(request: Request) {
  let body: CommunityLoadRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const flightNumber = normalizeCommunityFlightNumber(body.flightNumber || '')
  const date = String(body.date || '')
  const availableSeats = Number(body.availableSeats)
  const standbyCount = Number(body.standbyCount)
  if (!flightNumber || !date || !Number.isFinite(availableSeats) || !Number.isFinite(standbyCount)) {
    return NextResponse.json({ error: 'flightNumber, date, availableSeats, and standbyCount are required.' }, { status: 400 })
  }

  const route = String(body.route || '').toUpperCase()
  const airports = routeAirports(route)
  const createdAt = new Date().toISOString()
  const report: CommunityLoadReport = {
    id: `api-community-load-${flightNumber}-${date}-${Date.now()}`,
    flightNumber,
    carrier: String(body.carrier || flightNumber.match(/^[A-Z]{2,3}/)?.[0] || 'Unknown'),
    route,
    origin: String(body.origin || airports.origin || '').toUpperCase(),
    destination: String(body.destination || airports.destination || '').toUpperCase(),
    date,
    availableSeats: clamp(availableSeats, 0, 999),
    standbyCount: clamp(standbyCount, 0, 999),
    cabin: body.cabin?.trim() || undefined,
    notes: body.notes?.trim() || undefined,
    boardedResult: body.boardedResult ?? null,
    missedResult: body.missedResult ?? null,
    cabinUpgradeResult: body.cabinUpgradeResult ?? null,
    gateClearTime: body.gateClearTime || null,
    contributorId: body.contributorId || 'anonymous-community-contributor',
    contributorTrustScore: clamp(Number(body.contributorTrustScore ?? 50), 0, 100),
    sourceTrustScore: sourceTrustScore(body),
    createdAt
  }
  addServerCommunityLoadReport(report)

  return NextResponse.json({
    report,
    freshness: communityLoadFreshness(report.createdAt),
    architecture: communityScoringSignalArchitecture
  }, { status: 201 })
}
