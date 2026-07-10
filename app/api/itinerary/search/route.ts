import { NextResponse } from 'next/server'
import { runCanonicalItineraryEndpoint } from '../../../../lib/canonicalItineraryEndpoint'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const response = await runCanonicalItineraryEndpoint({
    endpoint: 'GET /api/itinerary/search',
    searchParams
  })

  return NextResponse.json(response)
}
