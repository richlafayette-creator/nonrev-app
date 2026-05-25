'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error ? error.message : 'Account created. You can now log in.')
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Logged in.')
      window.location.href = '/'
    }
  }

  return (
    <main style={{ padding: 40, fontFamily: 'Arial' }}>
      <h1>Login</h1>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: 'block', padding: 12, marginBottom: 12, width: 320 }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: 'block', padding: 12, marginBottom: 12, width: 320 }}
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
