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
import { accountPersistenceHeaders } from '../../lib/accountPersistenceClient'

const travelerTypes: TravelerType[] = ['Employee', 'Retiree', 'Companion', 'Buddy Pass']

export default function ProfilePage() {
  const [employeeAirline, setEmployeeAirline] = useState(defaultTravelerProfile.employeeAirline)
  const [travelerType, setTravelerType] = useState<TravelerType>(defaultTravelerProfile.travelerType)
  const [passPriority, setPassPriority] = useState(defaultTravelerProfile.passPriority)
  const [homeAirport, setHomeAirport] = useState(defaultTravelerProfile.homeAirport)
  const [preferredAirports, setPreferredAirports] = useState(defaultTravelerProfile.preferredAirports.join(', '))
  const [saveStatus, setSaveStatus] = useState('Profile ready. Update these details whenever your travel access changes.')
  const [verification, setVerification] = useState({
    status: 'unverified',
    airlineCode: '',
    airlineName: '',
    method: '',
    verifiedAt: '',
    submittedAt: ''
  })

  useEffect(() => {
    const storedProfile = loadTravelerProfileFromStorage()
    setEmployeeAirline(storedProfile.employeeAirline)
    setTravelerType(storedProfile.travelerType)
    setPassPriority(storedProfile.passPriority)
    setHomeAirport(storedProfile.homeAirport)
    setPreferredAirports(storedProfile.preferredAirports.join(', '))
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadVerification() {
      try {
        const response = await fetch('/api/employee-verification', {
          headers: await accountPersistenceHeaders(),
          cache: 'no-store'
        })
        if (!response.ok) return
        const data = await response.json() as { verification?: typeof verification }
        if (!cancelled && data.verification) setVerification({ ...verification, ...data.verification })
      } catch {
        // Profile remains usable for verification guidance even if account status cannot load.
      }
    }
    loadVerification()
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setSaveStatus('Profile saved. Searches will use these traveler details when available.')
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
    <main className="app-shell nonrevy-traveler-page nonrevy-profile-page" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Search</a>
        <a href="/onboarding" style={{ marginRight: 16, color: '#38bdf8' }}>Setup</a>
        <a href="/profile" style={{ marginRight: 16, color: '#22c55e' }}>Profile</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/beta-feedback" style={{ color: '#c084fc' }}>Feedback</a>
      </nav>

      <section className="nonrevy-traveler-page__inner" style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p className="nonrevy-traveler-page__eyebrow" style={{ color: '#22c55e', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>
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

        <section className="nonrevy-traveler-card nonrevy-employee-verification-card" style={{ border: '1px solid #dbe3ef', borderRadius: 18, padding: 18, background: '#ffffff', color: '#111827', marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <small style={{ color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Airline employee verification</small>
              <h2 style={{ margin: '4px 0 0' }}>
                {verification.status === 'verified' ? 'Verified' : verification.status === 'pending' ? 'Pending review' : verification.status === 'rejected' ? 'Needs resubmission' : 'Verification required'}
              </h2>
            </div>
            <span className="nonrevy-traveler-badge">{verification.airlineCode || 'Not verified'}</span>
          </div>
          <p style={{ color: '#334155', margin: '10px 0 0' }}>
            {verification.status === 'verified'
              ? `${verification.airlineName || verification.airlineCode} · ${verification.method.replaceAll('_', ' ') || 'verified'}${verification.verifiedAt ? ` · ${new Date(verification.verifiedAt).toLocaleDateString()}` : ''}`
              : verification.status === 'pending'
                ? `${verification.airlineName || 'Airline'} review is pending. Full product access unlocks after approval.`
                : 'Verify airline affiliation before using search, results, saved trips, watchlist, or load-request tools.'}
          </p>
          <p style={{ color: '#475569', margin: '8px 0 0' }}>
            Employment verification is separate from ZED agreement eligibility. ZED access still needs its own profile review.
          </p>
          <a href="/verify" style={{ display: 'inline-block', color: '#2563eb', fontWeight: 800, marginTop: 12 }}>Manage verification</a>
        </section>

        <div className="nonrevy-traveler-page__grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginTop: 28 }}>
          <details className="nonrevy-traveler-card nonrevy-traveler-disclosure">
            <summary>Edit traveler details</summary>
          <form className="nonrevy-traveler-form" onSubmit={saveProfile} style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Airline and travel access</h2>
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
            <p className="nonrevy-traveler-status" style={{ color: '#94a3b8', marginBottom: 0 }}>{saveStatus}</p>
          </form>
          </details>

          <aside className="nonrevy-traveler-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Profile summary</h2>
            <div className="nonrevy-traveler-list" style={{ display: 'grid', gap: 12 }}>
              {[
                ['Employee airline', profilePreview.employeeAirline],
                ['Traveler type', profilePreview.travelerType],
                ['Pass priority', profilePreview.passPriority],
                ['Home airport', profilePreview.homeAirport],
                ['Preferred airports', profilePreview.preferredAirports.join(', ')]
              ].map(([label, value]) => (
                <article className="nonrevy-traveler-row" key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                  <small style={{ color: '#94a3b8' }}>{label}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{value}</h3>
                </article>
              ))}
            </div>
            <section className="nonrevy-traveler-card nonrevy-zed-profile" style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617', marginTop: 14 }}>
              <strong style={{ color: '#38bdf8' }}>ZED agreements</strong>
              <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>
                Current profile signals only. Missing carriers remain unconfirmed until reviewed.
              </p>
              <div className="nonrevy-zed-profile__badges" aria-label="Supported carrier eligibility">
                {Object.entries(profilePreview.supportedCarrierEligibility).map(([carrier, eligibility]) => (
                  <span className="nonrevy-traveler-badge" key={carrier} title={eligibility}>
                    {carrier.replace('-', ' ')} · {eligibility}
                  </span>
                ))}
              </div>
              {profilePreview.zedAgreements.length ? (
                <div className="nonrevy-zed-profile__agreements">
                  {profilePreview.zedAgreements.map((agreement) => (
                    <article className="nonrevy-traveler-row" key={agreement.id}>
                      <div>
                        <strong>{agreement.airlineCode}</strong>
                        <span>{agreement.airlineName}</span>
                      </div>
                      <span className="nonrevy-traveler-badge">{agreement.active ? 'Active' : 'Inactive'}</span>
                      <span className="nonrevy-traveler-badge">{agreement.verificationStatus.replaceAll('_', ' ')}</span>
                      <small>{agreement.eligibleTravelerTypes.join(', ') || 'Eligibility not specified'} · {agreement.cabinAccess.join(', ') || 'Cabin not specified'}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <article className="nonrevy-traveler-empty nonrevy-traveler-empty--compact">
                  <h3>No ZED agreements added yet.</h3>
                  <p>Add agreement details when they are available so search results can show clearer eligibility.</p>
                </article>
              )}
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
