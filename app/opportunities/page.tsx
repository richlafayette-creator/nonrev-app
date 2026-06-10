'use client'

import { useMemo, useState } from 'react'
import { buildRouteAirportIntelligence } from '../../lib/airportIntelligence'
import { carrierScoringProfiles, getCarrierScoringScaffold } from '../../lib/carrierScope'
import { buildDisruptionIntelligence } from '../../lib/disruptionIntelligence'
import { airportCodesFromRoute } from '../../lib/airportMapScaffold'
import { historicalRoutes } from '../../lib/historicalRoutes'
import { calculateRouteConfidence } from '../../lib/routeConfidence'
import { calculateSuccessPrediction, successPredictionBadgeColor, type SuccessPrediction } from '../../lib/successPredictionEngine'
import { saveSavedSearch } from '../../lib/savedSearches'
import { loadTravelerProfileFromStorage, type TravelerProfileScaffold } from '../../lib/travelerProfile'
import { loadSavedTripWatchlist, saveTripWatch } from '../../lib/watchlist'

type OpportunityCategory =
  | 'Best Polaris opportunities today'
  | 'Best Delta One opportunities'
  | 'Hawaii opportunities'
  | 'Europe opportunities'
  | 'Asia opportunities'
  | 'Open premium cabin opportunities'
  | 'High-success same-day departures'
  | 'Hidden-gem routes'

type OpportunityFilter = 'United' | 'Delta' | 'Alaska' | 'International' | 'Domestic' | 'Premium Cabin' | 'Highest Success'

type OpportunitySeed = {
  id: string
  category: OpportunityCategory
  route: string
  carrier: 'United' | 'Delta' | 'Alaska Group'
  cabinSignal: string
  why: string
  recommendedTravelerProfile: string
  baseScore: number
  tags: OpportunityFilter[]
  sameDay?: boolean
}

type OpportunityCard = OpportunitySeed & {
  successScore: number
  successPrediction: SuccessPrediction
  confidenceBadge: string
  confidenceScore: number
  routeIntelligence: string
  recoveryNote: string
  plannerQuery: string
}

const filterOptions: OpportunityFilter[] = ['United', 'Delta', 'Alaska', 'International', 'Domestic', 'Premium Cabin', 'Highest Success']
const internationalCodes = new Set(['HND', 'NRT', 'LHR', 'CDG', 'FRA', 'MUC', 'AMS', 'ZRH', 'BRU', 'MAD', 'BCN', 'FCO', 'MXP', 'DUB', 'SNN', 'GRU', 'EZE', 'SCL', 'SYD', 'MEL', 'AKL', 'ICN', 'PVG', 'PEK', 'SIN', 'HKG'])

