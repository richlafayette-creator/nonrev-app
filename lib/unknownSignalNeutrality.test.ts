import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { analyzeRecovery } from './recoveryEngine.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { calculateRouteConfidence } from './routeConfidence.ts'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { buildWeatherIntelligenceForRoute, getRouteWeatherRisk, weatherIntelligenceScoreAdjustment } from './weatherIntelligence.ts'

describe('unknown signal neutrality', () => {
  it('keeps unknown weather at zero scoring and ranking impact', () => {
    const intelligence = buildWeatherIntelligenceForRoute('ZZZ → YYY')
    const risk = getRouteWeatherRisk('ZZZ → YYY', intelligence)

    assert.equal(intelligence.routeRisk.level, 'unknown')
    assert.equal(weatherIntelligenceScoreAdjustment(intelligence), 0)
    assert.equal(risk.scoreImpact, 0)
    assert.equal(risk.successProbabilityImpact, 0)
    assert.equal(risk.routeRankingImpact, 0)
    assert.match(risk.details.join(' '), /unknown/i)
  })

  it('keeps unknown weather unavailable and neutral in route confidence', () => {
    const intelligence = buildWeatherIntelligenceForRoute('ZZZ → YYY')
    const confidence = calculateRouteConfidence({
      route: 'ZZZ → YYY',
      successProbability: 70,
      weatherIntelligence: intelligence,
      providerDataStatus: 'unknown'
    })

    assert.equal(confidence.weatherImpact.level, 'unknown')
    assert.equal(confidence.weatherImpact.scoreImpact, 0)
    assert.equal(confidence.weatherImpact.successProbabilityImpact, 0)
    assert.equal(confidence.weatherImpact.routeRankingImpact, 0)
    assert.equal(confidence.sourceBreakdown.weather.available, false)
    assert.equal(confidence.sourceBreakdown.weather.scoreImpact, 0)
    assert.ok(confidence.explanation.some((line) => /Unknown signals are treated as missing context/.test(line)))
  })

  it('does not penalize unknown recovery weather or delay risk', () => {
    const recovery = analyzeRecovery({
      route: 'DEN → LAX',
      departureTime: '2026-07-04T12:00:00Z',
      arrivalTime: '2026-07-04T14:00:00Z',
      status: 'Scheduled'
    })

    assert.equal(recovery.weatherRisk, 'Unknown')
    assert.equal(recovery.delayRisk, 'Unknown')
    assert.equal(recovery.score, 100)
    assert.match(recovery.summary, /recovery profile/i)
  })
})
