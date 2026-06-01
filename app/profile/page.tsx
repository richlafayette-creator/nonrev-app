'use client'

import { useMemo, useState } from 'react'
import { defaultTravelerProfile } from '../../lib/travelerProfile'

export default function ProfilePage() {
  const [employeeAirline, setEmployeeAirline] = useState(defaultTravelerProfile.employeeAirline)
  const [travelerType, setTravelerType] = useState(defaultTravelerProfile.travelerType)
  const [companionStatus, setCompanionStatus] = useState(defaultTravelerProfile.companionStatus)
  const [preferredAirports, setPreferredAirports] = useState(defaultTravelerProfile.preferredAirports.join(', '))

  const preferredAirportList = useMemo(
    () => preferredAirports.split(',').map((airport) => airport.trim().toUpperCase()).filter(Boolean),
    [preferredAirports]
  )

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: '#22c55e' }}>Profile</a>
        <a href="/account" style={{ marginRight: 16, color: '#fbbf24' }}>Account</a>
        <a href="/requests" style={{ color: '#c084fc' }}>Open Requests</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#22c55e', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>
          Traveler profile scaffold
        </p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>
          Profile assumptions
        </h1>
        <p style={{ color: '#94a3b8', maxWidth: 760, fontSize: 18 }}>
          Local placeholder profile fields for routing assumptions. Saved profile persistence and account sync can plug in later.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginTop: 28 }}>
          <form style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Traveler fields</h2>
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
                onChange={(event) => setTravelerType(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                <option>Employee standby</option>
                <option>Retiree standby</option>
                <option>Buddy pass</option>
                <option>Family eligible</option>
              </select>
            </label>
            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: 12 }}>
              Companion status
              <select
                value={companionStatus}
                onChange={(event) => setCompanionStatus(event.target.value)}
                style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
              >
                <option>Solo traveler</option>
                <option>One companion eligible</option>
                <option>Multiple companions</option>
                <option>Companion pass holder</option>
              </select>
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
            <p style={{ color: '#94a3b8', marginBottom: 0 }}>
              Local UI only. The planner currently reads the default scaffold assumptions from shared local code.
            </p>
          </form>

          <aside style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Supported carrier eligibility</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {Object.entries(defaultTravelerProfile.supportedCarrierEligibility).map(([carrier, eligibility]) => (
                <article key={carrier} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                  <small style={{ color: '#94a3b8', textTransform: 'uppercase' }}>{carrier.replace('-', ' ')}</small>
                  <h3 style={{ color: '#f8fafc', margin: '6px 0 0' }}>{eligibility}</h3>
                </article>
              ))}
            </div>
            <div style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617', marginTop: 14 }}>
              <strong style={{ color: '#38bdf8' }}>Current local preview</strong>
              <p style={{ color: '#cbd5e1' }}>Employee airline: {employeeAirline}</p>
              <p style={{ color: '#cbd5e1' }}>Traveler type: {travelerType}</p>
              <p style={{ color: '#cbd5e1' }}>Companion status: {companionStatus}</p>
              <p style={{ color: '#cbd5e1', marginBottom: 0 }}>Preferred airports: {preferredAirportList.join(', ') || 'None selected'}</p>
            </div>
            <a href="/plan" style={{ display: 'inline-block', color: '#38bdf8', marginTop: 16 }}>
              View planner probability assumptions
            </a>
          </aside>
        </div>
      </section>
    </main>
  )
}
