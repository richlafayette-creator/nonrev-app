'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  loadReferralProgramState,
  recordReferralInvite,
  referralLink,
  referralProgress,
  updateReferralInviteStatus,
  type ReferralInviteStatus,
  type ReferralProgramState
} from '../../lib/referralProgram'

const statusOptions: ReferralInviteStatus[] = ['sent', 'signed-up', 'activated']

function statusColor(status: ReferralInviteStatus) {
  if (status === 'activated') return '#22c55e'
  if (status === 'signed-up') return '#38bdf8'
  return '#facc15'
}

export default function ReferralsPage() {
  const [state, setState] = useState<ReferralProgramState>(() => loadReferralProgramState())
  const [recipient, setRecipient] = useState('')
  const [shareStatus, setShareStatus] = useState('Referral dashboard ready.')

  function refresh() {
    setState(loadReferralProgramState())
  }

  useEffect(() => {
    refresh()
    window.addEventListener('nonrevy-referral-program-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('nonrevy-referral-program-updated', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const link = useMemo(() => referralLink(state.code), [state.code])
  const progress = useMemo(() => referralProgress(state), [state])

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(link)
      recordReferralInvite('Copied referral link', 'copy-link')
      setShareStatus('Referral link copied and logged locally as an invite.')
    } catch {
      setShareStatus('Copy failed. Select and copy the referral link manually.')
    }
  }

  function emailReferral() {
    const target = recipient.trim()
    recordReferralInvite(target || 'Email referral', 'email')
    const subject = encodeURIComponent('Try NONREVY')
    const body = encodeURIComponent(`I use NONREVY to plan nonrev trips. Here is my referral link: ${link}`)
    window.location.href = `mailto:${target}?subject=${subject}&body=${body}`
    setShareStatus('Email share opened and invite logged locally.')
  }

  function smsReferral() {
    recordReferralInvite(recipient.trim() || 'SMS placeholder referral', 'sms-placeholder')
    setShareStatus('SMS placeholder logged locally. Native SMS provider can attach later.')
  }

  function addManualInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    recordReferralInvite(recipient || 'Manual referral', 'manual')
    setRecipient('')
    setShareStatus('Manual referral invite logged locally.')
  }

  function changeStatus(inviteId: string, status: ReferralInviteStatus) {
    updateReferralInviteStatus(inviteId, status)
    setShareStatus(`Referral status updated to ${status}.`)
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/profile" style={{ marginRight: 16, color: '#22c55e' }}>Profile</a>
        <a href="/account" style={{ marginRight: 16, color: '#fbbf24' }}>Account</a>
        <a href="/referrals" style={{ marginRight: 16, color: '#38bdf8' }}>Referrals</a>
        <a href="/watchlist" style={{ color: '#facc15' }}>Watchlist</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#38bdf8', fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' }}>Referral program scaffold</p>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '8px 0 12px' }}>Grow the standby network.</h1>
        <p style={{ color: '#94a3b8', maxWidth: 820, fontSize: 18 }}>
          Track local referral activity now: invites sent, signups, activated users, and reward progress. Server attribution can plug into the same shape later.
        </p>

        <section style={{ border: '1px solid #38bdf8', borderRadius: 24, padding: 22, background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(14, 116, 144, 0.18))', marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <p style={{ color: '#94a3b8', margin: 0 }}>Your referral code</p>
              <h2 style={{ fontSize: 34, margin: '6px 0', letterSpacing: 2 }}>{state.code}</h2>
              <p style={{ color: '#cbd5e1', margin: 0, wordBreak: 'break-all' }}>{link}</p>
            </div>
            <button onClick={copyReferralLink} style={{ padding: '12px 16px', borderRadius: 999, border: 'none', background: '#38bdf8', color: '#020617', fontWeight: 'bold' }}>
              Copy link
            </button>
          </div>

          <form onSubmit={addManualInvite} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto auto auto', gap: 10, marginTop: 18 }}>
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="friend@example.com or phone label"
              style={{ boxSizing: 'border-box', width: '100%', padding: 12, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}
            />
            <button type="submit" style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #475569', background: '#0f172a', color: '#f8fafc', fontWeight: 'bold' }}>Log invite</button>
            <button type="button" onClick={emailReferral} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #38bdf8', background: '#020617', color: '#38bdf8', fontWeight: 'bold' }}>Email</button>
            <button type="button" onClick={smsReferral} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #f472b6', background: '#020617', color: '#f472b6', fontWeight: 'bold' }}>SMS placeholder</button>
          </form>
          <p style={{ color: '#94a3b8', marginBottom: 0 }}>{shareStatus}</p>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 18 }}>
          {([
            ['Invites sent', progress.invitesSent, '#facc15'],
            ['Signups', progress.signups, '#38bdf8'],
            ['Activated users', progress.activatedUsers, '#22c55e']
          ] as Array<[string, number, string]>).map(([label, value, color]) => (
            <article key={label} style={{ border: `1px solid ${color}`, borderRadius: 18, padding: 18, background: '#0f172a' }}>
              <small style={{ color: '#94a3b8' }}>{label}</small>
              <h2 style={{ color, margin: '6px 0 0', fontSize: 34 }}>{value}</h2>
            </article>
          ))}
        </div>

        <section style={{ marginTop: 24 }}>
          <h2>Reward framework</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {progress.rewards.map((reward) => (
              <article key={reward.key} style={{ border: `1px solid ${reward.unlocked ? '#22c55e' : '#334155'}`, borderRadius: 18, padding: 18, background: '#0f172a' }}>
                <p style={{ color: reward.unlocked ? '#22c55e' : '#38bdf8', fontWeight: 'bold', marginTop: 0 }}>{reward.unlocked ? 'Unlocked' : `${reward.remaining} ${reward.metric} to go`}</p>
                <h3 style={{ margin: '6px 0' }}>{reward.label}</h3>
                <p style={{ color: '#94a3b8' }}>{reward.description}</p>
                <div style={{ height: 10, borderRadius: 999, background: '#020617', border: '1px solid #334155', overflow: 'hidden' }}>
                  <div style={{ width: `${reward.progress}%`, height: '100%', background: reward.unlocked ? '#22c55e' : '#38bdf8' }} />
                </div>
                <small style={{ color: '#64748b' }}>{reward.progress}% toward {reward.threshold} {reward.metric}</small>
              </article>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2>Referral activity</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {state.invites.length === 0 && (
              <article style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a', color: '#94a3b8' }}>
                No referral invites logged yet. Copy, email, or log an invite to start tracking progress.
              </article>
            )}
            {state.invites.map((invite) => (
              <article key={invite.id} style={{ border: '1px solid #334155', borderRadius: 18, padding: 16, background: '#0f172a', display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 180px', gap: 12, alignItems: 'center' }}>
                <div>
                  <strong>{invite.recipient}</strong>
                  <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>{invite.channel.replace('-', ' ')} · sent {new Date(invite.sentAt).toLocaleString()}</p>
                  <p style={{ color: statusColor(invite.status), margin: '6px 0 0', textTransform: 'capitalize' }}>{invite.status.replace('-', ' ')}</p>
                </div>
                <select value={invite.status} onChange={(event) => changeStatus(invite.id, event.target.value as ReferralInviteStatus)} style={{ padding: 10, borderRadius: 12, border: '1px solid #475569', background: '#020617', color: 'white' }}>
                  {statusOptions.map((status) => <option key={status} value={status}>{status.replace('-', ' ')}</option>)}
                </select>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
