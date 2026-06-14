'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { useVoiceInput } from '../lib/useVoiceInput'
import { markActivationStep } from '../lib/onboardingActivation'
import { loadSavedSearches, markSavedSearchRun, saveSavedSearch, savedSearchRunUrl, type SavedSearch } from '../lib/savedSearches'

const searchExamples = [
  'LAX to HND tomorrow',
  'Open flights out of SBP today',
  'Where can I get Polaris?',
  'Best Hawaii route this weekend'
]

const recentSearchesStorageKey = 'nonrevy_recent_home_searches_v1'

function loadRecentHomeSearches() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentSearchesStorageKey) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 4) : []
  } catch {
    return []
  }
}

function saveRecentHomeSearch(query: string) {
  if (typeof window === 'undefined' || !window.localStorage) return []
  const normalized = query.trim().replace(/\s+/g, ' ')
  if (!normalized) return loadRecentHomeSearches()
  const next = [normalized, ...loadRecentHomeSearches().filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 4)
  window.localStorage.setItem(recentSearchesStorageKey, JSON.stringify(next))
  return next
}

export default function Home() {
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const voiceInput = useVoiceInput({
    onTranscript: setSearch,
    onStatus: setMessage,
    idleStatus: 'Voice capture ready. Review the search box, then search when ready.'
  })

  useEffect(() => {
    function refreshSavedSearches() {
      setSavedSearches(loadSavedSearches().slice(0, 4))
    }
    setRecentSearches(loadRecentHomeSearches())
    refreshSavedSearches()
    window.addEventListener('nonrevy-saved-searches-updated', refreshSavedSearches)
    window.addEventListener('storage', refreshSavedSearches)
    return () => {
      window.removeEventListener('nonrevy-saved-searches-updated', refreshSavedSearches)
      window.removeEventListener('storage', refreshSavedSearches)
    }
  }, [])

  function runSearch(query: string) {
    const normalized = query.trim()
    if (!normalized) {
      setMessage('Try “LAX to HND tomorrow” or “Open flights out of SBP today.”')
      return
    }
    markActivationStep('runFirstTripPlan')
    setRecentSearches(saveRecentHomeSearch(normalized))
    window.location.href = `/results?aiTrip=${encodeURIComponent(normalized)}`
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    runSearch(search)
  }

  function saveAiSearch() {
    const saved = saveSavedSearch({ query: search, kind: 'ai-trip' })
    setSavedSearches(loadSavedSearches().slice(0, 4))
    setMessage(saved ? `Saved “${saved.label}” for quick reruns.` : 'Add a route, airport, cabin, or trip idea before saving.')
  }

  function runSavedSearch(saved: SavedSearch) {
    markSavedSearchRun(saved.id)
    setRecentSearches(saveRecentHomeSearch(saved.query))
    window.location.href = savedSearchRunUrl(saved)
  }

  return (
    <main className="app-shell nonrevy-home" style={{ minHeight: '100vh', color: 'white' }}>
      <nav className="top-nav nonrevy-home__nav" style={{ marginBottom: 24, justifyContent: 'center' }}>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/opportunities" style={{ marginRight: 16, color: '#67e8f9' }}>Opportunities</a>
        <a href="/saved-searches" style={{ marginRight: 16, color: '#67e8f9' }}>Saved Searches</a>
        <a href="/dashboard" style={{ marginRight: 16, color: '#f472b6' }}>Dashboard</a>
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
            <h1 className="nonrevy-home__headline">Nonrev search</h1>
          </header>

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
                placeholder="LAX to HND tomorrow"
                autoComplete="off"
                className="nonrevy-home__input"
              />
            </div>

            <div className="nonrevy-home__actions" aria-label="Search actions">
              <button type="submit" className="nonrevy-home__primary">Search</button>
              <button type="button" onClick={saveAiSearch} className="nonrevy-home__secondary">Save search</button>
            </div>

            <div className="nonrevy-home__voice-row">
              <button
                type="button"
                aria-label={voiceInput.isListening ? 'Stop listening' : 'Start voice input'}
                onClick={() => voiceInput.start()}
                title={voiceInput.isSupported ? 'Speak a route, airport, cabin, or trip idea' : 'Voice capture is not supported in this browser'}
                className={`nonrevy-home__voice ${voiceInput.isListening ? 'nonrevy-home__voice--listening' : ''}`}
              >
                <span aria-hidden="true">{voiceInput.isListening ? '●' : '🎙️'}</span>
                <span>{voiceInput.isListening ? 'Listening…' : 'Voice input'}</span>
              </button>
            </div>

            <div className="nonrevy-home__chips" aria-label="Example searches">
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

            <section className="nonrevy-home__quick-section" aria-label="Recent searches">
              <div className="nonrevy-home__section-heading">Recent searches</div>
              <div className="nonrevy-home__quick-list">
                {recentSearches.length ? recentSearches.map((item) => (
                  <button key={item} type="button" onClick={() => runSearch(item)} className="nonrevy-home__quick-pill">{item}</button>
                )) : <span className="nonrevy-home__empty">Your recent searches will appear here.</span>}
              </div>
            </section>

            <section className="nonrevy-home__quick-section" aria-label="Saved searches">
              <div className="nonrevy-home__section-heading">Saved searches</div>
              <div className="nonrevy-home__quick-list">
                {savedSearches.length ? savedSearches.map((item) => (
                  <button key={item.id} type="button" onClick={() => runSavedSearch(item)} className="nonrevy-home__quick-pill">{item.label}</button>
                )) : <a href="/saved-searches" className="nonrevy-home__quick-pill nonrevy-home__quick-pill--link">Create a saved search</a>}
              </div>
            </section>
          </form>

          {message && <p className="nonrevy-home__message">{message}</p>}
        </div>
      </section>
    </main>
  )
}
