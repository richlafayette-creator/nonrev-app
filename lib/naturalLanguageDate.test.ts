import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// @ts-expect-error Node's experimental TypeScript test runner resolves the .ts extension directly.
import { resolveNaturalLanguageDate } from './naturalLanguageDate.ts'

const now = new Date('2026-07-22T19:30:00Z')
const laNow = new Date('2026-07-22T07:30:00Z')

function iso(input: string) {
  return resolveNaturalLanguageDate(input, { now }).isoDate
}

describe('natural language date resolution', () => {
  it('resolves tomorrow', () => {
    assert.equal(iso('tomorrow'), '2026-07-23')
  })

  it('resolves today', () => {
    assert.equal(iso('today'), '2026-07-22')
  })

  it('resolves tonight with a daypart warning', () => {
    const result = resolveNaturalLanguageDate('tonight', { now })

    assert.equal(result.isoDate, '2026-07-22')
    assert.equal(result.confidence, 'high')
    assert.match(result.warnings.join(' '), /daypart/i)
  })

  it('resolves day after tomorrow', () => {
    assert.equal(iso('day after tomorrow'), '2026-07-24')
  })

  it('resolves bare weekdays to the next same-or-future occurrence', () => {
    assert.equal(iso('Friday'), '2026-07-24')
  })

  it('resolves next Friday to the following calendar week', () => {
    assert.equal(iso('next Friday'), '2026-07-31')
  })

  it('resolves coming Friday', () => {
    assert.equal(iso('coming Friday'), '2026-07-24')
  })

  it('resolves July 27 without a year', () => {
    assert.equal(iso('July 27'), '2026-07-27')
  })

  it('resolves July 27, 2026', () => {
    assert.equal(iso('July 27, 2026'), '2026-07-27')
  })

  it('resolves abbreviated month names', () => {
    assert.equal(iso('Jul 27'), '2026-07-27')
  })

  it('resolves day month ordering', () => {
    assert.equal(iso('27 July'), '2026-07-27')
  })

  it('resolves day month year ordering', () => {
    assert.equal(iso('27 July 2026'), '2026-07-27')
  })

  it('resolves numeric month/day without a year', () => {
    assert.equal(iso('7/27'), '2026-07-27')
  })

  it('resolves two-digit numeric years', () => {
    assert.equal(iso('7/27/26'), '2026-07-27')
  })

  it('resolves four-digit numeric years', () => {
    assert.equal(iso('07/27/2026'), '2026-07-27')
  })

  it('resolves ISO dates', () => {
    assert.equal(iso('2026-07-27'), '2026-07-27')
  })

  it('rolls past month/day dates to next year', () => {
    assert.equal(iso('July 1'), '2027-07-01')
  })

  it('accepts valid leap days', () => {
    assert.equal(resolveNaturalLanguageDate('Feb 29 2028', { now }).isoDate, '2028-02-29')
  })

  it('rejects invalid leap days', () => {
    const result = resolveNaturalLanguageDate('Feb 29 2026', { now })

    assert.equal(result.isoDate, undefined)
    assert.match(result.warnings.join(' '), /not valid/i)
  })

  it('rejects invalid February 30', () => {
    const result = resolveNaturalLanguageDate('2/30/26', { now })

    assert.equal(result.isoDate, undefined)
    assert.match(result.warnings.join(' '), /not valid/i)
  })

  it('does not guess ambiguous day/month slash input', () => {
    const result = resolveNaturalLanguageDate('27/7/26', { now })

    assert.equal(result.isoDate, undefined)
    assert.match(result.warnings.join(' '), /month\/day/i)
  })

  it('returns none for malformed input', () => {
    const result = resolveNaturalLanguageDate('sometime-ish', { now })

    assert.equal(result.isoDate, undefined)
    assert.equal(result.confidence, 'none')
  })

  it('returns none for empty input', () => {
    const result = resolveNaturalLanguageDate('', { now })

    assert.equal(result.isoDate, undefined)
    assert.equal(result.confidence, 'none')
  })

  it('resolves dates inside route sentences', () => {
    assert.equal(iso('LAX to HND tomorrow'), '2026-07-23')
  })

  it('is deterministic with fixed now', () => {
    assert.deepEqual(resolveNaturalLanguageDate('next Friday', { now }), resolveNaturalLanguageDate('next Friday', { now }))
  })

  it('does not shift the calendar date across timezone boundaries', () => {
    assert.equal(resolveNaturalLanguageDate('today', { now: laNow, timezone: 'America/Los_Angeles' }).isoDate, '2026-07-22')
  })
})
