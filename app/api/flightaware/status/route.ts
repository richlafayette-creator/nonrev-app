import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ident = searchParams.get('ident')

  if (!ident) {
    return NextResponse.json({
      ok: false,
      error: 'Missing ident query parameter'
    }, { status: 400 })
  }

  const apiKey = process.env.FLIGHTAWARE_API_KEY

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: 'FlightAware API key missing'
    }, { status: 500 })
  }

  try {
    const response = await fetch(
      `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}`,
      {
        headers: {
          'x-apikey': apiKey
        },
        cache: 'no-store'
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        status: response.status,
        error: data?.error || data?.message || 'FlightAware request failed'
      }, { status: response.status })
    }

    return NextResponse.json({
      ok: true,
      data
    })
  } catch {
    return NextResponse.json({
      ok: false,
      error: 'FlightAware fetch failed'
    }, { status: 500 })
  }
}
