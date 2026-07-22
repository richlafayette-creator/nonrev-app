import { NextResponse } from 'next/server'
import { executeSearchApi } from '../../../lib/searchResponse'
import { readSearchRequestBody } from '../../../lib/searchRequest'

export async function POST(request: Request) {
  const parsed = await readSearchRequestBody(request)
  if (!parsed.ok) {
    return NextResponse.json({
      error: parsed.message,
      code: parsed.code,
      status: parsed.status
    }, { status: parsed.status })
  }

  const response = executeSearchApi(parsed.body)
  return NextResponse.json(response.body, { status: response.status })
}
