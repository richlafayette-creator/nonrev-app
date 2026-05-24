'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  async function signIn() {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: 'https://nonrev-app.vercel.app' }
    })

    setMessage(error ? error.message : 'Magic link sent. Check your email.')
  }

  return (
    <main style={{ padding: 40, fontFamily: 'Arial' }}>
      <h1>Login</h1>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        style={{ padding: 12, width: 320 }}
      />
      <button onClick={signIn} style={{ padding: 12, marginLeft: 8 }}>
        Send Magic Link
      </button>
      <p>{message}</p>
    </main>
  )
}
