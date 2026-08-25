'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { accountPersistenceHeaders } from '../../lib/accountPersistenceClient'

type AirlineOption = {
  code: string
  name: string
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
  detail?: string
  disclosure?: string
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

export default function VerifyPage() {
  const [airlines, setAirlines] = useState<AirlineOption[]>(defaultAirlines)
  const [verification, setVerification] = useState<VerificationStatus>({ status: 'unverified' })
  const [airlineCode, setAirlineCode] = useState('UA')
  const [workEmail, setWorkEmail] = useState('')
  const [status, setStatus] = useState('Verification is required before using Nonrevy search and traveler tools.')
  const [loading, setLoading] = useState(false)

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
        setAirlineCode(data.verification?.airlineCode || data.airlines?.[0]?.code || 'UA')
        setStatus(data.detail || data.disclosure || 'Verification status loaded.')
      } catch {
        if (!cancelled) setStatus('Verification status could not be loaded. You can still submit a request.')
      }
    }
    loadVerification()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedAirline = useMemo(() => airlines.find((airline) => airline.code === airlineCode), [airlines, airlineCode])
  const verified = verification.status === 'verified'
  const pending = verification.status === 'pending'

  async function submit(action: 'submit-company-email' | 'request-manual-review') {
    setLoading(true)
    setStatus(action === 'submit-company-email' ? 'Checking work email domain...' : 'Submitting manual review request...')
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
        return
      }
      setVerification(data.verification || { status: 'pending', airlineCode, airlineName: selectedAirline?.name })
      setStatus(data.detail || 'Verification request submitted.')
    } catch {
      setStatus('Verification request failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submit('submit-company-email')
  }

  return (
    <main className="app-shell nonrevy-traveler-page nonrevy-verification-page" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <section className="nonrevy-traveler-page__inner" style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
        <p className="nonrevy-traveler-page__eyebrow" style={{ color: '#2563eb', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
          Airline employee verification
        </p>
        <header>
          <h1 style={{ fontSize: 38, lineHeight: 1.05, margin: '8px 0 12px' }}>Verify before using Nonrevy.</h1>
          <p style={{ color: '#334155', maxWidth: 760, fontSize: 17 }}>
            Nonrevy is for airline employees and eligible non-rev travelers. Verification helps protect the community and does not confirm any specific ZED agreement or imply airline endorsement.
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
          {pending ? <p style={{ color: '#92400e', margin: '8px 0 0' }}>Your request is pending review. Full search, saved trips, watchlist, results, and load-request tools unlock after approval.</p> : null}
          <p style={{ color: '#475569', marginBottom: 0 }}>{status}</p>
        </section>

        {!verified ? (
          <section className="nonrevy-traveler-card" style={{ border: '1px solid #dbe3ef', borderRadius: 18, padding: 18, background: '#ffffff', color: '#111827' }}>
            <h2 style={{ marginTop: 0 }}>Verify with company email</h2>
            <form className="nonrevy-traveler-form" onSubmit={submitEmail} style={{ display: 'grid', gap: 14 }}>
              <label style={{ color: '#111827', fontWeight: 700 }}>
                Employing airline
                <select value={airlineCode} onChange={(event) => setAirlineCode(event.target.value)} style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#111827' }}>
                  {airlines.map((airline) => (
                    <option key={airline.code} value={airline.code}>{airline.code} · {airline.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ color: '#111827', fontWeight: 700 }}>
                Work email
                <input value={workEmail} onChange={(event) => setWorkEmail(event.target.value)} type="email" inputMode="email" placeholder="name@airline.com" style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#111827' }} />
              </label>
              <button type="submit" disabled={loading || !workEmail.trim()} style={{ justifySelf: 'start', padding: '12px 16px', borderRadius: 999, border: 'none', background: loading || !workEmail.trim() ? '#94a3b8' : '#2563eb', color: '#ffffff', fontWeight: 800 }}>
                Send verification
              </button>
            </form>
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 18, paddingTop: 18 }}>
              <h3 style={{ margin: '0 0 8px' }}>Can’t verify with work email?</h3>
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
