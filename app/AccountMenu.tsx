'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AccountMenu() {
  const [userEmail, setUserEmail] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser()
      setUserEmail(data.user?.email || '')
    }

    loadUser()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email || '')
      setMessage('')
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

  return (
    <aside className="account-menu" aria-label="Account menu">
      <details className="account-menu__details">
        <summary className="account-menu__summary">
          <span className="account-menu__identity">{userEmail || 'Guest'}</span>
        </summary>
        <div className="account-menu__links">
          {!userEmail && <a href="/login">Login</a>}
          <a href="/account">My Account</a>
          <a href="/membership">Membership</a>
          <a href="/billing">Billing</a>
          {userEmail && <button onClick={logout}>Logout</button>}
        </div>
        {message && <small>{message}</small>}
      </details>
    </aside>
  )
}
