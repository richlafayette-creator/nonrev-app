'use client'

import { type FormEvent, useMemo, useState } from 'react'
import { supportedCarrierOptions } from '../lib/carrierScope'
import { parseTripPlannerPrompt } from '../lib/aiTripPlanner'
import { defaultTravelerProfile } from '../lib/travelerProfile'
import { useVoiceInput } from '../lib/useVoiceInput'
import { markActivationStep } from '../lib/onboardingActivation'
import ActivationProgressCard from './ActivationProgressCard'

export default function Home() {
  const [search, setSearch] = useState('')
  const [carrier, setCarrier] = useState('all')
  const [message, setMessage] = useState('')
  const [aiTripPrompt, setAiTripPrompt] = useState('best Hawaii trip from LAX tomorrow')
  const voiceInput = useVoiceInput({
    onTranscript: setSearch,
    onStatus: setMessage,
    idleStatus: 'Voice capture ready. Review the search box, then plan when ready.'
  })


  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = search.trim()
    if (!query) {
      setMessage('Add a destination, route, or flight number to start planning.')
      return
    }

    markActivationStep('runFirstTripPlan')
    window.location.href = `/plan?q=${encodeURIComponent(query)}`
  }

  function startVoiceScaffold() {
    voiceInput.start()
  }

  const aiTripPreview = useMemo(
    () => parseTripPlannerPrompt(aiTripPrompt, defaultTravelerProfile),
    [aiTripPrompt]
  )

  function submitAiTripPlanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = aiTripPrompt.trim()
    if (!prompt) {
      setMessage('Tell the AI planner where you want to go, like “get me to Maui this weekend”.')
      return
    }

    markActivationStep('runFirstTripPlan')
    window.location.href = `/plan?aiTrip=${encodeURIComponent(prompt)}`
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24, justifyContent: 'center' }}>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/onboarding" style={{ marginRight: 16, color: '#38bdf8' }}>Onboarding</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/agent" style={{ marginRight: 16, color: '#a78bfa' }}>Agent</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
      </nav>

      <section style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 760, textAlign: 'center' }}>
          <img
            src="/brand/nonrevy-logo.png"
            alt="NONREVY"
            style={{ width: 280, maxWidth: '80%', margin: '0 0 42px' }}
          />

          <div style={{ marginBottom: 26 }}>
            <ActivationProgressCard />
          </div>

          <form onSubmit={submitSearch}>
            <label htmlFor="homepage-search" style={{ display: 'block', fontSize: 28, fontWeight: 'bold', marginBottom: 18 }}>
              Where are we headed?
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="homepage-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Try LAX-HNL, LAX to HNL, AA123, or beach weekend from SFO"
                style={{ boxSizing: 'border-box', width: '100%', padding: '18px 58px 18px 20px', borderRadius: 999, border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: 16 }}
              />
              <button
                type="button"
                aria-label={voiceInput.isListening ? 'Stop listening' : 'Start voice input'}
                onClick={startVoiceScaffold}
                title={voiceInput.isSupported ? 'Speak a route, flight number, or trip idea' : 'Voice capture is not supported in this browser'}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: 999, border: `1px solid ${voiceInput.isListening ? '#fb7185' : '#475569'}`, background: voiceInput.isListening ? '#fb7185' : '#020617', color: voiceInput.isListening ? 'white' : '#f472b6', fontSize: 18 }}
              >
                {voiceInput.isListening ? '●' : '🎙️'}
              </button>
            </div>
            <button type="submit" style={{ marginTop: 18, padding: '14px 24px', borderRadius: 999, border: 'none', background: '#38bdf8', color: '#020617', fontWeight: 'bold' }}>
              Search flights and plan
            </button>
            <label htmlFor="homepage-carrier" style={{ display: 'block', color: '#cbd5e1', marginTop: 16 }}>
              Carrier scope scaffold
            </label>
            <select
              id="homepage-carrier"
              value={carrier}
              onChange={(event) => setCarrier(event.target.value)}
              style={{ marginTop: 8, padding: 12, width: '100%', maxWidth: 360, borderRadius: 12, border: '1px solid #334155', background: '#0f172a', color: 'white' }}
            >
              {supportedCarrierOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p style={{ color: '#94a3b8', marginTop: 8 }}>
              Supported today: United, Delta, Alaska Group.
            </p>
          </form>

          <section style={{ border: '1px solid #334155', borderRadius: 24, padding: 22, background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.9))', marginTop: 34, textAlign: 'left' }}>
            <p style={{ color: '#c084fc', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>AI Trip Planner scaffold</p>
            <h2 style={{ fontSize: 28, margin: '8px 0' }}>Describe the trip in plain English.</h2>
            <p style={{ color: '#94a3b8' }}>
              Try “get me to Maui this weekend”, “best Hawaii trip from LAX tomorrow”, or “cheapest nonrev path to Tokyo”.
            </p>
            <form onSubmit={submitAiTripPlanner}>
              <textarea
                value={aiTripPrompt}
                onChange={(event) => setAiTripPrompt(event.target.value)}
                rows={3}
                placeholder="get me to Maui this weekend"
                style={{ boxSizing: 'border-box', width: '100%', padding: 14, borderRadius: 16, border: '1px solid #334155', background: '#020617', color: 'white' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '12px 0' }}>
                {[
                  ['Origin', aiTripPreview.origin],
                  ['Destination', `${aiTripPreview.destinationLabel} (${aiTripPreview.destination})`],
                  ['Date range', aiTripPreview.dateRange],
                  ['Preferences', aiTripPreview.preferences.join(', ')]
                ].map(([label, value]) => (
                  <div key={label} style={{ border: '1px solid #334155', borderRadius: 12, padding: 10, background: '#0f172a' }}>
                    <small style={{ color: '#94a3b8' }}>{label}</small>
                    <p style={{ margin: '4px 0 0', color: '#f8fafc', fontWeight: 'bold' }}>{value}</p>
                  </div>
                ))}
              </div>
              <button type="submit" style={{ padding: '14px 20px', borderRadius: 999, border: 'none', background: '#c084fc', color: '#020617', fontWeight: 'bold' }}>
                Plan with AI scaffold
              </button>
            </form>
          </section>

          {message && <p style={{ color: '#38bdf8', marginTop: 18 }}>{message}</p>}
        </div>
      </section>
    </main>
  )
}