const opportunitySeeds: OpportunitySeed[] = [
  {
    id: 'polaris-hnd',
    category: 'Best Polaris opportunities today',
    route: 'LAX → SFO → HND',
    carrier: 'United',
    cabinSignal: 'Polaris / long-haul widebody signal',
    why: 'Tokyo demand is high, but SFO gives United-heavy backup depth and a clean same-carrier recovery path.',
    recommendedTravelerProfile: 'United employee or retiree with flexibility to position early and accept a connection.',
    baseScore: 87,
    tags: ['United', 'International', 'Premium Cabin']
  },
  {
    id: 'polaris-lhr',
    category: 'Best Polaris opportunities today',
    route: 'DEN → EWR → LHR',
    carrier: 'United',
    cabinSignal: 'Polaris gateway opportunity',
    why: 'EWR/LHR premium cabin upside is interesting when DEN positioning keeps several hub backups alive.',
    recommendedTravelerProfile: 'United traveler prioritizing premium upside over the simplest routing.',
    baseScore: 82,
    tags: ['United', 'International', 'Premium Cabin']
  },
  {
    id: 'delta-one-cdg',
    category: 'Best Delta One opportunities',
    route: 'LAX → ATL → CDG',
    carrier: 'Delta',
    cabinSignal: 'Delta One transatlantic signal',
    why: 'ATL creates recovery density before the Europe leg while preserving Delta One upside.',
    recommendedTravelerProfile: 'Delta-eligible traveler who values strong hub recovery and can travel off-peak.',
    baseScore: 86,
    tags: ['Delta', 'International', 'Premium Cabin']
  },
  {
    id: 'delta-one-ams',
    category: 'Best Delta One opportunities',
    route: 'SEA → DTW → AMS',
    carrier: 'Delta',
    cabinSignal: 'Delta One / partner gateway signal',
    why: 'DTW is one of the cleaner connection airports in the scaffold, reducing friction before the long-haul leg.',
    recommendedTravelerProfile: 'Delta traveler willing to trade a connection for better operational resilience.',
    baseScore: 80,
    tags: ['Delta', 'International', 'Premium Cabin']
  },
  {
    id: 'hawaii-sea-hnl',
    category: 'Hawaii opportunities',
    route: 'SEA → HNL',
    carrier: 'Alaska Group',
    cabinSignal: 'Hawaii leisure route',
    why: 'Simple nonstop shape with Alaska/Hawaiian relevance and fewer connection failure points.',
    recommendedTravelerProfile: 'Alaska/Hawaiian eligible traveler who can move quickly on a same-day leisure opening.',
    baseScore: 84,
    tags: ['Alaska', 'Domestic']
  },
  {
    id: 'hawaii-den-hnl',
    category: 'Hawaii opportunities',
    route: 'LAX → DEN → HNL',
    carrier: 'United',
    cabinSignal: 'Hawaii backup route',
    why: 'DEN adds recovery depth when nonstop Hawaii loads tighten from the West Coast.',
    recommendedTravelerProfile: 'United traveler comfortable with a hub connection for a better backup profile.',
    baseScore: 82,
    tags: ['United', 'Domestic']
  },
  {
    id: 'europe-jfk-cdg',
    category: 'Europe opportunities',
    route: 'LAX → JFK → CDG',
    carrier: 'Delta',
    cabinSignal: 'Europe premium cabin signal',
    why: 'JFK can be crowded, but the Europe payoff and multiple same-day domestic repositioning options make it worth watching.',
    recommendedTravelerProfile: 'Premium-cabin seeker who can tolerate a higher-risk international gateway.',
    baseScore: 78,
    tags: ['Delta', 'International', 'Premium Cabin']
  },
  {
    id: 'asia-sfo-hnd',
    category: 'Asia opportunities',
    route: 'SFO → HND',
    carrier: 'United',
    cabinSignal: 'Asia premium nonstop signal',
    why: 'Nonstop Asia opportunity with a major United hub on the front end; monitor closely rather than assuming seats.',
    recommendedTravelerProfile: 'United traveler with strong priority and backup willingness through LAX or DEN.',
    baseScore: 81,
    tags: ['United', 'International', 'Premium Cabin']
  },
  {
    id: 'open-premium-lhr',
    category: 'Open premium cabin opportunities',
    route: 'SFO → ORD → LHR',
    carrier: 'United',
    cabinSignal: 'Open premium cabin watch target',
    why: 'Hub-to-hub domestic protection before a premium long-haul segment creates a useful watchlist candidate.',
    recommendedTravelerProfile: 'Flexible United traveler seeking upside, not a guaranteed cabin.',
    baseScore: 79,
    tags: ['United', 'International', 'Premium Cabin']
  },
  {
    id: 'same-day-fll',
    category: 'High-success same-day departures',
    route: 'LAX → ATL → FLL',
    carrier: 'Delta',
    cabinSignal: 'High-frequency domestic banks',
    why: 'Strong historical scaffold score and ATL frequency make this a practical same-day move.',
    recommendedTravelerProfile: 'Traveler prioritizing getting there today over cabin upside.',
    baseScore: 88,
    tags: ['Delta', 'Domestic', 'Highest Success'],
    sameDay: true
  },
  {
    id: 'same-day-bos',
    category: 'High-success same-day departures',
    route: 'SEA → DTW → BOS',
    carrier: 'Delta',
    cabinSignal: 'Reliable connection layout',
    why: 'DTW connection efficiency and Delta hub depth make this a strong same-day candidate.',
    recommendedTravelerProfile: 'Delta traveler who wants a balanced success/friction profile.',
    baseScore: 83,
    tags: ['Delta', 'Domestic', 'Highest Success'],
    sameDay: true
  },
  {
    id: 'hidden-sbp-hnl',
    category: 'Hidden-gem routes',
    route: 'SBP → SEA → HNL',
    carrier: 'Alaska Group',
    cabinSignal: 'Small-origin positioning gem',
    why: 'A quieter origin can be useful if the traveler can reach SBP and connect into stronger SEA/Hawaii flow.',
    recommendedTravelerProfile: 'Flexible Central Coast traveler or positioning traveler hunting less obvious origin demand.',
    baseScore: 77,
    tags: ['Alaska', 'Domestic']
  }
]

