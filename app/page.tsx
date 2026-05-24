'use client'

import { useEffect, useState } from 'react'

export default function Home() {
  const [message, setMessage] = useState('Loading...')

  useEffect(() => {
    async function test() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!url || !key) {
        setMessage(`Missing env. URL: ${!!url}, KEY: ${!!key}`)
        return
      }

      const res = await fetch(`${url}/rest/v1/flights?select=*&limit=5`, {
        headers: { apikey: key }
      })

      const text = await res.text()
      setMessage(`Status: ${res.status} | ${text}`)
    }

    test()
  }, [])

  return (
    <main style={{ padding: 40 }}>
      <h1>Debug Supabase</h1>
      <pre>{message}</pre>
    </main>
  )
}
