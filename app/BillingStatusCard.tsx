'use client'

import { useEffect, useState } from 'react'
import {
  billingPlans,
  loadSubscriptionState,
  planForId,
  stageStripeUpgrade,
  stripeBillingEventName,
  type BillingPlanId,
  type SubscriptionState
} from '../lib/stripeBilling'

export default function BillingStatusCard({ compact = false }: { compact?: boolean }) {
  const [subscription, setSubscription] = useState<SubscriptionState>(loadSubscriptionState())

  useEffect(() => {
    function refreshBilling() {
      setSubscription(loadSubscriptionState())
    }

    refreshBilling()
    window.addEventListener(stripeBillingEventName, refreshBilling)
    window.addEventListener('storage', refreshBilling)
    return () => {
      window.removeEventListener(stripeBillingEventName, refreshBilling)
      window.removeEventListener('storage', refreshBilling)
    }
  }, [])

  const displayPlan = planForId(subscription.pendingUpgradePlanId || subscription.planId)

  function stageUpgrade(planId: BillingPlanId) {
    setSubscription(stageStripeUpgrade(planId))
  }

  return (
    <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: compact ? 18 : 22, background: 'var(--color-slate-850)' }}>
      <p style={{ color: 'var(--color-amber-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Stripe test billing</p>
      <h2 style={{ margin: '6px 0' }}>{displayPlan.name}</h2>
      <p style={{ color: 'var(--color-slate-400)' }}>{subscription.statusMessage}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 14 }}>
        {[
          ['Status', subscription.status],
          ['Source', subscription.source],
          ['Mode', 'Stripe test'],
          ['Live charging', 'Disabled']
        ].map(([label, value]) => (
          <article key={label} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 14, padding: 12, background: 'var(--color-slate-950)' }}>
            <small style={{ color: 'var(--color-slate-400)' }}>{label}</small>
            <strong style={{ display: 'block', color: label === 'Live charging' ? 'var(--color-yellow-400)' : 'var(--color-slate-50)', marginTop: 4 }}>{value}</strong>
          </article>
        ))}
      </div>
      {!compact && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          {billingPlans.filter((plan) => plan.id !== 'free').map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => stageUpgrade(plan.id)}
              style={{ border: 'none', borderRadius: 999, padding: '10px 14px', background: plan.recommended ? 'var(--color-green-400)' : 'var(--color-sky-400)', color: 'var(--color-slate-950)', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Stage {plan.name}
            </button>
          ))}
          <a href="/billing" style={{ color: 'var(--color-sky-400)', alignSelf: 'center' }}>Open billing</a>
        </div>
      )}
    </section>
  )
}
