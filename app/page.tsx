'use client'

import { type FormEvent, useState } from 'react'
import { useVoiceInput } from '../lib/useVoiceInput'
import { markActivationStep } from '../lib/onboardingActivation'
import { saveSavedSearch } from '../lib/savedSearches'
import ActivationProgressCard from './ActivationProgressCard'

const searchExamples = [
  'LAX to HND tomorrow',
  'open flights out of SBP today',
  'where can I get Polaris',
  'best Hawaii route from LAX this weekend'
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
      setMessage('Try something like “LAX to HND tomorrow” or “open flights out of SBP today.”')
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
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24, justifyContent: 'center' }}>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/saved-searches" style={{ marginRight: 16, color: '#67e8f9' }}>Saved Searches</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
      </nav>

      <section style={{ minHeight: '78vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 820, textAlign: 'center' }}>
          <img
            src="/brand/nonrevy-logo.png"
            alt="NONREVY"
            style={{ width: 250, maxWidth: '76%', margin: '0 0 34px' }}
          />

          <p style={{ color: '#67e8f9', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
            AI nonrev planner
          </p>
          <h1 style={{ margin: '0 0 14px', fontSize: 'clamp(36px, 8vw, 72px)', lineHeight: 0.95 }}>
            Ask for the route you want.
          </h1>
          <p style={{ color: '#cbd5e1', fontSize: 18, maxWidth: 640, margin: '0 auto 26px' }}>
            NONREVY turns plain-English travel intent into ranked itinerary cards with confidence, backup options, source freshness, and details only when you ask for them.
          </p>

          <form onSubmit={submitSearch} style={{ border: '1px solid #334155', borderRadius: 28, padding: 'clamp(14px, 4vw, 22px)', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.82))', boxShadow: '0 24px 80px rgba(2, 6, 23, 0.34)' }}>
            <label htmlFor="homepage-ai-search" style={{ display: 'block', textAlign: 'left', color: '#f8fafc', fontWeight: 800, marginBottom: 10 }}>
              Where can we get you?
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="homepage-ai-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="LAX to HND tomorrow"
                autoComplete="off"
                style={{ boxSizing: 'border-box', width: '100%', padding: '18px 58px 18px 20px', borderRadius: 999, border: '1px solid #334155', background: '#020617', color: 'white', fontSize: 17 }}
              />
              <button
                type="button"
                aria-label={voiceInput.isListening ? 'Stop listening' : 'Start voice input'}
                onClick={() => voiceInput.start()}
                title={voiceInput.isSupported ? 'Speak a route, airport, cabin, or trip idea' : 'Voice capture is not supported in this browser'}
                style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: 999, border: `1px solid ${voiceInput.isListening ? '#fb7185' : '#475569'}`, background: voiceInput.isListening ? '#fb7185' : '#020617', color: voiceInput.isListening ? 'white' : '#f472b6', fontSize: 18 }}
              >
                {voiceInput.isListening ? '●' : '🎙️'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <button type="submit" style={{ padding: '14px 24px', borderRadius: 999, border: 'none', background: '#38bdf8', color: '#020617', fontWeight: 'bold' }}>
                Search with AI
              </button>
              <button type="button" onClick={saveAiSearch} style={{ padding: '14px 20px', borderRadius: 999, border: '1px solid #67e8f9', background: '#020617', color: '#a5f3fc', fontWeight: 'bold' }}>
                Star / save search
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18 }}>
              {searchExamples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setSearch(example)}
                  style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #334155', background: '#0f172a', color: '#cbd5e1', fontWeight: 700 }}
                >
                  {example}
                </button>
              ))}
            </div>
          </form>

          {message && <p style={{ color: '#38bdf8', marginTop: 18, fontWeight: 700 }}>{message}</p>}

          <details style={{ margin: '24px auto 0', maxWidth: 620, textAlign: 'left', border: '1px solid #334155', borderRadius: 18, padding: 14, background: 'rgba(15, 23, 42, 0.72)' }}>
            <summary style={{ color: '#94a3b8', cursor: 'pointer', fontWeight: 800 }}>Setup and activation details</summary>
            <div style={{ marginTop: 14 }}>
              <ActivationProgressCard />
            </div>
          </details>
        </div>
      </section>
    </main>
  )
}
