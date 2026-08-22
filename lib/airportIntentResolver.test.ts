import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { airportByIata, airportIntentCoverage, resolveAirportIntent, resolveRouteIntent } from './airportIntentResolver.ts'

describe('airport intent resolver', () => {
  it('has broad airport metadata coverage for required examples', () => {
    assert.ok(airportIntentCoverage.airportCount > 5000)
    assert.equal(airportByIata('GEG')?.name, 'Spokane International Airport')
    assert.equal(airportByIata('NAP')?.name, 'Naples International Airport')
    ;['SBP', 'SBA', 'FCO', 'HNL', 'LAX', 'HND'].forEach((code) => assert.ok(airportByIata(code), `${code} missing`))
  })

  it('resolves NYC as a metro airport set rather than a physical airport', () => {
    const resolved = resolveAirportIntent('NYC')

    assert.equal(resolved.type, 'metro')
    assert.deepEqual(resolved.candidates.map((airport) => airport.code), ['JFK', 'EWR', 'LGA'])
  })

  it('resolves city names to practical airport candidates', () => {
    const resolved = resolveRouteIntent('San Luis Obispo to Rome')

    assert.equal(resolved?.origin.candidates[0]?.code, 'SBP')
    assert.ok(resolved?.destination.candidates.some((airport) => airport.code === 'FCO'))
    assert.deepEqual(resolved?.destination.candidates.map((airport) => airport.code), ['FCO', 'CIA'])
  })

  it('resolves country and island destination names to gateway airports', () => {
    const resolved = resolveRouteIntent('FCO to Maldives')

    assert.equal(resolved?.origin.candidates[0]?.code, 'FCO')
    assert.equal(resolved?.destination.type, 'country')
    assert.equal(resolved?.destination.candidates[0]?.code, 'MLE')
  })

  it('resolves closest-airport place intent without returning noncommercial fields', () => {
    const resolved = resolveRouteIntent('SBP to closest airport to Longview, WA')

    assert.equal(resolved?.destination.type, 'place')
    assert.equal(resolved?.destination.candidates[0]?.code, 'PDX')
    assert.equal(resolved?.destination.candidates.some((airport) => ['KLS', 'CLS', 'HIO'].includes(airport.code)), false)
    assert.match(resolved?.destination.explanation || '', /Longview/i)
  })

  it('handles closest-airport intent as the origin side too', () => {
    const resolved = resolveRouteIntent('closest airport to Longview, WA to FCO')

    assert.equal(resolved?.origin.candidates[0]?.code, 'PDX')
    assert.equal(resolved?.destination.candidates[0]?.code, 'FCO')
  })

  it('keeps low-confidence unresolved places distinct from unsupported airports', () => {
    const resolved = resolveAirportIntent('not a real place')

    assert.equal(resolved.confidence, 'low')
    assert.deepEqual(resolved.candidates, [])
  })
})

describe('private beta visual system tokens', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

  it('keeps the simplified light palette and high-contrast primary text tokens', () => {
    assert.match(css, /--nonrevy-bg:\s*#f4f7fb/)
    assert.match(css, /--nonrevy-text:\s*#111827/)
    assert.match(css, /--nonrevy-accent-blue:\s*#2563eb/)
  })

  it('keeps the masthead smaller than the legacy oversized mobile logo', () => {
    assert.match(css, /\.nonrevy-home__logo\.nonrevy-logo\s*{[^}]*font-size:\s*3\.6rem/i)
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.nonrevy-home__logo\.nonrevy-logo\s*{[^}]*font-size:\s*2\.6rem/i)
  })

  it('preserves compact result rows with dark flight text', () => {
    assert.match(css, /\.nonrevy-itinerary-row__summary\s*{[^}]*min-height:\s*3\.05rem/i)
    assert.match(css, /\.nonrevy-itinerary-row__flight[\s\S]*color:\s*var\(--nonrevy-text\)/i)
    assert.match(css, /\.nonrevy-itinerary-row__route,[\s\S]*color:\s*#1f2937/i)
  })

  it('keeps navigation and airline fallbacks in the same light visual system', () => {
    assert.match(css, /\.app-menu,[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.96\)/i)
    assert.match(css, /\.nonrevy-itinerary-row__airline-code\s*{[\s\S]*border-radius:\s*999px/i)
  })

  it('contains mobile result rows without horizontal overflow', () => {
    assert.match(css, /html,\s*body\s*{[\s\S]*overflow-x:\s*clip/i)
    assert.match(css, /\.nonrevy-results-page__shell,[\s\S]*\.nonrevy-itinerary-row__expanded\s*{[\s\S]*overflow-x:\s*clip/i)
  })
})
