import { NextResponse } from 'next/server'
import {
  buildItineraryProviderHealthMatrix,
  itineraryProviderExpectedEnvNames,
  missingItineraryProviderEnvNames
} from '../../../../lib/itineraryProviderHealthReport'

export async function GET() {
  return NextResponse.json({
    ok: true,
    expectedEnvNames: itineraryProviderExpectedEnvNames,
    missingEnvNames: missingItineraryProviderEnvNames(process.env),
    providerHealthMatrix: buildItineraryProviderHealthMatrix({ env: process.env }),
    note: 'Safe provider health report only. Secret values and provider payloads are never returned.'
  })
}

