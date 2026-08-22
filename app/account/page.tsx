'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

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
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Search</a>
        <a href="/saved-searches" style={{ marginRight: 16, color: '#67e8f9' }}>Saved</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/profile" style={{ marginRight: 16, color: '#22c55e' }}>Profile</a>
        <a href="/beta-feedback" style={{ color: '#c084fc' }}>Feedback</a>
      </nav>

      <section style={{ maxWidth: 860 }}>
        <p style={{ color: '#38bdf8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Private beta account</p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>My Account</h1>
        <p style={{ color: '#94a3b8' }}>Your account keeps saved searches, watched routes, load requests, and feedback connected across beta sessions.</p>

        <div className="mini-card" style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Signed-in identity</h2>
          <p>Email/name: {userEmail || 'Not signed in'}</p>
          <p style={{ color: '#cbd5e1' }}>
            Complete your traveler profile when you want ZED eligibility and recommendation context to be more useful. Basic search still works if your profile is incomplete.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/profile" style={{ color: '#38bdf8' }}>Review traveler profile</a>
            <a href="/my-requests" style={{ color: '#facc15' }}>View load requests</a>
            {!userEmail ? <a href="/login?returnTo=/account" style={{ color: '#22c55e' }}>Log in</a> : null}
          </div>
        </div>
      </section>
    </main>
  )
}
