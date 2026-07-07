'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import OutcomeHistorySection from '../OutcomeHistorySection'
import ReferralProgramCard from '../ReferralProgramCard'
import BillingStatusCard from '../BillingStatusCard'

export default function AccountPage() {
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser()
      setUserEmail(data.user?.email || '')
    }

    loadUser()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || '')
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: 'var(--color-green-500)' }}>Profile</a>
        <a href="/billing" style={{ marginRight: 16, color: 'var(--color-amber-400)' }}>Billing</a>
        <a href="/membership" style={{ marginRight: 16, color: 'var(--color-green-400)' }}>Membership</a>
        <a href="/referrals" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Referrals</a>
        <a href="/load-reports" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Load Reports</a>
        <a href="/requests" style={{ color: 'var(--color-purple-400)' }}>Open Requests</a>
      </nav>

      <section style={{ maxWidth: 860 }}>
        <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Account scaffold</p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>My Account</h1>
        <p style={{ color: 'var(--color-slate-400)' }}>Profile, preferences, saved airports, and notification defaults will live here.</p>

        <div className="mini-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Signed-in identity</h2>
          <p>Email/name: {userEmail || 'Not signed in'}</p>
          <p style={{ color: 'var(--color-slate-300)' }}>Future fields: home airport, employee/companion traveler settings, preferred airlines, and accessibility/travel preferences.</p>
          <a href="/profile" style={{ color: 'var(--color-sky-400)', marginRight: 14 }}>Open traveler profile scaffold</a>
          <a href="/load-reports" style={{ color: 'var(--color-yellow-400)' }}>Verify load report</a>
        </div>
        <div style={{ marginTop: 18 }}>
          <ReferralProgramCard />
        </div>
        <div style={{ marginTop: 18 }}>
          <BillingStatusCard />
        </div>
        <OutcomeHistorySection />
      </section>
    </main>
  )
}
