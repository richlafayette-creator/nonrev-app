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
    <section style={{ border: '1px solid #334155', borderRadius: 22, padding: compact ? 18 : 22, background: '#0f172a' }}>
      <p style={{ color: '#fbbf24', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Stripe test billing</p>
      <h2 style={{ margin: '6px 0' }}>{displayPlan.name}</h2>
      <p style={{ color: '#94a3b8' }}>{subscription.statusMessage}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 14 }}>
        {[
          ['Status', subscription.status],
          ['Source', subscription.source],
          ['Mode', 'Stripe test'],
          ['Live charging', 'Disabled']
        ].map(([label, value]) => (
          <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 12, background: '#020617' }}>
            <small style={{ color: '#94a3b8' }}>{label}</small>
            <strong style={{ display: 'block', color: label === 'Live charging' ? '#facc15' : '#f8fafc', marginTop: 4 }}>{value}</strong>
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
              style={{ border: 'none', borderRadius: 999, padding: '10px 14px', background: plan.recommended ? '#34d399' : '#38bdf8', color: '#020617', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Stage {plan.name}
            </button>
          ))}
          <a href="/billing" style={{ color: '#38bdf8', alignSelf: 'center' }}>Open billing</a>
        </div>
      )}
    </section>
  )
}
