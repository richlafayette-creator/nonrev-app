'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  defaultTravelerProfile,
  loadTravelerProfileFromStorage,
  normalizeTravelerProfile,
  parseAirportList,
  saveTravelerProfileToStorage,
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
  const [saveStatus, setSaveStatus] = useState('Profile ready. Update these details whenever your travel access changes.')

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
    setSaveStatus('Profile saved for this browser. Searches will use these traveler details when available.')
  }

  function resetProfile() {
    saveTravelerProfileToStorage(defaultTravelerProfile)
    setEmployeeAirline(defaultTravelerProfile.employeeAirline)
    setTravelerType(defaultTravelerProfile.travelerType)
    setPassPriority(defaultTravelerProfile.passPriority)
    setHomeAirport(defaultTravelerProfile.homeAirport)
    setPreferredAirports(defaultTravelerProfile.preferredAirports.join(', '))
    setSaveStatus('Profile reset to beta defaults.')
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Search</a>
        <a href="/onboarding" style={{ marginRight: 16, color: '#38bdf8' }}>Setup</a>
        <a href="/profile" style={{ marginRight: 16, color: '#22c55e' }}>Profile</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/beta-feedback" style={{ color: '#c084fc' }}>Feedback</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#22c55e', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>
          Traveler profile
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>
          Your travel access
        </h1>
        <p style={{ color: '#94a3b8', maxWidth: 760, fontSize: 18 }}>
          Keep your employee airline, pass type, home airport, and preferred airports current. Nonrevy uses this to label ZED eligibility as confirmed, partial, unavailable, or unknown.
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
          <form onSubmit={saveProfile} style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Traveler details</h2>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Employee airline
              <select
                value={employeeAirline}
                onChange={(event) => setEmployeeAirline(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                <option>United</option>
                <option>Delta</option>
                <option>Alaska Group</option>
              </select>
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Traveler type
              <select
                value={travelerType}
                onChange={(event) => setTravelerType(event.target.value as TravelerType)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                {travelerTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Pass priority
              <input
                value={passPriority}
                onChange={(event) => setPassPriority(event.target.value.toUpperCase())}
                placeholder="SA2"
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Home airport
              <input
                value={homeAirport}
                onChange={(event) => setHomeAirport(event.target.value.toUpperCase())}
                placeholder="LAX"
                maxLength={3}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Preferred airports
              <input
                value={preferredAirports}
                onChange={(event) => setPreferredAirports(event.target.value)}
                placeholder="LAX, SFO, DEN"
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="submit"
                style={{ padding: 12, borderRadius: 10, border: 'none', background: '#38bdf8', color: '#020617', fontWeight: 'bold' }}
              >
                Save profile
              </button>
              <button
                type="button"
                onClick={resetProfile}
                style={{ padding: 12, borderRadius: 10, border: '1px solid #475569', background: '#020617', color: '#cbd5e1', fontWeight: 'bold' }}
              >
                Reset defaults
              </button>
            </div>
            <p style={{ color: '#94a3b8', marginBottom: 0 }}>{saveStatus}</p>
          </form>

          <aside style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Profile summary</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                ['Employee airline', profilePreview.employeeAirline],
                ['Traveler type', profilePreview.travelerType],
                ['Pass priority', profilePreview.passPriority],
                ['Home airport', profilePreview.homeAirport],
                ['Preferred airports', profilePreview.preferredAirports.join(', ')]
              ].map(([label, value]) => (
                <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
            <section style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617', marginTop: 14 }}>
              <strong style={{ color: '#38bdf8' }}>Supported carrier eligibility</strong>
              <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>
                Agreements you enter here only. Missing carriers remain eligibility unknown until you review your profile.
              </p>
              {Object.entries(profilePreview.supportedCarrierEligibility).map(([carrier, eligibility]) => (
                <p key={carrier} style={{ color: '#cbd5e1', margin: '8px 0 0' }}>
                  {carrier.replace('-', ' ')}: {eligibility}
                </p>
              ))}
            </section>
            <a href="/" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 16 }}>
              Search with this profile
            </a>
            <br />
            <a href="/beta-feedback" style={{ display: 'inline-block', color: '#facc15', marginTop: 10 }}>
              Send beta feedback
            </a>
          </aside>
        </div>
        <TrustScoreSection />
        <OutcomeHistorySection />
      </section>
    </main>
  )
}
