'use client'

import { type FormEvent, useState } from 'react'
import { useVoiceInput } from '../lib/useVoiceInput'
import { markActivationStep } from '../lib/onboardingActivation'
import { saveSavedSearch } from '../lib/savedSearches'
import ActivationProgressCard from './ActivationProgressCard'

const searchExamples = [
  'LAX to HND tomorrow',
  'Open flights out of SBP today',
  'Where can I get Polaris?',
  'Best Hawaii route this weekend'
]

export default function Home() {
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const voiceInput = useVoiceInput({
    onTranscript: setSearch,
    onStatus: setMessage,
    idleStatus: 'Voice capture ready. Review the search box, then search when ready.'
  })

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = search.trim()
    if (!query) {
      setMessage('Try “LAX to HND tomorrow” or “Open flights out of SBP today.”')
      return
    }

    markActivationStep('runFirstTripPlan')
    window.location.href = `/plan?aiTrip=${encodeURIComponent(query)}`
  }

  function saveAiSearch() {
    const saved = saveSavedSearch({ query: search, kind: 'ai-trip' })
    setMessage(saved ? `Saved “${saved.label}” for quick reruns.` : 'Add a route, airport, cabin, or trip idea before saving.')
  }

  return (
    <main className="app-shell nonrevy-home" style={{ minHeight: '100vh', color: 'white' }}>
      <nav className="top-nav nonrevy-home__nav" style={{ marginBottom: 24, justifyContent: 'center' }}>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/opportunities" style={{ marginRight: 16, color: '#67e8f9' }}>Opportunities</a>
        <a href="/saved-searches" style={{ marginRight: 16, color: '#67e8f9' }}>Saved Searches</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
      </nav>

      <section className="nonrevy-home__hero">
        <div className="nonrevy-home__ambient nonrevy-home__ambient--left" aria-hidden="true" />
        <div className="nonrevy-home__ambient nonrevy-home__ambient--right" aria-hidden="true" />
        <div className="nonrevy-home__wing" aria-hidden="true">
          <svg viewBox="0 0 192 192" role="img">
            <path d="M49 92 131 51c7-3 14 4 10 11l-18 31 31 19c7 4 4 15-4 15H107l-24 40c-4 7-15 4-15-4v-36H42c-10 0-14-13-5-18l12-7Z" />
            <path d="M72 101h42L96 132H72v-31Z" />
          </svg>
        </div>

        <div className="nonrevy-home__content">
          <header className="nonrevy-home__header">
            <div className="nonrevy-home__brand-row" aria-label="NONREVY">
              <span className="nonrevy-home__mark" aria-hidden="true">✈</span>
              <span className="nonrevy-home__wordmark">NONREVY</span>
            </div>
            <p className="nonrevy-home__eyebrow">AI nonrev planner</p>
          </header>

          <h1 className="nonrevy-home__headline">Tell us where. We’ll rank the way.</h1>
          <p className="nonrevy-home__subhead">
            Search airports, routes, flight numbers, cabins, or open-ended trip ideas. Get concise itinerary cards with route intelligence, recovery strategy, cabin upside, and load-request actions.
          </p>

          <form onSubmit={submitSearch} className="nonrevy-home__search-card">
            <label htmlFor="homepage-ai-search" className="nonrevy-home__search-label">
              Where can we get you?
            </label>
            <div className="nonrevy-home__search-row">
              <span className="nonrevy-home__search-icon" aria-hidden="true">⌕</span>
              <input
                id="homepage-ai-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="LAX, Tokyo Haneda, UA39, Polaris, or SBP to SEA"
                autoComplete="off"
                className="nonrevy-home__input"
              />
              <button
                type="button"
                aria-label={voiceInput.isListening ? 'Stop listening' : 'Start voice input'}
                onClick={() => voiceInput.start()}
                title={voiceInput.isSupported ? 'Speak a route, airport, cabin, or trip idea' : 'Voice capture is not supported in this browser'}
                className={`nonrevy-home__voice ${voiceInput.isListening ? 'nonrevy-home__voice--listening' : ''}`}
              >
                {voiceInput.isListening ? '●' : '🎙️'}
              </button>
            </div>

            <div className="nonrevy-home__actions">
              <button type="submit" className="nonrevy-home__primary">Search with AI</button>
              <button type="button" onClick={saveAiSearch} className="nonrevy-home__secondary">Star / save search</button>
            </div>

            <div className="nonrevy-home__proof" aria-label="Planner capabilities">
              <span>Universal search</span>
              <span>Route intelligence</span>
              <span>Recovery plans</span>
              <span>Watchlist-ready</span>
            </div>

            <div className="nonrevy-home__chips" aria-label="Search examples">
              {searchExamples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setSearch(example)}
                  className="nonrevy-home__chip"
                >
                  {example}
                </button>
              ))}
            </div>
          </form>

          {message && <p className="nonrevy-home__message">{message}</p>}

          <section className="nonrevy-home__setup" style={{ marginTop: 18 }} aria-label="Today's Best Opportunities">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <p style={{ color: '#67e8f9', fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', margin: 0 }}>Today’s Best Opportunities</p>
                <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>Discover Polaris, Delta One, Hawaii, Europe, Asia, same-day, and hidden-gem nonrev ideas.</p>
              </div>
              <a href="/opportunities" style={{ color: '#020617', background: '#67e8f9', borderRadius: 999, padding: '10px 14px', fontWeight: 900, textDecoration: 'none' }}>Open feed</a>
            </div>
          </section>

          <details className="nonrevy-home__setup">
            <summary>Setup and activation details</summary>
            <div style={{ marginTop: 14 }}>
              <ActivationProgressCard />
            </div>
          </details>
        </div>
      </section>
    </main>
  )
}
