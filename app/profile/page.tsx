'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  defaultTravelerProfile,
  loadTravelerProfileFromStorage,
  normalizeTravelerProfile,
  parseAirportList,
  saveTravelerProfileToStorage,
  travelerProfileStorageKey,
  type TravelerType
} from '../../lib/travelerProfile'
import OutcomeHistorySection from '../OutcomeHistorySection'
import TrustScoreSection from '../TrustScoreSection'
import ActivationProgressCard from '../ActivationProgressCard'
import ReferralProgramCard from '../ReferralProgramCard'
import BillingStatusCard from '../BillingStatusCard'

const travelerTypes: TravelerType[] = ['Employee', 'Retiree', 'Companion', 'Buddy Pass']

export default function ProfilePage() {
  const [employeeAirline, setEmployeeAirline] = useState(defaultTravelerProfile.employeeAirline)
  const [travelerType, setTravelerType] = useState<TravelerType>(defaultTravelerProfile.travelerType)
  const [passPriority, setPassPriority] = useState(defaultTravelerProfile.passPriority)
  const [homeAirport, setHomeAirport] = useState(defaultTravelerProfile.homeAirport)
  const [preferredAirports, setPreferredAirports] = useState(defaultTravelerProfile.preferredAirports.join(', '))
  const [saveStatus, setSaveStatus] = useState('Local profile ready.')

  useEffect(() => {
    const storedProfile = loadTravelerProfileFromStorage()
    setEmployeeAirline(storedProfile.employeeAirline)
    setTravelerType(storedProfile.travelerType)
    setPassPriority(storedProfile.passPriority)
    setHomeAirport(storedProfile.homeAirport)
    setPreferredAirports(storedProfile.preferredAirports.join(', '))
  }, [])

  const preferredAirportList = useMemo(() => parseAirportList(preferredAirports), [preferredAirports])
  const profilePreview = useMemo(
    () => normalizeTravelerProfile({
      employeeAirline,
      travelerType,
      passPriority,
      homeAirport,
      preferredAirports: preferredAirportList
    }),
    [employeeAirline, travelerType, passPriority, homeAirport, preferredAirportList]
  )

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveTravelerProfileToStorage(profilePreview)
    setSaveStatus(`Saved locally to ${travelerProfileStorageKey}.`)
  }

  function resetProfile() {
    saveTravelerProfileToStorage(defaultTravelerProfile)
    setEmployeeAirline(defaultTravelerProfile.employeeAirline)
    setTravelerType(defaultTravelerProfile.travelerType)
    setPassPriority(defaultTravelerProfile.passPriority)
    setHomeAirport(defaultTravelerProfile.homeAirport)
    setPreferredAirports(defaultTravelerProfile.preferredAirports.join(', '))
    setSaveStatus('Reset local profile defaults.')
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/onboarding" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Onboarding</a>
        <a href="/profile" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Profile</a>
        <a href="/account" style={{ marginRight: 16, color: 'var(--color-amber-400)' }}>Account</a>
        <a href="/referrals" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Referrals</a>
        <a href="/load-reports" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Load Reports</a>
        <a href="/requests" style={{ color: 'var(--color-purple-400)' }}>Open Requests</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-green-500)', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>
          Traveler profile engine
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>
          Profile assumptions
        </h1>
        <p style={{ color: 'var(--color-slate-400)', maxWidth: 760, fontSize: 18 }}>
          Local profile settings that feed the planner success probability placeholder. Account sync can plug in later.
        </p>

        <div style={{ marginTop: 24 }}>
          <ActivationProgressCard />
        </div>

        <div style={{ marginTop: 18 }}>
          <ReferralProgramCard />
        </div>

        <div style={{ marginTop: 18 }}>
          <BillingStatusCard />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginTop: 28 }}>
          <form onSubmit={saveProfile} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 22, background: 'var(--color-slate-850)' }}>
            <h2 style={{ marginTop: 0 }}>Traveler fields</h2>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Employee airline
              <select
                value={employeeAirline}
                onChange={(event) => setEmployeeAirline(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              >
                <option>United</option>
                <option>Delta</option>
                <option>Alaska Group</option>
              </select>
            </label>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Traveler type
              <select
                value={travelerType}
                onChange={(event) => setTravelerType(event.target.value as TravelerType)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              >
                {travelerTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Pass priority
              <input
                value={passPriority}
                onChange={(event) => setPassPriority(event.target.value.toUpperCase())}
                placeholder="SA2"
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Home airport
              <input
                value={homeAirport}
                onChange={(event) => setHomeAirport(event.target.value.toUpperCase())}
                placeholder="LAX"
                maxLength={3}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: 'var(--color-slate-300)', marginBottom: 12 }}>
              Preferred airports
              <input
                value={preferredAirports}
                onChange={(event) => setPreferredAirports(event.target.value)}
                placeholder="LAX, SFO, DEN"
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'white' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="submit"
                style={{ padding: 12, borderRadius: 10, border: 'none', background: 'var(--color-sky-400)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}
              >
                Save local profile
              </button>
              <button
                type="button"
                onClick={resetProfile}
                style={{ padding: 12, borderRadius: 10, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'var(--color-slate-300)', fontWeight: 'bold' }}
              >
                Reset defaults
              </button>
            </div>
            <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>{saveStatus}</p>
          </form>

          <aside style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 22, background: 'var(--color-slate-850)' }}>
            <h2 style={{ marginTop: 0 }}>Profile summary</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                ['Employee airline', profilePreview.employeeAirline],
                ['Traveler type', profilePreview.travelerType],
                ['Pass priority', profilePreview.passPriority],
                ['Home airport', profilePreview.homeAirport],
                ['Preferred airports', profilePreview.preferredAirports.join(', ')]
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)' }}>
                  <small style={{ color: 'var(--color-slate-400)' }}>{label}</small>
                  <h3 style={{ color: 'var(--color-slate-50)', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
            <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)', marginTop: 14 }}>
              <strong style={{ color: 'var(--color-sky-400)' }}>Supported carrier eligibility</strong>
              {Object.entries(profilePreview.supportedCarrierEligibility).map(([carrier, eligibility]) => (
                <p key={carrier} style={{ color: 'var(--color-slate-300)', margin: '8px 0 0' }}>
                  {carrier.replace('-', ' ')}: {eligibility}
                </p>
              ))}
            </section>
            <a href="/plan" style={{ display: 'inline-block', color: 'var(--color-sky-400)', marginTop: 16 }}>
              View planner probability assumptions
            </a>
            <br />
            <a href="/load-reports" style={{ display: 'inline-block', color: 'var(--color-yellow-400)', marginTop: 10 }}>
              Verify community load report
            </a>
          </aside>
        </div>
        <TrustScoreSection />
        <OutcomeHistorySection />
      </section>
    </main>
  )
}
