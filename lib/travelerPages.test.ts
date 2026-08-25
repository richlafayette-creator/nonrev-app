import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const profile = readFileSync(new URL('../app/profile/page.tsx', import.meta.url), 'utf8')
const saved = readFileSync(new URL('../app/saved-searches/page.tsx', import.meta.url), 'utf8')
const watchlist = readFileSync(new URL('../app/watchlist/page.tsx', import.meta.url), 'utf8')
const requests = readFileSync(new URL('../app/my-requests/page.tsx', import.meta.url), 'utf8')
const feedback = readFileSync(new URL('../app/beta-feedback/page.tsx', import.meta.url), 'utf8')
const activationProgress = readFileSync(new URL('../app/ActivationProgressCard.tsx', import.meta.url), 'utf8')
const outcomeHistory = readFileSync(new URL('../app/OutcomeHistorySection.tsx', import.meta.url), 'utf8')
const trustScore = readFileSync(new URL('../app/TrustScoreSection.tsx', import.meta.url), 'utf8')

const travelerPages = [profile, saved, watchlist, requests, feedback]
const travelerFacingSource = [...travelerPages, activationProgress, outcomeHistory, trustScore]

describe('traveler page presentation', () => {
  it('uses the shared traveler page shell on normal traveler pages', () => {
    for (const page of travelerPages) {
      assert.match(page, /app-shell nonrevy-traveler-page/)
    }
    assert.match(css, /\.nonrevy-traveler-page\s*{[\s\S]*gap:\s*var\(--nonrevy-space-5\)/)
    assert.match(css, /\.nonrevy-traveler-card,[\s\S]*\.nonrevy-traveler-empty,[\s\S]*border:\s*1px solid var\(--nonrevy-border\) !important/)
  })

  it('keeps traveler forms labeled, compact, and mobile spaced', () => {
    assert.match(profile, /<label[\s\S]*Employee airline[\s\S]*<select/)
    assert.match(saved, /<label[\s\S]*Search type[\s\S]*<select/)
    assert.match(watchlist, /<label[\s\S]*Watch type[\s\S]*<select/)
    assert.match(feedback, /<label>[\s\S]*What happened\?[\s\S]*<textarea/)
    assert.match(css, /\.nonrevy-traveler-form input,[\s\S]*min-height:\s*2\.55rem/)
    assert.match(css, /\.nonrevy-traveler-page button:disabled,[\s\S]*opacity:\s*0\.55/)
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-traveler-list\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) !important/)
  })

  it('renders polished empty states for saved, watchlist, requests, feedback, and profile ZED', () => {
    assert.match(saved, /No saved searches yet\./)
    assert.match(watchlist, /No watched trips yet\./)
    assert.match(requests, /No load requests yet\./)
    assert.match(feedback, /No feedback captured yet/)
    assert.match(profile, /No ZED agreements added yet\./)
    assert.match(css, /\.nonrevy-traveler-empty\s*{[\s\S]*border-style:\s*dashed !important/)
  })

  it('does not expose internal storage or backend wording in traveler page copy', () => {
    const joined = travelerFacingSource.join('\n')
    assert.doesNotMatch(joined, /storageMode|local-fallback|account saving|Saved on this device|saved on this device|Supabase|SQL|HTTP \d{3}/)
    assert.doesNotMatch(joined, /stored in your beta account|stored locally|localStorage/)
  })

  it('presents load request statuses and answered responses with traveler labels', () => {
    assert.match(requests, /if \(request\.status === 'cancelled'\) return 'Cancelled'/)
    assert.match(requests, /if \(request\.status === 'closed'\) return 'Closed'/)
    assert.match(requests, /if \(request\.status === 'expired'\) return 'Expired'/)
    assert.match(requests, /if \(requestIsAnswered\(request\)\) return 'Answered'/)
    assert.match(requests, /return 'Open'/)
    assert.match(requests, /<option value="open">Active<\/option>/)
    assert.match(requests, /className="nonrevy-request-response"/)
    assert.match(requests, /Load response/)
  })

  it('keeps request lifecycle hooks intact while changing presentation only', () => {
    assert.match(requests, /cancelAccountLoadRequest/)
    assert.match(requests, /listAccountLoadRequests/)
    assert.match(requests, /loadCommunityLoadRequests/)
    assert.match(watchlist, /saveTripWatch/)
    assert.match(watchlist, /removeTripWatch/)
    assert.match(saved, /saveSavedSearch/)
    assert.match(saved, /removeSavedSearch/)
  })
})
