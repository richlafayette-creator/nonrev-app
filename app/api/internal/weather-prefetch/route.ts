import { NextResponse } from 'next/server'
import { prefetchRouteWeatherInternal, type WeatherPrefetchRequest } from '../../../../lib/weatherPrefetch'

export const dynamic = 'force-dynamic'

type WeatherPrefetchBody = {
  route?: unknown
  airportCodes?: unknown
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function airportCodesValue(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

async function readBody(request: Request): Promise<WeatherPrefetchRequest> {
  let body: WeatherPrefetchBody = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  return {
    source: 'api-internal',
    route: stringValue(body.route),
    airportCodes: airportCodesValue(body.airportCodes)
  }
}

export async function POST(request: Request) {
  const result = await prefetchRouteWeatherInternal(await readBody(request))
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store'
    }
  })
}
