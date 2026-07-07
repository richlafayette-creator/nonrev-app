'use client'

import { useEffect, useState } from 'react'
import { calculateActivationProgress, type ActivationProgress } from '../lib/onboardingActivation'

function progressColor(score: number) {
  if (score >= 80) return 'var(--color-green-500)'
  if (score >= 50) return 'var(--color-yellow-400)'
  return 'var(--color-rose-400)'
}

export default function ActivationProgressCard({ compact = false }: { compact?: boolean }) {
  const [progress, setProgress] = useState<ActivationProgress>(() => calculateActivationProgress())

  useEffect(() => {
    function refreshProgress() {
      setProgress(calculateActivationProgress())
    }

    refreshProgress()
    window.addEventListener('nonrevy-onboarding-updated', refreshProgress)
    window.addEventListener('nonrevy-traveler-profile-updated', refreshProgress)
    window.addEventListener('nonrevy-activation-progress-updated', refreshProgress)
    window.addEventListener('nonrevy-itinerary-comparisons-updated', refreshProgress)
    window.addEventListener('nonrevy-watchlist-updated', refreshProgress)
    window.addEventListener('nonrevy-notification-preferences-updated', refreshProgress)
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshProgress)
    window.addEventListener('storage', refreshProgress)
    return () => {
      window.removeEventListener('nonrevy-onboarding-updated', refreshProgress)
      window.removeEventListener('nonrevy-traveler-profile-updated', refreshProgress)
      window.removeEventListener('nonrevy-activation-progress-updated', refreshProgress)
      window.removeEventListener('nonrevy-itinerary-comparisons-updated', refreshProgress)
      window.removeEventListener('nonrevy-watchlist-updated', refreshProgress)
      window.removeEventListener('nonrevy-notification-preferences-updated', refreshProgress)
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshProgress)
      window.removeEventListener('storage', refreshProgress)
    }
  }, [])

  return (
    <section style={{ border: `1px solid ${progressColor(progress.score)}`, borderRadius: 24, padding: compact ? 18 : 22, background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.88))', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: 'var(--color-sky-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Activation progress</p>
          <h2 style={{ margin: '8px 0', fontSize: compact ? 24 : 30 }}>NONREVY setup is {progress.score}% complete</h2>
          <p style={{ color: 'var(--color-slate-400)', margin: 0 }}>
            {progress.completedCount}/{progress.totalCount} activation steps complete. Stored locally for now.
          </p>
        </div>
        <a href="/onboarding" style={{ border: '1px solid var(--color-sky-400)', borderRadius: 999, padding: '10px 14px', color: 'var(--color-sky-400)', textDecoration: 'none', fontWeight: 'bold' }}>
          {progress.onboardingCompleted ? 'Review onboarding' : 'Start onboarding'}
        </a>
      </div>

      <div style={{ height: 12, borderRadius: 999, background: 'var(--color-slate-950)', border: '1px solid var(--color-slate-700)', overflow: 'hidden', margin: '16px 0' }}>
        <div style={{ width: `${progress.score}%`, height: '100%', background: progressColor(progress.score) }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {progress.steps.map((step) => (
          <a key={step.key} href={step.href} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 12, background: 'var(--color-slate-950)', color: 'inherit', textDecoration: 'none' }}>
            <strong style={{ color: step.completed ? 'var(--color-green-500)' : 'var(--color-yellow-400)' }}>{step.completed ? '✓' : '○'} {step.label}</strong>
            <p style={{ color: 'var(--color-slate-400)', margin: '6px 0 0', fontSize: 13 }}>{step.detail}</p>
          </a>
        ))}
      </div>
    </section>
  )
}
