'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
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

  async function logout() {
    await supabase.auth.signOut()
    setUserEmail('')
    setMessage('Logged out.')
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = search.trim()
    if (!query) {
      setMessage('Add a destination, route, or flight number to start planning.')
      return
    }

    window.location.href = `/plan?q=${encodeURIComponent(query)}`
  }

  function startVoiceScaffold() {
    setMessage('Voice input scaffold ready — speech capture will fill the search box here.')
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24, justifyContent: 'center' }}>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/best-routes" style={{ marginRight: 16, color: '#fb7185' }}>Best Routes</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/reputation" style={{ marginRight: 16, color: '#34d399' }}>Trust</a>
        <a href="/notifications" style={{ marginRight: 16, color: '#f472b6' }}>Notifications</a>
        <a href="/agent" style={{ marginRight: 16, color: '#a78bfa' }}>Agent</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ marginRight: 16, color: '#22c55e' }}>Outcomes</a>
        {userEmail ? (
          <>
            <span style={{ color: '#38bdf8', marginRight: 12 }}>{userEmail}</span>
            <button onClick={logout} style={{ padding: 8, borderRadius: 8, border: 'none' }}>Logout</button>
          </>
        ) : (
          <a href="/login" style={{ color: '#f472b6' }}>Login</a>
        )}
      </nav>

      <section style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 760, textAlign: 'center' }}>
          <h1 className="nonrevy-logo" style={{ fontSize: 72, lineHeight: 1, margin: '0 0 42px' }}>
            nonrevy
          </h1>

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
                aria-label="Voice input scaffold"
                onClick={startVoiceScaffold}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: 999, border: '1px solid #475569', background: '#020617', color: '#f472b6', fontSize: 18 }}
              >
                🎙️
              </button>
            </div>
            <button type="submit" style={{ marginTop: 18, padding: '14px 24px', borderRadius: 999, border: 'none', background: '#38bdf8', color: '#020617', fontWeight: 'bold' }}>
              Search flights and plan
            </button>
          </form>

          {message && <p style={{ color: '#38bdf8', marginTop: 18 }}>{message}</p>}
        </div>
      </section>
    </main>
  )
}
