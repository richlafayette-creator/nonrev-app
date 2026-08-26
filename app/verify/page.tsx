'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { accountPersistenceHeaders } from '../../lib/accountPersistenceClient'

type AirlineOption = {
  code: string
  icao?: string
  name: string
  aliases?: string[]
  domainsKnown?: boolean
  verificationMethods?: string[]
}

type VerificationStatus = {
  status: string
  airlineCode?: string
  airlineName?: string
  method?: string
  emailDomain?: string
  submittedAt?: string
  verifiedAt?: string
  reasonCategory?: string
}

type VerificationResponse = {
  verification: VerificationStatus
  airlines: AirlineOption[]
  challenge?: EmailChallenge
  emailSent?: boolean
  detail?: string
  disclosure?: string
}

type EmailChallenge = {
  challengeId: string
  airlineCode: string
  airlineName: string
  emailDomain: string
  expiresAt: string
  sendCount: number
}

const defaultAirlines: AirlineOption[] = [
  { code: 'UA', name: 'United Airlines' },
  { code: 'AA', name: 'American Airlines' },
  { code: 'DL', name: 'Delta Air Lines' },
  { code: 'AS', name: 'Alaska Airlines' },
  { code: 'WN', name: 'Southwest Airlines' }
]

function statusLabel(status: string) {
  if (status === 'verified') return 'Verified'
  if (status === 'pending') return 'Pending review'
  if (status === 'rejected') return 'Needs resubmission'
  if (status === 'reverify_required') return 'Reverification needed'
  if (status === 'expired') return 'Expired'
  return 'Not verified'
}