function clampScore(value: number) {
  return Math.max(1, Math.min(99, Math.round(value)))
}

function routeQuery(route: string) {
  return route.replace(/\s*→\s*/g, ' to ')
}

function carrierFilter(carrier: OpportunitySeed['carrier']): OpportunityFilter {
  if (carrier === 'United') return 'United'
  if (carrier === 'Delta') return 'Delta'
  return 'Alaska'
}

function routeRegionTags(route: string) {
  const codes = airportCodesFromRoute(route)
  const international = codes.some((code) => internationalCodes.has(code))
  return international ? ['International' as const] : ['Domestic' as const]
}


function opportunityScheduleDensity(seed: OpportunitySeed) {
  if (seed.sameDay || seed.tags.includes('Highest Success')) return 'High' as const
  if (seed.tags.includes('International') && seed.tags.includes('Premium Cabin')) return 'Medium' as const
  return 'Medium' as const
}

function opportunityCarrierCoverage(carrier: OpportunitySeed['carrier']) {
  return carrier === 'Alaska Group' ? 'Moderate' as const : 'Strong' as const
}

function opportunityRecoveryStrength(backupAvailability: string, routeHealth: string) {
  if ((backupAvailability === 'Excellent' || backupAvailability === 'Good') && routeHealth !== 'Red') return 'Strong' as const
  if (backupAvailability === 'Fair' || routeHealth === 'Yellow') return 'Moderate' as const
  return 'Limited' as const
}

function buildOpportunity(seed: OpportunitySeed, travelerProfile: TravelerProfileScaffold): OpportunityCard {
  const airportIntelligence = buildRouteAirportIntelligence(seed.route)
  const disruption = buildDisruptionIntelligence({ route: seed.route })
  const historical = historicalRoutes.find((route) => route.route === seed.route || route.carrier === seed.carrier)
  const confidence = calculateRouteConfidence({
    route: seed.route,
    successProbability: seed.baseScore,
    historicalScore: historical?.score,
    historicalSuccessRate: historical?.successRate,
    historicalReportCount: historical?.reportCount,
    travelerProfile,
    disruption,
    updateTrigger: 'local-signal-refresh'
  })
  const carrierValue = seed.carrier === 'United' ? 'united' : seed.carrier === 'Delta' ? 'delta' : 'alaska-group'
  const scaffold = getCarrierScoringScaffold(carrierValue, travelerProfile)
  const profileBoost = travelerProfile.employeeAirline === seed.carrier ? 3 : seed.route.includes(travelerProfile.homeAirport) ? 2 : 0
  const successScore = clampScore(seed.baseScore * 0.48 + confidence.score * 0.28 + scaffold.successProbability.probability * 0.18 - airportIntelligence.connectionRiskScore * 0.04 - disruption.disruptionImpactScore * 0.02 + profileBoost)
  const successPrediction = calculateSuccessPrediction({
    route: seed.route,
    baseSuccessProbability: successScore,
    routeConfidenceScore: confidence.score,
    connectionCount: Math.max(0, airportCodesFromRoute(seed.route).length - 2),
    totalTravelTime: seed.tags.includes('International') ? 'Long-haul window' : 'Same-day candidate',
    backupAvailability: airportIntelligence.backupFlightAvailability,
    carrierCoverage: opportunityCarrierCoverage(seed.carrier),
    scheduleDensity: opportunityScheduleDensity(seed),
    recoveryStrength: opportunityRecoveryStrength(airportIntelligence.backupFlightAvailability, disruption.routeHealth),
    routeRisk: scaffold.successProbability.riskCategory,
    travelerProfile
  })
  const tags = [...new Set([...seed.tags, carrierFilter(seed.carrier), ...routeRegionTags(seed.route), ...(seed.cabinSignal.toLowerCase().includes('premium') || seed.cabinSignal.toLowerCase().includes('polaris') || seed.cabinSignal.toLowerCase().includes('delta one') ? ['Premium Cabin' as const] : [])])]

  return {
    ...seed,
    tags,
    successScore,
    successPrediction,
    confidenceBadge: confidence.badge,
    confidenceScore: confidence.score,
    routeIntelligence: `${airportIntelligence.backupFlightAvailability} backup depth · ${airportIntelligence.overallConnectionDifficulty.toLowerCase()} connection profile · ${carrierScoringProfiles[carrierValue].routeIntelligence['Best Hub']} hub signal`,
    recoveryNote: disruption.backupRouteRecommendations[0],
    plannerQuery: `${routeQuery(seed.route)} ${seed.cabinSignal}`
  }
}

