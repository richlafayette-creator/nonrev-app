'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { accountPersistenceHeaders } from '../../lib/accountPersistenceClient'
import { useI18n } from '../I18nProvider'
import type { CommonTranslationKey } from '../../lib/i18n/messages'

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

function statusLabel(status: string, t: (key: CommonTranslationKey) => string) {
  if (status === 'verified') return 'Verified'
  if (status === 'pending') return t('pendingReview')
  if (status === 'rejected') return t('needsResubmission')
  if (status === 'reverify_required') return t('reverifyNeeded')
  if (status === 'expired') return t('expired')
  return t('notVerified')
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
  const { t } = useI18n()
  const [airlines, setAirlines] = useState<AirlineOption[]>(defaultAirlines)
  const [verification, setVerification] = useState<VerificationStatus>({ status: 'unverified' })
  const [airlineCode, setAirlineCode] = useState('UA')
  const [airlineQuery, setAirlineQuery] = useState('United Airlines (UA)')
  const [workEmail, setWorkEmail] = useState('')
  const [emailChallenge, setEmailChallenge] = useState<EmailChallenge | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [status, setStatus] = useState(t('homePreviewMessage'))
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
        if (emailStatus === 'verified') setStatus(t('verificationLinkVerified'))
        else if (emailStatus === 'expired') setStatus(t('verificationLinkExpired'))
        else if (emailStatus === 'invalid') setStatus(t('verificationLinkInvalid'))
        else setStatus(data.disclosure || t('homePreviewMessage'))
      } catch {
        if (!cancelled) setStatus(t('verificationStatusLoadFailed'))
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

  function localizedVerificationMessage(message?: string) {
    if (!message) return ''
    if (/not configured|provider|could not be sent/i.test(message)) return t('emailVerificationUnavailable')
    return message
  }

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
    setStatus(action === 'start-email-verification' ? t('checkingWorkEmail') : t('submittingManualReview'))
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
        setStatus(localizedVerificationMessage(data.error) || t('verificationRequestCouldNotSubmit'))
        if (data.challenge) setEmailChallenge(data.challenge)
        return
      }
      setVerification(data.verification || { status: 'pending', airlineCode, airlineName: selectedAirline?.name })
      if (data.challenge) setEmailChallenge(data.challenge)
      setStatus(data.emailSent ? t('verificationEmailSent') : localizedVerificationMessage(data.detail) || t('verificationRequestSubmitted'))
    } catch {
      setStatus(t('verificationRequestFailed'))
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
    setStatus(t('checkingVerificationCode'))
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
        setStatus(localizedVerificationMessage(data.error) || t('verificationCodeRejected'))
        return
      }
      setVerification(data.verification || { status: 'verified', airlineCode, airlineName: selectedAirline?.name })
      setStatus(localizedVerificationMessage(data.detail) || t('verificationLinkVerified'))
      if (nextRoute && nextRoute !== '/verify') window.location.assign(nextRoute)
    } catch {
      setStatus(t('verificationCodeCheckFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function resendEmail() {
    if (!emailChallenge) return
    setLoading(true)
    setStatus(t('resendingVerificationEmail'))
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
        setStatus(localizedVerificationMessage(data.error) || t('verificationEmailCouldNotResend'))
        return
      }
      if (data.challenge) setEmailChallenge(data.challenge)
      setStatus(data.emailSent ? t('verificationEmailResent') : localizedVerificationMessage(data.detail) || t('verificationEmailResent'))
    } catch {
      setStatus(t('verificationEmailResendFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell nonrevy-traveler-page nonrevy-verification-page" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <section className="nonrevy-traveler-page__inner" style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 18 }}>
        <p className="nonrevy-traveler-page__eyebrow" style={{ color: '#2563eb', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
          {t('verifyEyebrow')}
        </p>
        <header>
          <h1 style={{ fontSize: 38, lineHeight: 1.05, margin: '8px 0 12px' }}>{t('verifyHeadline')}</h1>
          <p style={{ color: '#334155', maxWidth: 760, fontSize: 17 }}>
            {t('verifyIntro')}
          </p>
        </header>

        <section className="nonrevy-traveler-card" style={{ border: '1px solid #dbe3ef', borderRadius: 18, padding: 18, background: '#ffffff', color: '#111827' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <small style={{ color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>{t('currentStatus')}</small>
              <h2 style={{ margin: '4px 0 0', fontSize: 24 }}>{statusLabel(verification.status, t)}</h2>
            </div>
            <span className="nonrevy-traveler-badge">{verification.airlineCode || t('airlinePending')}</span>
          </div>
          {verification.airlineName ? <p style={{ color: '#334155', margin: '10px 0 0' }}>{verification.airlineName} · {verification.method?.replaceAll('_', ' ') || 'verification'}</p> : null}
          {verification.verifiedAt ? <p style={{ color: '#166534', margin: '8px 0 0' }}>Verified {formatDate(verification.verifiedAt)}</p> : null}
          {pending ? <p style={{ color: '#92400e', margin: '8px 0 0' }}>Your request is pending review. Public schedule preview remains available; saved trips, watchlist, ZED details, and load-request tools unlock after approval.</p> : null}
          <p style={{ color: '#475569', marginBottom: 0 }}>{status}</p>
        </section>

        {!verified ? (
          <section className="nonrevy-traveler-card" style={{ border: '1px solid #dbe3ef', borderRadius: 18, padding: 18, background: '#ffffff', color: '#111827' }}>
            <h2 style={{ marginTop: 0 }}>{t('verifyWithCompanyEmail')}</h2>
            <form className="nonrevy-traveler-form" onSubmit={submitEmail} style={{ display: 'grid', gap: 14 }}>
              <label style={{ color: '#111827', fontWeight: 700 }}>
                {t('employingAirline')}
                <input
                  value={airlineQuery}
                  onChange={(event) => updateAirline(event.target.value)}
                  list="nonrevy-airline-employers"
                  placeholder={t('airlineSearchPlaceholder')}
                  autoComplete="off"
                  style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #cbd5e1', background: '#ffffff', color: '#111827' }}
                />
                <datalist id="nonrevy-airline-employers">
                  {filteredAirlines.map((airline) => (
                    <option key={airline.code} value={`${airline.name} (${airline.code})`}>{airline.icao ? `${airline.code} / ${airline.icao}` : airline.code}</option>
                  ))}
                </datalist>
                <small style={{ display: 'block', color: '#475569', marginTop: 6 }}>
                  {t('selected')}: {selectedAirline ? `${selectedAirline.name} (${selectedAirline.code}${selectedAirline.icao ? ` / ${selectedAirline.icao}` : ''})` : t('chooseAirline')}
                </small>
              </label>
              <label style={{ color: '#111827', fontWeight: 700 }}>
                {t('workEmail')}
                <input value={workEmail} onChange={(event) => setWorkEmail(event.target.value)} type="email" inputMode="email" placeholder="name@airline.com" disabled={!companyEmailAvailable} style={{ boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #cbd5e1', background: companyEmailAvailable ? '#ffffff' : '#f8fafc', color: '#111827' }} />
                <small style={{ display: 'block', color: '#475569', marginTop: 6 }}>
                  {companyEmailAvailable
                    ? t('companyEmailAvailable')
                    : t('companyEmailNotMapped')}
                </small>
              </label>
              <button type="submit" disabled={loading || !workEmail.trim() || !companyEmailAvailable} style={{ justifySelf: 'start', padding: '12px 16px', borderRadius: 999, border: 'none', background: loading || !workEmail.trim() || !companyEmailAvailable ? '#94a3b8' : '#2563eb', color: '#ffffff', fontWeight: 800 }}>
                {t('sendVerificationCode')}
              </button>
            </form>
            {emailChallenge ? (
              <form className="nonrevy-traveler-form" onSubmit={verifyCode} style={{ display: 'grid', gap: 12, marginTop: 18, borderTop: '1px solid #e5e7eb', paddingTop: 18 }}>
                <div>
                  <h3 style={{ margin: '0 0 6px' }}>{t('enterSixDigitCode')}</h3>
                  <p style={{ color: '#475569', margin: 0 }}>{t('verificationEmailSent')}</p>
                </div>
                <label style={{ color: '#111827', fontWeight: 700 }}>
                  {t('verificationCode')}
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
                    {t('verify')}
                  </button>
                  <button type="button" disabled={loading} onClick={resendEmail} style={{ padding: '11px 14px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#ffffff', color: '#2563eb', fontWeight: 800 }}>
                    {t('resendCode')}
                  </button>
                </div>
                <small style={{ color: '#475569' }}>{t('codeExpiresManualFallback').replace('{date}', formatDate(emailChallenge.expiresAt))}</small>
              </form>
            ) : null}
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 18, paddingTop: 18 }}>
              <h3 style={{ margin: '0 0 8px' }}>{t('cannotVerifyEmail')}</h3>
              <p style={{ color: '#475569' }}>
                {t('manualReviewCopy')}
              </p>
              <button type="button" disabled={loading} onClick={() => submit('request-manual-review')} style={{ padding: '11px 14px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#ffffff', color: '#2563eb', fontWeight: 800 }}>
                {t('requestManualReview')}
              </button>
            </div>
          </section>
        ) : (
          <section className="nonrevy-traveler-card" style={{ border: '1px solid #bfdbfe', borderRadius: 18, padding: 18, background: '#eff6ff', color: '#111827' }}>
            <h2 style={{ marginTop: 0 }}>{t('readyToUse')}</h2>
            <p style={{ color: '#334155' }}>Search, saved trips, watchlist, results, and load-request tools are now available.</p>
            <a href="/" style={{ display: 'inline-block', borderRadius: 999, padding: '12px 16px', background: '#2563eb', color: '#ffffff', fontWeight: 800, textDecoration: 'none' }}>{t('startSearching')}</a>
          </section>
        )}

        <section className="nonrevy-traveler-card" style={{ border: '1px solid #dbe3ef', borderRadius: 18, padding: 18, background: '#ffffff', color: '#111827' }}>
          <h2 style={{ marginTop: 0 }}>{t('whatNonrevyKeeps')}</h2>
          <p style={{ color: '#334155' }}>
            {t('verificationRetentionCopy')}
          </p>
          <p style={{ color: '#334155', marginBottom: 0 }}>
            {t('verificationAcknowledgment')}
          </p>
        </section>
      </section>
    </main>
  )
}
