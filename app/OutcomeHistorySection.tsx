'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadTripOutcomes, outcomeRepositoryDiagnostics, tripOutcomeStats, type TripOutcome } from '../lib/tripOutcomes'
import { useI18n } from './I18nProvider'

export default function OutcomeHistorySection() {
  const { formatDateTime, t } = useI18n()
  const [outcomes, setOutcomes] = useState<TripOutcome[]>([])

  useEffect(() => {
    function refreshOutcomes() {
      setOutcomes(loadTripOutcomes())
    }

    refreshOutcomes()
    window.addEventListener('nonrevy-trip-outcomes-updated', refreshOutcomes)
    window.addEventListener('storage', refreshOutcomes)
    return () => {
      window.removeEventListener('nonrevy-trip-outcomes-updated', refreshOutcomes)
      window.removeEventListener('storage', refreshOutcomes)
    }
  }, [])

  const stats = useMemo(() => tripOutcomeStats(outcomes), [outcomes])
  const repository = useMemo(() => outcomeRepositoryDiagnostics(), [])

  return (
    <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 22, background: 'var(--color-slate-850)', marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: 'var(--color-green-500)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>
            {t('outcomeHistory')}
          </p>
          <h2 style={{ margin: '4px 0' }}>{repository.activeSource} trip outcomes</h2>
          <p style={{ color: 'var(--color-slate-400)', marginBottom: 0 }}>
            Stored through the outcome repository scaffold. Local fallback remains enabled until database sync is configured.
          </p>
          <a href="/outcomes" style={{ display: 'inline-block', color: 'var(--color-sky-400)', marginTop: 10 }}>Open outcome dashboard</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 10 }}>
          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)' }}>
            <small style={{ color: 'var(--color-slate-400)' }}>{t('outcomeCount')}</small>
            <h3 style={{ color: 'var(--color-slate-50)', margin: '6px 0 0' }}>{stats.outcomeCount}</h3>
          </article>
          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)' }}>
            <small style={{ color: 'var(--color-slate-400)' }}>{t('successRate')}</small>
            <h3 style={{ color: 'var(--color-slate-50)', margin: '6px 0 0' }}>{stats.successRate}%</h3>
          </article>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {outcomes.length === 0 && (
          <article style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)' }}>
            <p style={{ color: 'var(--color-slate-300)', margin: 0 }}>No local outcomes recorded yet.</p>
          </article>
        )}
        {outcomes.slice(0, 8).map((outcome) => (
          <article key={outcome.id} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 14, background: 'var(--color-slate-950)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ color: 'var(--color-slate-50)', margin: 0 }}>{outcome.title}</h3>
                <p style={{ color: 'var(--color-sky-400)', margin: '6px 0' }}>{outcome.route}</p>
                <small style={{ color: outcome.source === 'Database' ? 'var(--color-green-500)' : 'var(--color-yellow-400)' }}>{t('source')}: {outcome.source}</small>
              </div>
              <strong style={{ color: outcome.status === 'Yes, got on' ? 'var(--color-green-500)' : outcome.status === 'Cancelled trip' ? 'var(--color-yellow-400)' : 'var(--color-red-400)' }}>
                {outcome.status}
              </strong>
            </div>
            {outcome.notes && <p style={{ color: 'var(--color-slate-300)', marginBottom: 0 }}>{outcome.notes}</p>}
            <small style={{ color: 'var(--color-slate-400)' }}>{formatDateTime(outcome.createdAt)}</small>
          </article>
        ))}
      </div>
    </section>
  )
}