function formatDate(value?: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function safeNextRoute(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export default function VerifyPage() {
  const [airlines, setAirlines] = useState<AirlineOption[]>(defaultAirlines)
  const [verification, setVerification] = useState<VerificationStatus>({ status: 'unverified' })
  const [airlineCode, setAirlineCode] = useState('UA')
  const [airlineQuery, setAirlineQuery] = useState('United Airlines (UA)')
  const [workEmail, setWorkEmail] = useState('')
  const [emailChallenge, setEmailChallenge] = useState<EmailChallenge | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [status, setStatus] = useState('Preview schedules now, then verify airline eligibility when you need member-only non-rev tools.')
  const [loading, setLoading] = useState(false)
  const [nextRoute, setNextRoute] = useState('/')

  useEffect(() => {
    let cancelled = false
    async function loadVerification() {
      try {
        const response = await fetch('/api/employee-verification', {
          headers: await accountPersistenceHeaders(),
          cache: 'no-store'
        })
        if (!response.ok) return
        const data = await response.json() as VerificationResponse
        if (cancelled) return
        setVerification(data.verification || { status: 'unverified' })
        setAirlines(data.airlines?.length ? data.airlines : defaultAirlines)
        const nextCode = data.verification?.airlineCode || data.airlines?.[0]?.code || 'UA'
        const nextAirline = (data.airlines?.length ? data.airlines : defaultAirlines).find((airline) => airline.code === nextCode)
        setAirlineCode(nextCode)
        setAirlineQuery(nextAirline ? `${nextAirline.name} (${nextAirline.code})` : nextCode)
        const params = new URLSearchParams(window.location.search)
        const emailStatus = params.get('email')
        if (emailStatus === 'verified') setStatus('Your airline employment has been verified.')
        else if (emailStatus === 'expired') setStatus('That verification link expired. Send a new verification email.')
        else if (emailStatus === 'invalid') setStatus('That verification link could not be used. Send a new email or request manual review.')
        else setStatus(data.detail || data.disclosure || 'Verification status loaded.')
      } catch {
        if (!cancelled) setStatus('Verification status could not be loaded. You can still submit a request.')
      }
    }
    loadVerification()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setNextRoute(safeNextRoute(params.get('next')))
  }, [])

  const selectedAirline = useMemo(() => airlines.find((airline) => airline.code === airlineCode), [airlines, airlineCode])
  const filteredAirlines = useMemo(() => {
    const query = airlineQuery.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!query) return airlines.slice(0, 12)
    return airlines.filter((airline) => {
      const haystack = [airline.code, airline.icao || '', airline.name].join(' ').toLowerCase()
      const compact = haystack.replace(/[^a-z0-9]/g, '')
      return haystack.includes(airlineQuery.trim().toLowerCase()) || compact.includes(query)
    }).slice(0, 12)
  }, [airlineQuery, airlines])
  const companyEmailAvailable = selectedAirline?.verificationMethods?.includes('company_email') || selectedAirline?.domainsKnown
  const verified = verification.status === 'verified'
  const pending = verification.status === 'pending'

  function updateAirline(value: string) {
    setAirlineQuery(value)
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    const matches = airlines.filter((airline) => {
      const names = [airline.name, ...(airline.aliases || [])]
      const codes = [airline.code, airline.icao || ''].filter(Boolean)
      return codes.some((code) => code.toLowerCase() === value.trim().toLowerCase() || code.toLowerCase() === normalized) ||
        names.some((name) => name.toLowerCase() === value.trim().toLowerCase() || name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized) ||
        `${airline.name} (${airline.code})`.toLowerCase() === value.trim().toLowerCase()
    })
    const partialMatches = matches.length ? matches : airlines.filter((airline) => {
      const values = [airline.name, ...(airline.aliases || []), airline.code, airline.icao || ''].map((item) => item.toLowerCase().replace(/[^a-z0-9]/g, ''))
      return normalized.length >= 3 && values.some((item) => item.includes(normalized))
    })
    const selected = partialMatches.length === 1 ? partialMatches[0] : matches[0]
    if (selected) setAirlineCode(selected.code)
  }

  async function submit(action: 'start-email-verification' | 'request-manual-review') {
    setLoading(true)
    setStatus(action === 'start-email-verification' ? 'Checking work email domain...' : 'Submitting manual review request...')
    try {
      const response = await fetch('/api/employee-verification', {
        method: 'POST',
        headers: await accountPersistenceHeaders(),
        body: JSON.stringify({
          action,
          airlineCode,
          workEmail,
          reasonCategory: action === 'request-manual-review' ? 'cannot-use-work-email' : undefined
        })
      })
      const data = await response.json() as Partial<VerificationResponse> & { error?: string }
      if (!response.ok) {
        setStatus(data.error || 'Verification request could not be submitted.')
        if (data.challenge) setEmailChallenge(data.challenge)
        return
      }
      setVerification(data.verification || { status: 'pending', airlineCode, airlineName: selectedAirline?.name })
      if (data.challenge) setEmailChallenge(data.challenge)
      setStatus(data.detail || 'Verification request submitted.')
    } catch {
      setStatus('Verification request failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submit('start-email-verification')
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!emailChallenge) return
    setLoading(true)
    setStatus('Checking verification code...')
    try {
      const response = await fetch('/api/employee-verification', {
        method: 'POST',
        headers: await accountPersistenceHeaders(),
        body: JSON.stringify({
          action: 'verify-code',
          challengeId: emailChallenge.challengeId,
          code: verificationCode
        })
      })
      const data = await response.json() as Partial<VerificationResponse> & { error?: string }
      if (!response.ok) {
        setStatus(data.error || 'Verification code was not accepted.')
        return
      }
      setVerification(data.verification || { status: 'verified', airlineCode, airlineName: selectedAirline?.name })
      setStatus(data.detail || 'Your airline employment has been verified.')
      if (nextRoute && nextRoute !== '/verify') window.location.assign(nextRoute)
    } catch {
      setStatus('Verification code could not be checked. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function resendEmail() {
    if (!emailChallenge) return
    setLoading(true)
    setStatus('Resending verification email...')
    try {
      const response = await fetch('/api/employee-verification', {
        method: 'POST',
        headers: await accountPersistenceHeaders(),
        body: JSON.stringify({
          action: 'resend-email-verification',
          challengeId: emailChallenge.challengeId,
          workEmail
        })
      })
      const data = await response.json() as Partial<VerificationResponse> & { error?: string }
      if (!response.ok) {
        setStatus(data.error || 'Verification email could not be resent.')
        return
      }
      if (data.challenge) setEmailChallenge(data.challenge)
      setStatus(data.detail || 'We sent a new verification email to your work address.')
    } catch {
      setStatus('Verification email could not be resent. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell nonrevy-traveler-page nonrevy-verification-page" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <section className="nonrevy-traveler-page__inner" style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
        <p className="nonrevy-traveler-page__eyebrow" style={{ color: '#2563eb', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
          Airline employee verification
        </p>
        <header>
          <h1 style={{ fontSize: 38, lineHeight: 1.05, margin: '8px 0 12px' }}>Unlock Nonrevy traveler features</h1>
          <p style={{ color: '#334155', maxWidth: 760, fontSize: 17 }}>
            Nonrevy verifies airline eligibility before providing member-only non-rev tools and community intelligence. You can preview public schedules first, then verify when you need ZED-aware planning, load intelligence, saved trips, watchlists, and load requests.
          </p>
        </header>

        <section className="nonrevy-traveler-card" style={{ border: '1px solid #dbe3ef', borderRadius: 18, padding: 18, background: '#ffffff', color: '#111827' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <small style={{ color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Current status</small>
              <h2 style={{ margin: '4px 0 0', fontSize: 24 }}>{statusLabel(verification.status)}</h2>
            </div>
            <span className="nonrevy-traveler-badge">{verification.airlineCode || 'Airline pending'}</span>
          </div>
          {verification.airlineName ? <p style={{ color: '#334155', margin: '10px 0 0' }}>{verification.airlineName} · {verification.method?.replaceAll('_', ' ') || 'verification'}</p> : null}
          {verification.verifiedAt ? <p style={{ color: '#166534', margin: '8px 0 0' }}>Verified {formatDate(verification.verifiedAt)}</p> : null}
          {pending ? <p style={{ color: '#92400e', margin: '8px 0 0' }}>Your request is pending review. Public schedule preview remains available; saved trips, watchlist, ZED details, and load-request tools unlock after approval.</p> : null}
          <p style={{ color: '#475569', marginBottom: 0 }}>{status}</p>
        </section>

        {!verified ? (
          <section className="nonrevy-traveler-card" style={{ border: '1px solid #dbe3ef', borderRadius: 18, padding: 18, background: '#ffffff', color: '#111827' }}>
            <h2 style={{ marginTop: 0 }}>Verify with company email</h2>
            <form className="nonrevy-traveler-form" onSubmit={submitEmail} style={{ display: 'grid', gap: 14 }}>
              <label style={{ color: '#111827', fontWeight: 700 }}>
                Employing or benefited airline
                <input
                  value={airlineQuery}
                  onChange={(event) => updateAirline(event.target.value)}
                  list="nonrevy-airline-employers"
                  placeholder="Search airline name, IATA, or ICAO"
                  autoComplete="off"
                  style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#111827' }}
                />
                <datalist id="nonrevy-airline-employers">
                  {filteredAirlines.map((airline) => (
                    <option key={airline.code} value={`${airline.name} (${airline.code})`}>{airline.icao ? `${airline.code} / ${airline.icao}` : airline.code}</option>
                  ))}
                </datalist>
                <small style={{ display: 'block', color: '#475569', marginTop: 6 }}>
                  Selected: {selectedAirline ? `${selectedAirline.name} (${selectedAirline.code}${selectedAirline.icao ? ` / ${selectedAirline.icao}` : ''})` : 'Choose an airline from the list.'}
                </small>
              </label>
              <label style={{ color: '#111827', fontWeight: 700 }}>
                Work email
                <input value={workEmail} onChange={(event) => setWorkEmail(event.target.value)} type="email" inputMode="email" placeholder="name@airline.com" disabled={!companyEmailAvailable} style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #cbd5e1', background: companyEmailAvailable ? '#ffffff' : '#f8fafc', color: '#111827' }} />
                <small style={{ display: 'block', color: '#475569', marginTop: 6 }}>
                  {companyEmailAvailable
                    ? 'Company-email verification is available for this airline.'
                    : 'Company-email verification is not mapped for this airline yet. Use manual review.'}
                </small>
              </label>
              <button type="submit" disabled={loading || !workEmail.trim() || !companyEmailAvailable} style={{ justifySelf: 'start', padding: '12px 16px', borderRadius: 999, border: 'none', background: loading || !workEmail.trim() || !companyEmailAvailable ? '#94a3b8' : '#2563eb', color: '#ffffff', fontWeight: 800 }}>
                Send verification code
              </button>
            </form>
            {emailChallenge ? (
              <form className="nonrevy-traveler-form" onSubmit={verifyCode} style={{ display: 'grid', gap: 12, marginTop: 18, borderTop: '1px solid #e5e7eb', paddingTop: 18 }}>
                <div>
                  <h3 style={{ margin: '0 0 6px' }}>Enter your six-digit code</h3>
                  <p style={{ color: '#475569', margin: 0 }}>We sent a verification email to your work address. You can also use the secure link in that email.</p>
                </div>
                <label style={{ color: '#111827', fontWeight: 700 }}>
                  Verification code
                  <input
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#111827', letterSpacing: 4, fontWeight: 800 }}
                  />
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="submit" disabled={loading || verificationCode.length !== 6} style={{ padding: '11px 14px', borderRadius: 999, border: 'none', background: loading || verificationCode.length !== 6 ? '#94a3b8' : '#2563eb', color: '#ffffff', fontWeight: 800 }}>
                    Verify
                  </button>
                  <button type="button" disabled={loading} onClick={resendEmail} style={{ padding: '11px 14px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#ffffff', color: '#2563eb', fontWeight: 800 }}>
                    Resend code
                  </button>
                </div>
                <small style={{ color: '#475569' }}>The code expires at {formatDate(emailChallenge.expiresAt)}. Request manual review if you cannot access this work email.</small>
              </form>
            ) : null}
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 18, paddingTop: 18 }}>
              <h3 style={{ margin: '0 0 8px' }}>Cannot verify with work email?</h3>
              <p style={{ color: '#475569' }}>
                Request manual review. Nonrevy will ask for the least sensitive airline-affiliation proof needed and should delete temporary evidence after review.
              </p>
              <button type="button" disabled={loading} onClick={() => submit('request-manual-review')} style={{ padding: '11px 14px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#ffffff', color: '#2563eb', fontWeight: 800 }}>
                Request manual review
              </button>
            </div>
          </section>
        ) : (
          <section className="nonrevy-traveler-card" style={{ border: '1px solid #bfdbfe', borderRadius: 18, padding: 18, background: '#eff6ff', color: '#111827' }}>
            <h2 style={{ marginTop: 0 }}>You’re ready to use Nonrevy.</h2>
            <p style={{ color: '#334155' }}>Search, saved trips, watchlist, results, and load-request tools are now available.</p>
            <a href="/" style={{ display: 'inline-block', borderRadius: 999, padding: '12px 16px', background: '#2563eb', color: '#ffffff', fontWeight: 800, textDecoration: 'none' }}>Start searching</a>
          </section>
        )}

        <section className="nonrevy-traveler-card" style={{ border: '1px solid #dbe3ef', borderRadius: 18, padding: 18, background: '#ffffff', color: '#111827' }}>
          <h2 style={{ marginTop: 0 }}>What Nonrevy keeps</h2>
          <p style={{ color: '#334155' }}>
            Nonrevy stores verification status, airline, method, dates, and a work-email domain/hash when used. It does not retain government ID images by default, does not publish evidence, and does not treat employment verification as ZED eligibility.
          </p>
          <p style={{ color: '#334155', marginBottom: 0 }}>
            By requesting access, you confirm you are authorized to use the airline/non-rev benefits you represent and agree not to post confidential airline information. Access may be suspended for misuse or false verification.
          </p>
        </section>
      </section>
    </main>
  )
}
