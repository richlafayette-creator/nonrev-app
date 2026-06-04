import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { normalizeItineraryRequest, parseItineraryPrompt } from './itinerarySearch.ts'

const fixedNow = new Date('2026-06-04T03:27:00.000Z')

describe('itinerary natural language parser', () => {
  it('parses LAX to HNL tomorrow', () => {
    const parsed = parseItineraryPrompt('LAX to HNL tomorrow', fixedNow)
    assert.equal(parsed.origin, 'LAX')
    assert.equal(parsed.destination, 'HNL')
    assert.equal(parsed.date, '2026-06-05')
    assert.equal(parsed.parserFallbackApplied, false)
    assert.ok((parsed.parserConfidence || 0) >= 85)
    assert.match(parsed.parserExplanation || '', /origin LAX/i)
    assert.match(parsed.parserExplanation || '', /destination HNL/i)
  })

  it('parses SEA-HNL next Friday', () => {
    const parsed = parseItineraryPrompt('SEA-HNL next Friday', fixedNow)
    assert.equal(parsed.origin, 'SEA')
    assert.equal(parsed.destination, 'HNL')
    assert.equal(parsed.date, '2026-06-05')
    assert.equal(parsed.parserFallbackApplied, false)
  })

  it('parses SFO to OGG United with carrier preference', () => {
    const parsed = parseItineraryPrompt('SFO to OGG United', fixedNow)
    assert.equal(parsed.origin, 'SFO')
    assert.equal(parsed.destination, 'OGG')
    assert.equal(parsed.carrier, 'united')
    assert.equal(parsed.parserFallbackApplied, false)
  })

  it('infers Tokyo as HND and safely falls back without an origin', () => {
    const parsed = parseItineraryPrompt('Cheapest nonrev path to Tokyo', fixedNow)
    assert.equal(parsed.origin, undefined)
    assert.equal(parsed.destination, 'HND')
    assert.equal(parsed.parserFallbackApplied, true)
    assert.ok((parsed.parserConfidence || 0) < 70)
    assert.match(parsed.parserExplanation || '', /No origin/i)
  })

  it('infers Maui as OGG and this weekend as the upcoming Saturday', () => {
    const parsed = parseItineraryPrompt('Get me to Maui this weekend', fixedNow)
    assert.equal(parsed.destination, 'OGG')
    assert.equal(parsed.date, '2026-06-06')
    assert.equal(parsed.parserFallbackApplied, true)
  })

  it('combines inferred destination with explicit home airport for a complete safe request', () => {
    const request = normalizeItineraryRequest(new URLSearchParams({ q: 'Get me to Maui this weekend', origin: 'LAX' }))
    assert.equal(request.origin, 'LAX')
    assert.equal(request.destination, 'OGG')
    assert.equal(request.date, '2026-06-06')
    assert.equal(request.parserFallbackApplied, false)
    assert.ok(request.parserConfidence >= 80)
  })
})
