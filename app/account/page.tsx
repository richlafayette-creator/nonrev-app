'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import OutcomeHistorySection from '../OutcomeHistorySection'

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
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: '#22c55e' }}>Profile</a>
        <a href="/billing" style={{ marginRight: 16, color: '#fbbf24' }}>Billing</a>
        <a href="/membership" style={{ marginRight: 16, color: '#34d399' }}>Membership</a>
        <a href="/requests" style={{ color: '#c084fc' }}>Open Requests</a>
      </nav>

      <section style={{ maxWidth: 860 }}>
        <p style={{ color: '#38bdf8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Account scaffold</p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>My Account</h1>
        <p style={{ color: '#94a3b8' }}>Profile, preferences, saved airports, and notification defaults will live here.</p>

        <div className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Signed-in identity</h2>
          <p>Email/name: {userEmail || 'Not signed in'}</p>
          <p style={{ color: '#cbd5e1' }}>Future fields: home airport, employee/companion traveler settings, preferred airlines, and accessibility/travel preferences.</p>
          <a href="/profile" style={{ color: '#38bdf8' }}>Open traveler profile scaffold</a>
        </div>
        <OutcomeHistorySection />
      </section>
    </main>
  )
}
