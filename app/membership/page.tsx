'use client'

import { useEffect, useState } from 'react'
import BillingStatusCard from '../BillingStatusCard'
import {
  billingPlans,
  loadSubscriptionState,
  resetToFreePlan,
  stageStripeUpgrade,
  stripeBillingEventName,
  type BillingPlanId,
  type SubscriptionState
} from '../../lib/stripeBilling'

export default function MembershipPage() {
  const [subscription, setSubscription] = useState<SubscriptionState>(loadSubscriptionState())
  const [message, setMessage] = useState('Membership actions are Stripe test-mode placeholders only — no billing changes or live charges will be made.')

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

  function cancelPlaceholder() {
    const nextSubscription = resetToFreePlan()
    setSubscription(nextSubscription)
    setMessage('Cancel placeholder selected. Subscription display reset to Free locally; no Stripe cancellation was sent.')
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/account" style={{ marginRight: 16, color: '#38bdf8' }}>My Account</a>
        <a href="/billing" style={{ marginRight: 16, color: '#fbbf24' }}>Billing</a>
        <a href="/credits" style={{ marginRight: 16, color: '#fbbf24' }}>Credits</a>
        <a href="/data-health" style={{ marginRight: 16, color: '#c084fc' }}>Data Health</a>
        <a href="/plan" style={{ color: '#fb7185' }}>Plan</a>
      </nav>

      <section style={{ maxWidth: 1120 }}>
        <p style={{ color: '#34d399', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Membership scaffold</p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>Membership</h1>
        <p style={{ color: '#94a3b8', maxWidth: 760 }}>Upgrade and cancellation flows are staged for Stripe test mode. Live checkout, charging, and portal redirects remain disabled.</p>
        <p style={{ color: '#38bdf8' }}>{message}</p>

        <BillingStatusCard compact />

        <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginTop: 24 }}>
          {billingPlans.map((plan) => (
            <article key={plan.id} className="mini-card" style={{ border: `1px solid ${plan.recommended ? '#34d399' : '#334155'}`, borderRadius: 20, padding: 22, background: '#0f172a' }}>
              <small style={{ color: plan.recommended ? '#34d399' : '#94a3b8' }}>{plan.recommended ? 'Founding tier' : 'Test plan'}</small>
              <h2 style={{ margin: '6px 0' }}>{plan.name}</h2>
              <strong style={{ color: '#fbbf24' }}>{plan.priceLabel}</strong>
              <p style={{ color: '#cbd5e1' }}>{plan.description}</p>
              <ul style={{ color: '#94a3b8', paddingLeft: 18 }}>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              {plan.id === 'free' ? (
                <button onClick={cancelPlaceholder} style={{ padding: 12, borderRadius: 10, border: '1px solid #475569', background: '#020617', color: '#cbd5e1', fontWeight: 'bold', cursor: 'pointer' }}>
                  Keep Free
                </button>
              ) : (
                <button onClick={() => stagePlan(plan.id)} style={{ padding: 12, borderRadius: 10, border: 'none', background: plan.recommended ? '#34d399' : '#38bdf8', color: '#020617', fontWeight: 'bold', cursor: 'pointer' }}>
                  Stage {plan.name} upgrade
                </button>
              )}
            </article>
          ))}

          <article id="cancel" className="mini-card" style={{ border: '1px solid #334155', borderRadius: 20, padding: 22, background: '#0f172a' }}>
            <h2 style={{ marginTop: 0 }}>Cancel Membership</h2>
            <p style={{ color: '#cbd5e1' }}>Future cancellation flow will confirm Stripe subscription status, billing period, retained credits, and data export options.</p>
            <p style={{ color: '#94a3b8' }}>Current local status: {subscription.status}</p>
            <button onClick={cancelPlaceholder} style={{ padding: 12, borderRadius: 10, border: 'none', background: '#f87171', color: '#020617', fontWeight: 'bold', cursor: 'pointer' }}>
              Cancel placeholder
            </button>
          </article>
        </div>
      </section>
    </main>
  )
}
