import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const client = readFileSync(new URL('../app/results/SearchResultsClient.tsx', import.meta.url), 'utf8')

describe('phase 2A compact result row layout', () => {
  it('uses a two-line mobile structure with primary content, fixed score, and wrapping metadata', () => {
    assert.match(css, /\.nonrevy-itinerary-row__summary\s*{[\s\S]*grid-template-areas:\s*[\s\S]*"option primary score"[\s\S]*"option meta score"/)
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-itinerary-row__summary\s*{[\s\S]*"primary score"[\s\S]*"meta meta"/)
    assert.match(client, /className="nonrevy-itinerary-row__primary"/)
    assert.match(client, /className="nonrevy-itinerary-row__meta"/)
  })

  it('keeps row children shrinkable instead of forcing viewport overflow', () => {
    assert.match(css, /\.nonrevy-itinerary-row__summary\s*{[\s\S]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/)
    assert.match(css, /\.nonrevy-itinerary-row__primary\s*{[\s\S]*min-width:\s*0/)
    assert.match(css, /\.nonrevy-itinerary-row__route-time\s*{[\s\S]*grid-template-columns:\s*minmax\(4\.4rem,\s*0\.8fr\)\s+minmax\(8\.2rem,\s*1\.2fr\)/)
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-itinerary-row__route-time\s*{[\s\S]*grid-template-columns:\s*minmax\(4\.6rem,\s*auto\)\s+minmax\(0,\s*1fr\)/)
  })

  it('keeps the score badge inside the row without widening the row', () => {
    assert.match(css, /\.nonrevy-itinerary-row__score\s*{[\s\S]*grid-area:\s*score/)
    assert.match(css, /\.nonrevy-itinerary-row__score\s*{[\s\S]*width:\s*2\.45rem/)
    assert.match(css, /\.nonrevy-itinerary-row__score\s*{[\s\S]*max-width:\s*2\.45rem/)
    assert.match(client, /const scoreAriaLabel = publicPreview \? 'Personalized score locked until verification' : `Score \$\{card\.finalScore\} out of 100`/)
    assert.match(client, /className="nonrevy-itinerary-row__score" aria-label=\{scoreAriaLabel\}/)
  })

  it('keeps ZED and load badges in a wrapping secondary row', () => {
    assert.match(css, /\.nonrevy-itinerary-row__meta\s*{[\s\S]*display:\s*flex[\s\S]*flex-wrap:\s*wrap/)
    assert.match(css, /\.nonrevy-itinerary-row__zed,[\s\S]*\.nonrevy-itinerary-row__load\s*{[\s\S]*max-width:\s*min\(100%,\s*9\.5rem\)/)
    assert.match(client, /className=\{`nonrevy-itinerary-row__zed nonrevy-itinerary-row__zed--\$\{card\.zedEligibilityStatus\}`\}/)
    assert.match(client, /className="nonrevy-itinerary-row__load"/)
  })

  it('preserves accessible full text when a long flight chain is visually shortened', () => {
    assert.match(css, /\.nonrevy-itinerary-row__flight strong,[\s\S]*\.nonrevy-itinerary-row__route,[\s\S]*\.nonrevy-itinerary-row__times\s*{[\s\S]*text-overflow:\s*ellipsis/)
    assert.match(client, /title=\{summary\.flightSummary\}/)
    assert.match(client, /<span className="nonrevy-itinerary-row__leg-summary">\{legSummary\}<\/span>/)
  })

  it('keeps requested endpoints and complete results ordering in the view-model test surface', () => {
    const viewModelTests = readFileSync(new URL('./searchResultsViewModel.test.ts', import.meta.url), 'utf8')

    assert.match(viewModelTests, /builds a direct whole-itinerary collapsed summary/)
    assert.match(viewModelTests, /builds a multi-leg whole-itinerary collapsed summary/)
    assert.match(viewModelTests, /does not let a downstream-only SBP to FCO schedule masquerade as the collapsed itinerary/)
    assert.match(viewModelTests, /promotes multiple scheduled provider itineraries ahead of unresolved frameworks/)
  })

  it('uses a compact expanded header and timeline without changing the collapsed row contract', () => {
    assert.match(client, /className="nonrevy-itinerary-row__expanded-title"/)
    assert.match(client, /className="nonrevy-itinerary-row__expanded-meta"/)
    assert.match(client, /className="nonrevy-itinerary-row__expanded-badge">Best option/)
    assert.match(client, /function Layover/)
    assert.match(client, /layoverLabelBetweenSegments\(previous, next\)/)
    assert.match(client, /className="nonrevy-itinerary-segment__carrier"/)
    assert.match(client, /className="nonrevy-itinerary-segment__meta"/)
  })

  it('keeps expanded content mobile-width safe', () => {
    assert.match(css, /\.nonrevy-itinerary-row__expanded\s*{[\s\S]*width:\s*100%[\s\S]*min-width:\s*0/)
    assert.match(css, /\.nonrevy-itinerary-row \.nonrevy-itinerary-segment\s*{[\s\S]*grid-template-columns:\s*minmax\(7rem,\s*0\.9fr\)\s+minmax\(0,\s*1\.45fr\)\s+minmax\(5\.6rem,\s*0\.75fr\)/)
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*html\s*{[\s\S]*scroll-padding-bottom:\s*calc\(var\(--nonrevy-mobile-nav-height\)/)
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-itinerary-row \.nonrevy-itinerary-segment\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) !important/)
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-itinerary-row \.nonrevy-itinerary-card__actions\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(0,\s*0\.9fr\)\s+minmax\(0,\s*0\.9fr\)/)
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-itinerary-row \.nonrevy-itinerary-card__actions\s*{[\s\S]*scroll-margin-bottom:\s*calc\(var\(--nonrevy-mobile-nav-height\)/)
  })

  it('keeps actions restricted for partial and framework rows', () => {
    const workflowTests = readFileSync(new URL('./resultWorkflowActions.test.ts', import.meta.url), 'utf8')
    assert.match(client, /scheduledResultActionAvailability\(card\)/)
    assert.match(client, /availability\.canSave \|\| availability\.canWatch \|\| availability\.canRequestLoad/)
    assert.match(client, /<p className="nonrevy-itinerary-card__action-note">\{availability\.reason\}<\/p>/)
    assert.match(workflowTests, /does not expose actions for framework routes/)
  })

  it('keeps Why this ranking collapsed by default and hides empty ranking sections', () => {
    assert.match(client, /<details className="nonrevy-route-details">/)
    assert.doesNotMatch(client, /<details className="nonrevy-route-details" open/)
    assert.match(client, /function CompactList\(\{ title, items \}/)
    assert.match(client, /if \(!displayItems\.length\) return null/)
  })
})
