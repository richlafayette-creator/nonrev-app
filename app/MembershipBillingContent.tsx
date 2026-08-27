'use client'

import { useI18n } from './I18nProvider'

export default function MembershipBillingContent({ context = 'membership' }: { context?: 'membership' | 'billing' }) {
  const { t } = useI18n()
  const coreFeatures = [
    t('coreFeatureSearch'),
    t('coreFeatureRefinements'),
    t('coreFeatureZed'),
    t('coreFeaturePlaces'),
    t('coreFeatureSaved'),
    t('coreFeatureWatchlist'),
    t('coreFeatureLoads'),
    t('coreFeatureRequests'),
    t('coreFeatureExplanations')
  ]

  const conciergeFeatures = [
    t('conciergeFeatureCore'),
    t('conciergeFeatureConversation'),
    t('conciergeFeatureResearch'),
    t('conciergeFeaturePlanning'),
    t('conciergeFeatureCurrentInfo'),
    t('conciergeFeatureCredits')
  ]

  const tripPasses = [
    {
      name: t('coreTripPass'),
      price: '$14.99',
      detail: t('coreTripPassDetail')
    },
    {
      name: t('conciergeTripPass'),
      price: '$24.99',
      detail: t('conciergeTripPassDetail')
    }
  ]

  return (
    <main className="app-shell nonrevy-traveler-page nonrevy-membership-page" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 32, fontFamily: 'Arial' }}>
      <section className="nonrevy-traveler-page__inner" style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p className="nonrevy-traveler-page__eyebrow" style={{ color: '#2563eb', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>
          {t('membership')}
        </p>
        <h1 style={{ fontSize: 44, margin: '8px 0' }}>{t('membershipBillingTitle')}</h1>
        <p style={{ color: '#4B5563', maxWidth: 760 }}>
          {t('membershipBillingIntro')}
        </p>
        {context === 'billing' ? (
          <p style={{ color: '#4B5563', maxWidth: 760 }}>
            {t('billingCanonicalCopy')}
          </p>
        ) : null}

        <section className="nonrevy-traveler-card nonrevy-current-access-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a', marginTop: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            {[
              [t('currentPlan'), t('privateBetaPlan')],
              [t('price'), t('complimentary')],
              [t('status'), t('active')]
            ].map(([label, value]) => (
              <article key={label} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                <small style={{ color: '#6b7280' }}>{label}</small>
                <strong style={{ display: 'block', color: '#111827', marginTop: 4 }}>{value}</strong>
              </article>
            ))}
          </div>
          <p style={{ color: '#4B5563', marginBottom: 0 }}>
            {t('currentAccessCopy')}
          </p>
        </section>

        <section className="nonrevy-traveler-page__grid nonrevy-membership-plans" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 24 }}>
          <article className="nonrevy-traveler-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <small style={{ color: '#2563eb', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plannedPaidBeta')}</small>
            <h2 style={{ margin: '8px 0' }}>{t('coreFoundingMembership')}</h2>
            <p style={{ color: '#111827', fontSize: 28, fontWeight: 900, margin: '8px 0' }}>$49/year</p>
            <p style={{ color: '#4B5563' }}>{t('coreFoundingCopy')}</p>
            <ul style={{ color: '#4B5563', paddingLeft: 18 }}>
              {coreFeatures.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          </article>

          <article className="nonrevy-traveler-card" style={{ border: '1px solid #2563eb', borderRadius: 22, padding: 22, background: '#0f172a' }}>
            <small style={{ color: '#2563eb', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{t('plannedPaidBeta')}</small>
            <h2 style={{ margin: '8px 0' }}>{t('conciergeFoundingMembership')}</h2>
            <p style={{ color: '#111827', fontSize: 28, fontWeight: 900, margin: '8px 0' }}>$99/year</p>
            <p style={{ color: '#4B5563' }}>{t('conciergeFoundingCopy')}</p>
            <ul style={{ color: '#4B5563', paddingLeft: 18 }}>
              {conciergeFeatures.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          </article>
        </section>

        <section className="nonrevy-traveler-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>{t('plannedTripPasses')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {tripPasses.map((pass) => (
              <article key={pass.name} style={{ border: '1px solid #334155', borderRadius: 14, padding: 14, background: '#020617' }}>
                <h3 style={{ margin: '0 0 6px' }}>{pass.name}</h3>
                <strong style={{ color: '#111827', fontSize: 22 }}>{pass.price}</strong>
                <p style={{ color: '#4B5563', marginBottom: 0 }}>{pass.detail}</p>
              </article>
            ))}
          </div>
          <p style={{ color: '#4B5563', marginBottom: 0 }}>
            {t('tripPassPricingNote')}
          </p>
        </section>

        <section className="nonrevy-traveler-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>{t('aiConcierge')}</h2>
          <p style={{ color: '#4B5563' }}>
            {t('aiConciergeCopy')}
          </p>
          <p style={{ color: '#4B5563', marginBottom: 0 }}>
            {t('aiConciergeFallbackCopy')}
          </p>
        </section>

        <section className="nonrevy-traveler-empty" style={{ border: '1px dashed #cbd5e1', borderRadius: 22, padding: 22, background: '#ffffff', marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>{t('billingStatus')}</h2>
          <p style={{ color: '#4B5563' }}>
            {t('billingStatusCopy')}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="nonrevy-traveler-link-action" href="/profile" style={{ border: '1px solid #d1d5db', borderRadius: 999, padding: '10px 14px', color: '#111827', fontWeight: 800, textDecoration: 'none' }}>
              {t('backToProfile')}
            </a>
            <a className="nonrevy-traveler-link-action" href="/" style={{ border: '1px solid #2563eb', borderRadius: 999, padding: '10px 14px', color: '#2563eb', fontWeight: 800, textDecoration: 'none' }}>
              {t('searchFlights')}
            </a>
          </div>
        </section>
      </section>
    </main>
  )
}
