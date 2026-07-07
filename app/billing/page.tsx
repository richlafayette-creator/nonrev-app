'use client'

import { useEffect, useState } from 'react'
import BillingStatusCard from '../BillingStatusCard'
import {
  activatePlaceholderSubscription,
  billingPlans,
  loadSubscriptionState,
  openBillingPortalPlaceholder,
  planForId,
  resetToFreePlan,
  stageStripeUpgrade,
  stripeBillingEventName,
  type BillingPlanId,
  type SubscriptionState
} from '../../lib/stripeBilling'

export default function BillingPage() {
  const [subscription, setSubscription] = useState<SubscriptionState>(loadSubscriptionState())
  const [message, setMessage] = useState('Stripe billing is scaffolded in test mode only. No live checkout or charging is enabled.')

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

  function stagePlan(planId: BillingPlanId) {
    const nextSubscription = stageStripeUpgrade(planId)
    setSubscription(nextSubscription)
    setMessage(nextSubscription.statusMessage)
  }

  function activatePlan(planId: BillingPlanId) {
    const nextSubscription = activatePlaceholderSubscription(planId)
    setSubscription(nextSubscription)
    setMessage(nextSubscription.statusMessage)
  }

  function openPortal() {
    setMessage(openBillingPortalPlaceholder().message)
  }

  const displayPlan = planForId(subscription.pendingUpgradePlanId || subscription.planId)
  const billingItems = [
    { label: 'Current display plan', value: displayPlan.name },
    { label: 'Subscription status', value: subscription.status },
    { label: 'Billing source', value: subscription.source },
    { label: 'Stripe mode', value: 'Test only' },
    { label: 'Payment method', value: 'Not connected' },
    { label: 'Live charging', value: 'Disabled' }
  ]

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Home</a>
        <a href="/account" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>My Account</a>
        <a href="/credits" style={{ marginRight: 16, color: 'var(--color-amber-400)' }}>Credits</a>
        <a href="/membership" style={{ marginRight: 16, color: 'var(--color-green-400)' }}>Membership</a>
        <a href="/data-health" style={{ marginRight: 16, color: 'var(--color-purple-400)' }}>Data Health</a>
        <a href="/plan" style={{ color: 'var(--color-rose-400)' }}>Plan</a>
      </nav>

      <section style={{ maxWidth: 1120 }}>
        <p style={{ color: 'var(--color-amber-400)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Stripe billing scaffold</p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>Billing</h1>
        <p style={{ color: 'var(--color-slate-400)', maxWidth: 760 }}>
          Test-mode subscription status, plan catalog, and billing portal readiness live here. Checkout and portal redirects are intentionally disabled until live charging is approved.
        </p>
        <p style={{ color: 'var(--color-sky-400)' }}>{message}</p>

        <BillingStatusCard compact />

        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginTop: 24 }}>
          {billingItems.map((item) => (
            <article key={item.label} className="mini-card" style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
              <small style={{ color: 'var(--color-slate-400)' }}>{item.label}</small>
              <p style={{ fontWeight: 'bold' }}>{item.value}</p>
            </article>
          ))}
        </div>

        <section style={{ marginTop: 24 }}>
          <h2>Plan catalog</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            {billingPlans.map((plan) => (
              <article key={plan.id} className="mini-card" style={{ border: `1px solid ${plan.recommended ? 'var(--color-green-400)' : 'var(--color-slate-700)'}`, borderRadius: 22, padding: 20, background: 'var(--color-slate-850)' }}>
                <small style={{ color: plan.recommended ? 'var(--color-green-400)' : 'var(--color-slate-400)' }}>{plan.recommended ? 'Recommended test tier' : 'Stripe test plan'}</small>
                <h3 style={{ fontSize: 24, margin: '8px 0' }}>{plan.name}</h3>
                <strong style={{ color: 'var(--color-amber-400)' }}>{plan.priceLabel} · {plan.cadence}</strong>
                <p style={{ color: 'var(--color-slate-300)' }}>{plan.description}</p>
                <ul style={{ color: 'var(--color-slate-400)', paddingLeft: 18 }}>
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                <p style={{ color: 'var(--color-slate-500)' }}>Lookup key: {plan.stripeLookupKey}</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {plan.id === 'free' ? (
                    <button type="button" onClick={() => { const next = resetToFreePlan(); setSubscription(next); setMessage(next.statusMessage) }} style={{ padding: 11, borderRadius: 10, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'var(--color-slate-300)', fontWeight: 'bold', cursor: 'pointer' }}>
                      Use Free locally
                    </button>
                  ) : (
                    <button type="button" onClick={() => stagePlan(plan.id)} style={{ padding: 11, borderRadius: 10, border: 'none', background: plan.recommended ? 'var(--color-green-400)' : 'var(--color-sky-400)', color: 'var(--color-slate-950)', fontWeight: 'bold', cursor: 'pointer' }}>
                      Stage upgrade
                    </button>
                  )}
                  <button type="button" onClick={() => activatePlan(plan.id)} style={{ padding: 11, borderRadius: 10, border: '1px solid var(--color-slate-600)', background: 'var(--color-slate-950)', color: 'var(--color-slate-300)', fontWeight: 'bold', cursor: 'pointer' }}>
                    Mark active placeholder
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Billing portal placeholder</h2>
          <p style={{ color: 'var(--color-slate-300)' }}>The customer portal button is intentionally non-navigating until a Stripe test customer and portal session endpoint exist.</p>
          <button type="button" onClick={openPortal} style={{ padding: 12, borderRadius: 10, border: 'none', background: 'var(--color-amber-400)', color: 'var(--color-slate-950)', fontWeight: 'bold', cursor: 'pointer' }}>
            Open portal placeholder
          </button>
        </section>
      </section>
    </main>
  )
}
