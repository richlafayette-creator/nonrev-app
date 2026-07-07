'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadReferralProgramState, referralLink, referralProgress, type ReferralProgramState } from '../lib/referralProgram'

export default function ReferralProgramCard({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<ReferralProgramState>(() => loadReferralProgramState())

  useEffect(() => {
    function refresh() {
      setState(loadReferralProgramState())
    }

    refresh()
    window.addEventListener('nonrevy-referral-program-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('nonrevy-referral-program-updated', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const progress = useMemo(() => referralProgress(state), [state])
  const nextReward = progress.rewards.find((reward) => !reward.unlocked) || progress.rewards[progress.rewards.length - 1]

  return (
    <section style={{ border: '1px solid var(--color-sky-400)', borderRadius: 22, padding: compact ? 18 : 22, background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(14, 116, 144, 0.16))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Referral program</p>
          <h2 style={{ margin: '8px 0', fontSize: compact ? 24 : 30 }}>Invite nonrev friends</h2>
          <p style={{ color: 'var(--color-slate-400)', margin: 0 }}>Code <strong style={{ color: 'var(--color-slate-50)' }}>{state.code}</strong> · {progress.activatedUsers} activated user{progress.activatedUsers === 1 ? '' : 's'}</p>
        </div>
        <a href="/referrals" style={{ border: '1px solid var(--color-sky-400)', borderRadius: 999, padding: '10px 14px', color: 'var(--color-sky-400)', textDecoration: 'none', fontWeight: 'bold' }}>
          Open referrals
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
        {[
          ['Invites sent', progress.invitesSent],
          ['Signups', progress.signups],
          ['Activated users', progress.activatedUsers]
        ].map(([label, value]) => (
          <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 12, background: 'var(--color-slate-950)' }}>
            <small style={{ color: 'var(--color-slate-400)' }}>{label}</small>
            <h3 style={{ margin: '4px 0 0', color: 'var(--color-slate-50)' }}>{value}</h3>
          </article>
        ))}
      </div>

      {nextReward && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--color-slate-300)', fontSize: 13 }}>
            <span>{nextReward.unlocked ? 'Reward unlocked' : `Next reward: ${nextReward.label}`}</span>
            <span>{nextReward.progress}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: 'var(--color-slate-950)', border: '1px solid var(--color-slate-700)', overflow: 'hidden', marginTop: 6 }}>
            <div style={{ width: `${nextReward.progress}%`, height: '100%', background: nextReward.unlocked ? 'var(--color-green-500)' : 'var(--color-sky-400)' }} />
          </div>
          <p style={{ color: 'var(--color-slate-400)', margin: '8px 0 0', fontSize: 13 }}>{nextReward.description}</p>
        </div>
      )}

      <p style={{ color: 'var(--color-slate-500)', margin: '14px 0 0', fontSize: 12, wordBreak: 'break-all' }}>{referralLink(state.code)}</p>
    </section>
  )
}