function filterOpportunities(opportunities: OpportunityCard[], filters: OpportunityFilter[]) {
  const filterSet = new Set(filters)
  const carrierFilters = (['United', 'Delta', 'Alaska'] as OpportunityFilter[]).filter((filter) => filterSet.has(filter))
  const regionFilters = (['International', 'Domestic'] as OpportunityFilter[]).filter((filter) => filterSet.has(filter))
  const requiresPremium = filterSet.has('Premium Cabin')

  const filtered = opportunities.filter((opportunity) => {
    if (carrierFilters.length && !carrierFilters.some((filter) => opportunity.tags.includes(filter))) return false
    if (regionFilters.length && !regionFilters.some((filter) => opportunity.tags.includes(filter))) return false
    if (requiresPremium && !opportunity.tags.includes('Premium Cabin')) return false
    return true
  })

  return filterSet.has('Highest Success')
    ? [...filtered].sort((a, b) => b.successPrediction.probability - a.successPrediction.probability)
    : filtered
}

function opportunityAccent(category: OpportunityCategory) {
  if (category.includes('Polaris')) return '#38bdf8'
  if (category.includes('Delta')) return '#60a5fa'
  if (category.includes('Hawaii')) return '#22c55e'
  if (category.includes('Europe')) return '#c084fc'
  if (category.includes('Asia')) return '#f97316'
  if (category.includes('same-day')) return '#facc15'
  if (category.includes('Hidden')) return '#fb7185'
  return '#67e8f9'
}

function OpportunityCardView({ opportunity, onSave, onWatchlist }: { opportunity: OpportunityCard; onSave: (opportunity: OpportunityCard) => void; onWatchlist: (opportunity: OpportunityCard) => void }) {
  const accent = opportunityAccent(opportunity.category)
  return (
    <article style={{ border: '1px solid rgba(148, 163, 184, 0.28)', borderRadius: 24, padding: 18, background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.84))', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: accent, fontWeight: 900, margin: 0, letterSpacing: 0.7, textTransform: 'uppercase', fontSize: 12 }}>{opportunity.category}</p>
          <h2 style={{ fontSize: 25, lineHeight: 1.05, margin: '8px 0 6px' }}>{opportunity.route}</h2>
          <p style={{ color: '#cbd5e1', margin: 0 }}>{opportunity.carrier} · {opportunity.cabinSignal}</p>
        </div>
        <div style={{ minWidth: 92, textAlign: 'center', border: `1px solid ${successPredictionBadgeColor(opportunity.successPrediction.badge)}`, borderRadius: 18, padding: '10px 8px', background: 'rgba(2, 6, 23, 0.78)' }}>
          <strong style={{ color: successPredictionBadgeColor(opportunity.successPrediction.badge), display: 'block', fontSize: 28 }}>{opportunity.successPrediction.displayValue}</strong>
          <small style={{ color: '#94a3b8', fontWeight: 800 }}>{opportunity.successPrediction.scoreLabel}</small>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
        {opportunity.tags.filter((tag) => tag !== 'Highest Success').map((tag) => (
          <span key={tag} style={{ border: '1px solid #334155', borderRadius: 999, padding: '6px 9px', color: '#cbd5e1', background: '#020617', fontSize: 12, fontWeight: 800 }}>{tag}</span>
        ))}
        <span style={{ border: '1px solid #334155', borderRadius: 999, padding: '6px 9px', color: '#d8b4fe', background: '#1e1b4b', fontSize: 12, fontWeight: 800 }}>{opportunity.confidenceBadge} confidence · {opportunity.confidenceScore}</span>
      </div>

      <section style={{ border: `1px solid ${successPredictionBadgeColor(opportunity.successPrediction.badge)}`, borderRadius: 16, padding: 12, background: 'rgba(2, 6, 23, 0.72)', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ color: successPredictionBadgeColor(opportunity.successPrediction.badge) }}>{opportunity.successPrediction.scoreLabel} {opportunity.successPrediction.displayValue} {opportunity.successPrediction.label}</strong>
          <span style={{ border: `1px solid ${successPredictionBadgeColor(opportunity.successPrediction.badge)}`, borderRadius: 999, padding: '5px 8px', color: successPredictionBadgeColor(opportunity.successPrediction.badge), fontSize: 12, fontWeight: 900 }}>{opportunity.successPrediction.badge}</span>
        </div>
        <p style={{ color: '#cbd5e1', margin: '8px 0 4px', fontWeight: 800 }}>Reasoning:</p>
        <ul style={{ color: '#cbd5e1', margin: 0, paddingLeft: 18 }}>
          {opportunity.successPrediction.reasoning.map((reason) => <li key={`${opportunity.id}-${reason}`}>{reason}</li>)}
        </ul>
        <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>Confidence: {opportunity.successPrediction.confidenceLevel} · Risk: {opportunity.successPrediction.riskLevel}</p>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid #1e293b', borderRadius: 16, padding: 12, background: 'rgba(2, 6, 23, 0.62)' }}>
          <strong style={{ color: '#f8fafc' }}>Why it is interesting</strong>
          <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>{opportunity.why}</p>
        </div>
        <div style={{ border: '1px solid #1e293b', borderRadius: 16, padding: 12, background: 'rgba(2, 6, 23, 0.62)' }}>
          <strong style={{ color: '#f8fafc' }}>Recommended traveler profile</strong>
          <p style={{ color: '#cbd5e1', margin: '6px 0 0' }}>{opportunity.recommendedTravelerProfile}</p>
        </div>
        <div style={{ border: '1px solid #1e293b', borderRadius: 16, padding: 12, background: 'rgba(2, 6, 23, 0.62)' }}>
          <strong style={{ color: '#f8fafc' }}>Route intelligence + recovery</strong>
          <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>{opportunity.routeIntelligence}</p>
          <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>{opportunity.recoveryNote}</p>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 10, marginTop: 14 }}>
        <button type="button" onClick={() => onSave(opportunity)} style={{ border: '1px solid #475569', borderRadius: 12, padding: 11, background: '#020617', color: '#e2e8f0', fontWeight: 900 }}>Save</button>
        <button type="button" onClick={() => onWatchlist(opportunity)} style={{ border: '1px solid #facc15', borderRadius: 12, padding: 11, background: '#422006', color: '#fef3c7', fontWeight: 900 }}>Watchlist</button>
        <a href={`/plan?aiTrip=${encodeURIComponent(opportunity.plannerQuery)}`} style={{ textAlign: 'center', textDecoration: 'none', border: `1px solid ${accent}`, borderRadius: 12, padding: 11, background: accent, color: '#020617', fontWeight: 900 }}>Open in Planner</a>
      </div>
    </article>
  )
}

