export const stripeBillingStorageKey = 'nonrevy.subscriptionStatus'
export const stripeBillingEventName = 'nonrevy-billing-status-updated'

export type BillingPlanId = 'free' | 'founding-member' | 'pro-placeholder'
export type BillingSource = 'Local' | 'Stripe Test'
export type SubscriptionStatus = 'free' | 'test-mode-pending' | 'active-placeholder' | 'cancelled-placeholder'

export type BillingPlan = {
  id: BillingPlanId
  name: string
  priceLabel: string
  cadence: string
  stripeLookupKey: string
  description: string
  features: string[]
  testModeOnly: boolean
  recommended?: boolean
}

export type SubscriptionState = {
  planId: BillingPlanId
  status: SubscriptionStatus
  source: BillingSource
  stripeMode: 'test'
  customerPortalReady: boolean
  checkoutEnabled: boolean
  lastUpdated: string
  pendingUpgradePlanId?: BillingPlanId
  statusMessage: string
}

export type StripeBillingProvider = {
  mode: 'test'
  liveChargingEnabled: false
  plans: BillingPlan[]
  loadSubscription: () => SubscriptionState
  stageUpgrade: (planId: BillingPlanId) => SubscriptionState
  openBillingPortal: () => { ready: false; message: string }
}

export const billingPlans: BillingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    priceLabel: '$0',
    cadence: 'forever',
    stripeLookupKey: 'free_local_scaffold',
    description: 'Starter NONREV planning with local profile, basic watchlist, and itinerary guidance.',
    features: ['Local profile and onboarding', 'Basic route planning', 'Local outcome history', 'Community data previews'],
    testModeOnly: true
  },
  {
    id: 'founding-member',
    name: 'Founding Member',
    priceLabel: '$9/mo test',
    cadence: 'monthly placeholder',
    stripeLookupKey: 'founding_member_monthly_test',
    description: 'Early supporter tier staged for richer alerts, referral perks, and expanded watchlists.',
    features: ['Founding member badge placeholder', 'Expanded local watchlist room', 'Priority alert experiments', 'Referral reward framework'],
    testModeOnly: true,
    recommended: true
  },
  {
    id: 'pro-placeholder',
    name: 'Pro placeholder',
    priceLabel: '$19/mo test',
    cadence: 'monthly placeholder',
    stripeLookupKey: 'pro_monthly_test_placeholder',
    description: 'Future premium tier for heavier nonrev planning, intelligence, and monitoring workflows.',
    features: ['Deeper route intelligence placeholder', 'Advanced notification experiments', 'More saved itinerary comparisons', 'Future durable account sync'],
    testModeOnly: true
  }
]

export const defaultSubscriptionState: SubscriptionState = {
  planId: 'free',
  status: 'free',
  source: 'Local',
  stripeMode: 'test',
  customerPortalReady: false,
  checkoutEnabled: false,
  lastUpdated: new Date(0).toISOString(),
  statusMessage: 'Free local billing scaffold. Stripe is test-mode only and live charging is disabled.'
}

function isBrowser() {
  return typeof window !== 'undefined'
}

export function planForId(planId: BillingPlanId) {
  return billingPlans.find((plan) => plan.id === planId) || billingPlans[0]
}

function normalizeSubscriptionState(state?: Partial<SubscriptionState> | null): SubscriptionState {
  const planId = state?.planId && billingPlans.some((plan) => plan.id === state.planId) ? state.planId : 'free'
  return {
    ...defaultSubscriptionState,
    ...state,
    planId,
    source: state?.source || (planId === 'free' ? 'Local' : 'Stripe Test'),
    stripeMode: 'test',
    customerPortalReady: false,
    checkoutEnabled: false,
    lastUpdated: state?.lastUpdated || new Date().toISOString(),
    statusMessage: state?.statusMessage || defaultSubscriptionState.statusMessage
  }
}

export function loadSubscriptionState(): SubscriptionState {
  if (!isBrowser()) return defaultSubscriptionState

  try {
    const stored = window.localStorage.getItem(stripeBillingStorageKey)
    if (!stored) return defaultSubscriptionState
    return normalizeSubscriptionState(JSON.parse(stored) as Partial<SubscriptionState>)
  } catch {
    return defaultSubscriptionState
  }
}

export function saveSubscriptionState(state: SubscriptionState) {
  if (!isBrowser()) return state
  const normalized = normalizeSubscriptionState(state)
  window.localStorage.setItem(stripeBillingStorageKey, JSON.stringify(normalized))
  window.dispatchEvent(new Event(stripeBillingEventName))
  return normalized
}

export function stageStripeUpgrade(planId: BillingPlanId) {
  const plan = planForId(planId)
  return saveSubscriptionState({
    planId: 'free',
    status: 'test-mode-pending',
    source: 'Stripe Test',
    stripeMode: 'test',
    customerPortalReady: false,
    checkoutEnabled: false,
    pendingUpgradePlanId: plan.id,
    lastUpdated: new Date().toISOString(),
    statusMessage: `${plan.name} upgrade staged in Stripe test mode. Live checkout and charging remain disabled.`
  })
}

export function activatePlaceholderSubscription(planId: BillingPlanId) {
  const plan = planForId(planId)
  return saveSubscriptionState({
    planId: plan.id,
    status: plan.id === 'free' ? 'free' : 'active-placeholder',
    source: plan.id === 'free' ? 'Local' : 'Stripe Test',
    stripeMode: 'test',
    customerPortalReady: false,
    checkoutEnabled: false,
    lastUpdated: new Date().toISOString(),
    statusMessage: plan.id === 'free'
      ? 'Free local plan selected. No Stripe checkout was started.'
      : `${plan.name} marked active as a local/test placeholder. No live charge was created.`
  })
}

export function resetToFreePlan() {
  return activatePlaceholderSubscription('free')
}

export function openBillingPortalPlaceholder() {
  return {
    ready: false as const,
    message: 'Billing portal placeholder only. A Stripe test customer/session will be required before portal redirects are enabled.'
  }
}

export const stripeBillingProvider: StripeBillingProvider = {
  mode: 'test',
  liveChargingEnabled: false,
  plans: billingPlans,
  loadSubscription: loadSubscriptionState,
  stageUpgrade: stageStripeUpgrade,
  openBillingPortal: openBillingPortalPlaceholder
}

export function stripeBillingDiagnostics() {
  const subscription = loadSubscriptionState()
  const plan = planForId(subscription.pendingUpgradePlanId || subscription.planId)
  return {
    status: 'Limited' as const,
    activePlan: plan.name,
    source: subscription.source,
    testMode: true,
    liveChargingEnabled: false,
    checkoutEnabled: subscription.checkoutEnabled,
    portalReady: subscription.customerPortalReady,
    detail: `Stripe billing scaffold is in test mode only. Active display plan: ${plan.name}; source: ${subscription.source}; checkout and portal redirects are disabled.`
  }
}
