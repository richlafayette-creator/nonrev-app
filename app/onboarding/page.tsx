'use client'

import Link from 'next/link'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import ActivationProgressCard from '../ActivationProgressCard'
import {
  defaultOnboardingState,
  loadOnboardingState,
  onboardingStateToTravelerProfile,
  parsePreferredDestinations,
  saveOnboardingState,
  type OnboardingState
} from '../../lib/onboardingActivation'
import { travelerProfileStorageKey, type TravelerType } from '../../lib/travelerProfile'

const travelerTypes: TravelerType[] = ['Employee', 'Retiree', 'Companion', 'Buddy Pass']
const onboardingSkipStorageKey = 'nonrevy.onboardingSkippedAt'

type OnboardingScreen = {
  eyebrow: string
  title: string
  body: string
  bullets: string[]
}

const onboardingScreens: OnboardingScreen[] = [
  {
    eyebrow: 'Screen 1 of 3',
    title: 'Confidence scores are planning signals, not promises.',
    body: 'NONREVY confidence summarizes how trustworthy a route looks from the signals we have: route shape, available context, freshness, backups, and risk flags.',
    bullets: [
      'Higher confidence means the route framework looks stronger for planning.',
      'Lower confidence means you should protect yourself with backups or a different timing window.',
      'A score never guarantees seats, boarding order, or operational decisions.'
    ]
  },
  {
    eyebrow: 'Screen 2 of 3',
    title: 'Weather is advisory only.',
    body: 'Weather can explain risk, delays, and comfort, but it is not treated as final availability or airline operations truth.',
    bullets: [
      'Use weather to spot disruption risk before you commit to a plan.',
      'Trust live airline, airport, crew, and gate information over weather summaries.',
      'If weather confidence is low, NONREVY should show less certainty — not fake precision.'
    ]
  },
  {
    eyebrow: 'Screen 3 of 3',
    title: 'Standby estimates are estimates.',
    body: 'Standby outcomes depend on loads, releases, priority, check-in timing, no-shows, misconnects, agents, and last-minute operations. NONREVY can help frame the risk; it cannot know the final list.',
    bullets: [
      'Treat standby estimates as directional planning help, not an official boarding position.',
      'Protect important trips with earlier attempts, alternates, and recovery options.',
      'Add your baseline below so routes can be framed around your home airport and pass context.'
    ]
  }
]

function saveSkipMarker() {
  try {
    window.localStorage.setItem(onboardingSkipStorageKey, new Date().toISOString())
    window.dispatchEvent(new Event('nonrevy-onboarding-updated'))
  } catch {
    // Skipping is best-effort only; navigation still works without localStorage.
  }
}