export default function OpportunitiesPage() {
  const [travelerProfile] = useState<TravelerProfileScaffold>(() => loadTravelerProfileFromStorage())
  const [activeFilters, setActiveFilters] = useState<OpportunityFilter[]>([])
  const [status, setStatus] = useState('Opportunity Feed uses existing scoring, route intelligence, recovery signals, saved searches, and watchlists. It does not imply real seat availability.')
  const [watchlistCount, setWatchlistCount] = useState(() => loadSavedTripWatchlist().length)

  const opportunities = useMemo(() => opportunitySeeds.map((seed) => buildOpportunity(seed, travelerProfile)), [travelerProfile])
  const visibleOpportunities = useMemo(() => filterOpportunities(opportunities, activeFilters), [opportunities, activeFilters])
  const topOpportunities = useMemo(() => [...opportunities].sort((a, b) => b.successPrediction.probability - a.successPrediction.probability).slice(0, 3), [opportunities])

  function toggleFilter(filter: OpportunityFilter) {
    setActiveFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter])
  }

  function saveOpportunity(opportunity: OpportunityCard) {
    const saved = saveSavedSearch({ query: opportunity.plannerQuery, kind: 'ai-trip', carrier: opportunity.carrier.toLowerCase(), label: opportunity.category })
    setStatus(saved ? `Saved ${opportunity.route} for quick reruns.` : 'Could not save this opportunity in this browser session.')
  }

  function watchOpportunity(opportunity: OpportunityCard) {
    const watch = saveTripWatch({
      selectedItinerary: opportunity.route,
      travelDate: 'today',
      carrier: opportunity.carrier,
      score: opportunity.successScore,
      successProbability: opportunity.successPrediction.probability,
      routeConfidenceScore: opportunity.confidenceScore,
      confidenceBadge: opportunity.confidenceBadge,
      riskLevel: opportunity.successPrediction.riskLevel,
      connections: Math.max(0, airportCodesFromRoute(opportunity.route).length - 2),
      totalTravelTime: opportunity.tags.includes('International') ? 'Long-haul window' : 'Same-day candidate'
    })
    setWatchlistCount(loadSavedTripWatchlist().length)
    setStatus(watch ? `Watching ${opportunity.route}.` : 'Could not add this opportunity to the watchlist in this browser session.')
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'radial-gradient(circle at top left, rgba(56, 189, 248, 0.16), transparent 32%), radial-gradient(circle at top right, rgba(192, 132, 252, 0.18), transparent 34%), #020617', color: 'white', padding: 'clamp(16px, 4vw, 32px)', fontFamily: 'Arial', overflowX: 'hidden' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: '#fb7185' }}>Plan</a>
        <a href="/opportunities" style={{ marginRight: 16, color: '#67e8f9' }}>Opportunities</a>
        <a href="/saved-searches" style={{ marginRight: 16, color: '#67e8f9' }}>Saved Searches</a>
        <a href="/watchlist" style={{ color: '#facc15' }}>Watchlist</a>
      </nav>

      <section style={{ maxWidth: 1160, margin: '0 auto' }}>
        <p style={{ color: '#67e8f9', fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' }}>Opportunity Feed MVP</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18, alignItems: 'end' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(34px, 9vw, 58px)', lineHeight: 0.98, margin: '8px 0 12px' }}>Today’s best nonrev opportunities.</h1>
            <p style={{ color: '#cbd5e1', fontSize: 18, maxWidth: 780 }}>Personalized discovery cards surface premium cabin upside, same-day success candidates, Hawaii/Europe/Asia ideas, and hidden-gem routes using existing NONREVY scoring and traveler-profile signals.</p>
          </div>
          <aside style={{ border: '1px solid rgba(103, 232, 249, 0.38)', borderRadius: 22, padding: 16, background: 'rgba(8, 47, 73, 0.45)' }}>
            <strong style={{ color: '#e0f2fe' }}>Profile lens</strong>
            <p style={{ color: '#bae6fd', margin: '8px 0 0' }}>{travelerProfile.travelerType} · {travelerProfile.passPriority} · home {travelerProfile.homeAirport}</p>
            <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>Watchlist items: {watchlistCount}</p>
          </aside>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12, marginTop: 18 }} aria-label="Today's Best Opportunities preview">
          {topOpportunities.map((opportunity) => (
            <a key={opportunity.id} href={`/plan?aiTrip=${encodeURIComponent(opportunity.plannerQuery)}`} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid rgba(148, 163, 184, 0.28)', borderRadius: 18, padding: 14, background: 'rgba(15, 23, 42, 0.7)' }}>
              <small style={{ color: '#94a3b8', fontWeight: 900 }}>Today’s Best Opportunities</small>
              <h2 style={{ margin: '6px 0', fontSize: 18 }}>{opportunity.route}</h2>
              <p style={{ margin: 0, color: '#67e8f9', fontWeight: 900 }}>{opportunity.successPrediction.probability}% prediction · open planner</p>
            </a>
          ))}
        </section>

        <section style={{ border: '1px solid rgba(148, 163, 184, 0.24)', borderRadius: 22, padding: 14, background: 'rgba(15, 23, 42, 0.72)', marginTop: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {filterOptions.map((filter) => {
              const active = activeFilters.includes(filter)
              return (
                <button key={filter} type="button" onClick={() => toggleFilter(filter)} style={{ border: `1px solid ${active ? '#67e8f9' : '#334155'}`, borderRadius: 999, padding: '10px 12px', background: active ? '#164e63' : '#020617', color: active ? '#e0f2fe' : '#cbd5e1', fontWeight: 900 }}>
                  {filter}
                </button>
              )
            })}
            {activeFilters.length > 0 && <button type="button" onClick={() => setActiveFilters([])} style={{ border: '1px solid #475569', borderRadius: 999, padding: '10px 12px', background: 'transparent', color: '#94a3b8', fontWeight: 900 }}>Clear</button>}
          </div>
          <p style={{ color: '#94a3b8', margin: '10px 0 0' }}>{status}</p>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, marginTop: 20 }}>
          {visibleOpportunities.map((opportunity) => (
            <OpportunityCardView key={opportunity.id} opportunity={opportunity} onSave={saveOpportunity} onWatchlist={watchOpportunity} />
          ))}
        </section>

        {!visibleOpportunities.length && (
          <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 22, background: '#0f172a', marginTop: 20 }}>
            <h2>No opportunities match those filters yet.</h2>
            <p style={{ color: '#94a3b8' }}>Try clearing one carrier or region filter. The feed is intentionally conservative in MVP form.</p>
          </section>
        )}
      </section>
    </main>
  )
}
