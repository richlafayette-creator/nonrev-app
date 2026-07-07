'use client'

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

export default function OnboardingPage() {
  const [employeeAirline, setEmployeeAirline] = useState(defaultOnboardingState.employeeAirline)
  const [travelerType, setTravelerType] = useState<TravelerType>(defaultOnboardingState.travelerType)
  const [passPriority, setPassPriority] = useState(defaultOnboardingState.passPriority)
  const [homeAirport, setHomeAirport] = useState(defaultOnboardingState.homeAirport)
  const [preferredDestinations, setPreferredDestinations] = useState(defaultOnboardingState.preferredDestinations.join(', '))
  const [status, setStatus] = useState('First-run setup is ready.')
  const [completedAt, setCompletedAt] = useState<string | undefined>()

  useEffect(() => {
    const stored = loadOnboardingState()
    setEmployeeAirline(stored.employeeAirline)
    setTravelerType(stored.travelerType)
    setPassPriority(stored.passPriority)
    setHomeAirport(stored.homeAirport)
    setPreferredDestinations(stored.preferredDestinations.join(', '))
    setCompletedAt(stored.completedAt)
  }, [])

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

  function saveDraft() {
    const saved = saveOnboardingState(onboardingPreview, false)
    setCompletedAt(saved.completedAt)
    setStatus(`Saved onboarding draft locally and refreshed ${travelerProfileStorageKey}.`)
  }

  function completeOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!formReady) {
      setStatus('Add airline, traveler type, pass priority, a 3-letter home airport, and at least one preferred destination.')
      return
    }

    const saved = saveOnboardingState(onboardingPreview, true)
    setCompletedAt(saved.completedAt)
    setStatus(`Onboarding complete. Traveler profile populated locally at ${travelerProfileStorageKey}.`)
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/notification-preferences" style={{ marginRight: 16, color: 'var(--color-pink-400)' }}>Notifications</a>
        <a href="/profile" style={{ color: 'var(--color-green-500)' }}>Profile</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>First-run onboarding</p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>Set up your nonrev baseline.</h1>
        <p style={{ color: 'var(--color-slate-400)', maxWidth: 820, fontSize: 18 }}>
          NONREVY uses these local assumptions to seed traveler profile, route confidence, planning defaults, and activation progress. Account sync can plug in later.
        </p>

        <div className="nonrevy-onboarding__grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)', gap: 18, marginTop: 28 }}>
          <form onSubmit={completeOnboarding} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 24, padding: 22, background: 'var(--color-slate-850)' }}>
            <h2 style={{ marginTop: 0 }}>Traveler setup</h2>
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

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              <button type="submit" style={{ padding: '13px 18px', borderRadius: 999, border: 'none', background: formReady ? 'var(--color-sky-400)' : 'var(--color-slate-600)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
                Complete onboarding
              </button>
              <button type="button" onClick={saveDraft} style={{ padding: '13px 18px', borderRadius: 999, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'var(--color-slate-300)', fontWeight: 'bold' }}>
                Save draft
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
