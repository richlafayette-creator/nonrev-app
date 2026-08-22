'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  function returnTarget() {
    const params = new URLSearchParams(window.location.search)
    const returnTo = params.get('returnTo') || params.get('next') || '/'
    return returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error ? 'Could not create that account. Check the email and password, then try again.' : 'Account created. You can now log in.')
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMessage('Could not log in. Check your email and password, then try again.')
    } else {
      setMessage('Logged in.')
      window.location.href = returnTarget()
    }
  }

  return (
    <main style={{ padding: 40, fontFamily: 'Arial', maxWidth: 520 }}>
      <h1>Login</h1>
      <p style={{ color: '#475569', lineHeight: 1.5 }}>
        Sign in to keep saved searches, watched flights, and load requests connected to your beta account.
      </p>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: 'block', boxSizing: 'border-box', padding: 12, marginBottom: 12, width: '100%', maxWidth: 360 }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: 'block', boxSizing: 'border-box', padding: 12, marginBottom: 12, width: '100%', maxWidth: 360 }}
      />

      <button onClick={signUp} style={{ padding: 12, marginRight: 8 }}>
        Sign Up
      </button>

      <button onClick={signIn} style={{ padding: 12 }}>
        Login
      </button>

      <p>{message}</p>
    </main>
  )
}