export default function OnboardingPage() {
  const [currentScreen, setCurrentScreen] = useState(0)
  const [employeeAirline, setEmployeeAirline] = useState(defaultOnboardingState.employeeAirline)
  const [travelerType, setTravelerType] = useState<TravelerType>(defaultOnboardingState.travelerType)
  const [passPriority, setPassPriority] = useState(defaultOnboardingState.passPriority)
  const [homeAirport, setHomeAirport] = useState(defaultOnboardingState.homeAirport)
  const [preferredDestinations, setPreferredDestinations] = useState(defaultOnboardingState.preferredDestinations.join(', '))
  const [status, setStatus] = useState('First-run setup is ready. You can skip at any time.')
  const [completedAt, setCompletedAt] = useState<string | undefined>()

  useEffect(() => {
    void Promise.resolve().then(() => {
      const stored = loadOnboardingState()
      setEmployeeAirline(stored.employeeAirline)
      setTravelerType(stored.travelerType)
      setPassPriority(stored.passPriority)
      setHomeAirport(stored.homeAirport)
      setPreferredDestinations(stored.preferredDestinations.join(', '))
      setCompletedAt(stored.completedAt)
    })
  }, [])

  const screen = onboardingScreens[currentScreen]
  const destinationList = useMemo(() => parsePreferredDestinations(preferredDestinations), [preferredDestinations])
  const onboardingPreview: OnboardingState = useMemo(() => ({
    employeeAirline,
    travelerType,
    passPriority,
    homeAirport,
    preferredDestinations: destinationList,
    completedAt,
    updatedAt: new Date().toISOString()
  }), [employeeAirline, travelerType, passPriority, homeAirport, destinationList, completedAt])
  const profilePreview = useMemo(() => onboardingStateToTravelerProfile(onboardingPreview), [onboardingPreview])
  const formReady = Boolean(employeeAirline.trim() && travelerType && passPriority.trim() && homeAirport.trim().length === 3 && destinationList.length)
  const isLastScreen = currentScreen === onboardingScreens.length - 1

  function nextScreen() {
    setCurrentScreen((value) => Math.min(value + 1, onboardingScreens.length - 1))
  }

  function previousScreen() {
    setCurrentScreen((value) => Math.max(value - 1, 0))
  }

  function skipOnboarding() {
    saveSkipMarker()
    setStatus('Onboarding skipped. You can return from Profile when you want to finish setup.')
    window.location.href = '/plan'
  }

  function saveDraft() {
    const saved = saveOnboardingState(onboardingPreview, false)
    setCompletedAt(saved.completedAt)
    setStatus(`Saved onboarding draft locally and refreshed ${travelerProfileStorageKey}.`)
  }

  function completeOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!formReady) {
      setStatus('Add airline, traveler type, pass priority, a 3-letter home airport, and at least one preferred destination — or Skip for now.')
      return
    }

    const saved = saveOnboardingState(onboardingPreview, true)
    setCompletedAt(saved.completedAt)
    setStatus(`Onboarding complete. Traveler profile populated locally at ${travelerProfileStorageKey}.`)
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <Link href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Home</Link>
        <Link href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</Link>
        <Link href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</Link>
        <Link href="/notification-preferences" style={{ marginRight: 16, color: 'var(--color-pink-400)' }}>Notifications</Link>
        <Link href="/profile" style={{ color: 'var(--color-green-500)' }}>Profile</Link>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div className="nonrevy-onboarding__hero">
          <div>
            <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>First-run onboarding</p>
            <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>Understand the signals before you plan.</h1>
            <p style={{ color: 'var(--color-slate-400)', maxWidth: 820, fontSize: 18 }}>
              Three quick screens explain NONREVY confidence, advisory-only weather, and standby estimates. Finish setup or skip and come back later.
            </p>
          </div>
          <button type="button" onClick={skipOnboarding} className="nonrevy-onboarding__skip">Skip</button>
        </div>

        <div className="nonrevy-onboarding__grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)', gap: 18, marginTop: 28 }}>
          <form onSubmit={completeOnboarding} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 24, padding: 22, background: 'var(--color-slate-850)' }}>
            <section className="nonrevy-onboarding__screen" aria-live="polite">
              <p className="nonrevy-onboarding__eyebrow">{screen.eyebrow}</p>
              <h2>{screen.title}</h2>
              <p>{screen.body}</p>
              <ul>
                {screen.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
            </section>

            <div className="nonrevy-onboarding__steps" aria-label="Onboarding progress">
              {onboardingScreens.map((item, index) => (
                <button
                  key={item.eyebrow}
                  type="button"
                  aria-label={`Go to onboarding screen ${index + 1}`}
                  aria-current={index === currentScreen ? 'step' : undefined}
                  onClick={() => setCurrentScreen(index)}
                />
              ))}
            </div>

            {isLastScreen ? (
              <section className="nonrevy-onboarding__traveler-form">
                <h2>Traveler setup</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <label style={{ color: 'var(--color-slate-300)' }}>
                    Employee airline
                    <select value={employeeAirline} onChange={(event) => setEmployeeAirline(event.target.value)} style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}>
                      <option>United</option>
                      <option>Delta</option>
                      <option>Alaska Group</option>
                    </select>
                  </label>
                  <label style={{ color: 'var(--color-slate-300)' }}>
                    Traveler type
                    <select value={travelerType} onChange={(event) => setTravelerType(event.target.value as TravelerType)} style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}>
                      {travelerTypes.map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </label>
                  <label style={{ color: 'var(--color-slate-300)' }}>
                    Pass priority
                    <input value={passPriority} onChange={(event) => setPassPriority(event.target.value.toUpperCase())} placeholder="SA2" style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }} />
                  </label>
                  <label style={{ color: 'var(--color-slate-300)' }}>
                    Home airport
                    <input value={homeAirport} onChange={(event) => setHomeAirport(event.target.value.toUpperCase())} placeholder="LAX" maxLength={3} style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }} />
                  </label>
                </div>
                <label style={{ display: 'block', color: 'var(--color-slate-300)', marginTop: 14 }}>
                  Preferred destinations
                  <input value={preferredDestinations} onChange={(event) => setPreferredDestinations(event.target.value)} placeholder="HNL, OGG, NRT" style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }} />
                  <small style={{ color: 'var(--color-slate-400)' }}>Use airport codes for now. These populate traveler profile preferred airports.</small>
                </label>
              </section>
            ) : null}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              {currentScreen > 0 ? <button type="button" onClick={previousScreen} className="nonrevy-onboarding__secondary">Back</button> : null}
              {!isLastScreen ? <button type="button" onClick={nextScreen} className="nonrevy-onboarding__primary">Next</button> : null}
              {isLastScreen ? (
                <button type="submit" className="nonrevy-onboarding__primary" disabled={!formReady}>
                  Complete onboarding
                </button>
              ) : null}
              <button type="button" onClick={saveDraft} className="nonrevy-onboarding__secondary">
                Save draft
              </button>
              <button type="button" onClick={skipOnboarding} className="nonrevy-onboarding__secondary">
                Skip
              </button>
            </div>
            <p style={{ color: formReady ? 'var(--color-green-500)' : 'var(--color-yellow-400)', marginBottom: 0 }}>{status}</p>
          </form>

          <aside style={{ display: 'grid', gap: 18 }}>
            <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 24, padding: 22, background: 'var(--color-slate-850)' }}>
              <h2 style={{ marginTop: 0 }}>Profile preview</h2>
              {[
                ['Employee airline', profilePreview.employeeAirline],
                ['Traveler type', profilePreview.travelerType],
                ['Pass priority', profilePreview.passPriority],
                ['Home airport', profilePreview.homeAirport],
                ['Preferred destinations', profilePreview.preferredAirports.join(', ')]
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 12, background: 'var(--color-slate-950)', marginTop: 10 }}>
                  <small style={{ color: 'var(--color-slate-400)' }}>{label}</small>
                  <p style={{ color: 'var(--color-slate-50)', margin: '4px 0 0', fontWeight: 'bold' }}>{value}</p>
                </article>
              ))}
              {completedAt && <p style={{ color: 'var(--color-green-500)' }}>Completed {new Date(completedAt).toLocaleString()}</p>}
            </section>
            <ActivationProgressCard compact />
          </aside>
        </div>
      </section>
    </main>
  )
}
