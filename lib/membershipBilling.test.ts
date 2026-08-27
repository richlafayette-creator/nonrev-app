import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const membershipContent = readFileSync(new URL('../app/MembershipBillingContent.tsx', import.meta.url), 'utf8')
const billingPage = readFileSync(new URL('../app/billing/page.tsx', import.meta.url), 'utf8')
const membershipPage = readFileSync(new URL('../app/membership/page.tsx', import.meta.url), 'utf8')
const creditsPage = readFileSync(new URL('../app/credits/page.tsx', import.meta.url), 'utf8')
const referralsPage = readFileSync(new URL('../app/referrals/page.tsx', import.meta.url), 'utf8')
const billingCard = readFileSync(new URL('../app/BillingStatusCard.tsx', import.meta.url), 'utf8')
const referralCard = readFileSync(new URL('../app/ReferralProgramCard.tsx', import.meta.url), 'utf8')
const navigation = readFileSync(new URL('../app/AppNavigation.tsx', import.meta.url), 'utf8')
const accountMenu = readFileSync(new URL('../app/AccountMenu.tsx', import.meta.url), 'utf8')

const membershipSurface = [membershipContent, billingPage, membershipPage, billingCard].join('\n')
const betaMoneySurface = [membershipContent, billingPage, membershipPage, creditsPage, billingCard].join('\n')
const travelerPlaceholderSurface = [
  membershipContent,
  billingPage,
  membershipPage,
  creditsPage,
  referralsPage,
  billingCard,
  referralCard
].join('\n')

describe('private beta membership and billing presentation', () => {
  it('renders one truthful Membership and Billing experience for membership and billing routes', () => {
    assert.match(billingPage, /<MembershipBillingContent context="billing" \/>/)
    assert.match(membershipPage, /<MembershipBillingContent \/>/)
    assert.match(membershipContent, /t\('membershipBillingTitle'\)/)
    assert.match(membershipContent, /t\('membershipBillingIntro'\)/)
    assert.match(membershipContent, /t\('currentPlan'\)/)
    assert.match(membershipContent, /t\('privateBetaPlan'\)/)
    assert.match(membershipContent, /t\('status'\)/)
    assert.match(membershipContent, /t\('active'\)/)
  })

  it('represents planned founding paid-beta prices accurately', () => {
    assert.match(membershipContent, /t\('coreFoundingMembership'\)/)
    assert.match(membershipContent, /\$49\/year/)
    assert.match(membershipContent, /t\('conciergeFoundingMembership'\)/)
    assert.match(membershipContent, /\$99\/year/)
    assert.match(membershipContent, /t\('coreTripPass'\)/)
    assert.match(membershipContent, /\$14\.99/)
    assert.match(membershipContent, /t\('conciergeTripPass'\)/)
    assert.match(membershipContent, /\$24\.99/)
    assert.match(membershipContent, /t\('aiConciergeCopy'\)/)
    assert.doesNotMatch(membershipContent, /unlimited/i)
    assert.doesNotMatch(membershipContent, /cheap recurring monthly|monthly plan/i)
  })

  it('does not expose fake checkout, portal, cancellation, invoice, or subscription controls', () => {
    assert.doesNotMatch(betaMoneySurface, /Stage upgrade|Mark active|Open portal|Cancel placeholder|Prepare checkout|Use Free locally/)
    assert.doesNotMatch(betaMoneySurface, /checkout scaffold|portal placeholder|Stripe test|test-mode|lookup key|customer id|subscription id/i)
    assert.doesNotMatch(betaMoneySurface, /Subscribe|Upgrade|Start checkout|Manage billing|Cancel Membership|fake checkout/i)
    assert.doesNotMatch(betaMoneySurface, /invoice|renewal date|payment method ending|card ending/i)
  })

  it('does not show a fake AI credit balance or ledger', () => {
    assert.match(creditsPage, /Credits are not active yet\./)
    assert.match(creditsPage, /no credit balance or purchase flow is active today/i)
    assert.match(creditsPage, /No balance is shown during private beta/)
    assert.doesNotMatch(creditsPage, /Available credits|Starter balance|Ledger|Mock credit grant|\+12|reserved|earned this month/i)
  })

  it('keeps referrals informational until a real program exists', () => {
    assert.match(referralsPage, /Referrals are not active in private beta\./)
    assert.match(referralCard, /Not active in private beta/)
    assert.doesNotMatch(referralsPage, /Copy link|Log invite|SMS placeholder|reward balance|referral income/i)
    assert.doesNotMatch(referralCard, /referralLink|Invites sent|Activated users|Next reward|Reward unlocked/)
  })

  it('uses the shared traveler design system for money and membership surfaces', () => {
    assert.match(membershipContent, /app-shell nonrevy-traveler-page nonrevy-membership-page/)
    assert.match(creditsPage, /app-shell nonrevy-traveler-page nonrevy-credits-page/)
    assert.match(referralsPage, /app-shell nonrevy-traveler-page nonrevy-referrals-page/)
    assert.match(membershipContent, /nonrevy-traveler-card/)
    assert.match(membershipContent, /nonrevy-traveler-empty/)
  })

  it('does not expose internal diagnostics in standard traveler navigation or account menu', () => {
    ;[
      "'/agent'",
      "'/operator'",
      "'/diagnostics'",
      "'/data-health'",
      "'/outcome-diagnostics'",
      "'/notification-diagnostics'",
      "'/requests'"
    ].forEach((route) => assert.doesNotMatch(navigation, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))))
    assert.doesNotMatch(accountMenu, /Data Health|Diagnostics|Operator|Agent/)
    assert.match(accountMenu, /href="\/membership"/)
    assert.match(accountMenu, /href="\/billing"/)
  })

  it('keeps traveler-visible money pages free of raw storage or database wording', () => {
    assert.doesNotMatch(travelerPlaceholderSurface, /storageMode|Supabase|SQL|HTTP \d{3}|database|localStorage|local-only|stored locally/i)
    assert.doesNotMatch(travelerPlaceholderSurface, /placeholder|scaffold|mock|fake/i)
  })
})
