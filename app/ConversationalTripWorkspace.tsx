'use client'

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { runBetaSearchFromPrompt } from '../lib/betaSearchClient'
import { isCurrentLiveAvailability } from '../lib/liveAvailabilityGuard'
import {
  applyWorkspaceFilters,
  emptyTripContext,
  itineraryStopCount,
  mergeTripContext,
  noLoadDataLabel,
  providerSearchPromptFromContext,
  promptRequiresProviderRefresh,
  routeAirports,
  shouldAppendAssistantMessage,
  summarizeVerifiedResult,
  type ConversationalItinerary,
  type TripContext,
  type WorkspaceFilters,
  type WorkspaceMode,
  type WorkspaceResultSet
} from '../lib/conversationalTripWorkspace'
import { markActivationStep } from '../lib/onboardingActivation'
import { loadTravelerProfileFromStorage } from '../lib/travelerProfile'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  resultId?: string
}

const storageKey = 'nonrevy-conversational-workspace-v1'

const examplePrompts = [
  'LAX to HND tomorrow',
  'Show only one-stop routes',
  'Avoid SFO',
  'Which arrives earliest?'
]

const verifiedLiveUnavailableMessage = "I couldn't retrieve verified live itineraries from the currently connected sources."
let generatedId = 0

function newId(prefix: string) {
  generatedId += 1
  return `${prefix}-${Date.now()}-${generatedId}`
}

function sourceLabel(itinerary: ConversationalItinerary) {
  const value = `${itinerary.sourceProvider || ''} ${itinerary.source || ''}`.toLowerCase()
  if (value.includes('flightaware')) return 'FlightAware schedule source'
  if (value.includes('aviationstack')) return 'Aviationstack schedule source'
  if (value.includes('supabase')) return 'Stored Supabase schedule source'
  if (value.includes('route-framework')) return 'Route framework only'
  return itinerary.sourceProvider || itinerary.source || 'Source not specified'
}

function freshnessLabel(itinerary: ConversationalItinerary, dataMode: string) {
  return itinerary.dataFreshnessLabel || dataMode || 'Freshness not specified'
}

function formatTime(value?: string) {
  if (!value) return 'Pending schedule data'
  return value
}

function itineraryRoute(itinerary: ConversationalItinerary) {
  if (itinerary.legs?.length) return routeAirports(itinerary).join(' → ')
  return itinerary.route || 'Route pending'
}

function hasOvernightSegment(itinerary: ConversationalItinerary) {
  return Boolean(itinerary.legs?.some((leg) => {
    if (!leg.departureTime || !leg.arrivalTime) return false
    const departure = leg.departureTime.match(/\d{4}-\d{2}-\d{2}/)?.[0]
    const arrival = leg.arrivalTime.match(/\d{4}-\d{2}-\d{2}/)?.[0]
    return departure && arrival && departure !== arrival
  }))
}

function apiDataModeLabel(dataMode: string, itineraryCount: number) {
  if (dataMode === 'route-frameworks') return 'Route frameworks · live availability unavailable'
  if (dataMode === 'no-current-live-data') return 'No current live data'
  if (dataMode === 'nearest-date-testing') return 'Nearest-date testing data'
  if (dataMode === 'stored-supabase') return 'Stored Supabase flight data'
  if (dataMode === 'provider-cache') return 'Cached schedule data · live loads unavailable'
  if (dataMode === 'test-data') return 'Demo fallback data'
  if (dataMode === 'fallback' || itineraryCount === 0) return 'No current live data'
  return 'Live flight schedule data · load data unavailable'
}

function providerLimitationNotes(result: WorkspaceResultSet) {
  const diagnosticText = [
    ...result.warnings,
    result.status,
    result.debug?.trueLiveDataUnavailableReason,
    ...(result.debug?.safeErrors || [])
  ].filter(Boolean).join(' ').toLowerCase()

  const notes = [
    !result.itineraries.length ? verifiedLiveUnavailableMessage : undefined,
    /rate limit|rate-limited|429|quota|usage limit|monthly/.test(diagnosticText)
      ? 'Provider limitation: a connected source is rate-limited right now.'
      : undefined,
    result.frameworkRoutes.length
      ? `${result.frameworkRoutes.length} route framework${result.frameworkRoutes.length === 1 ? '' : 's'} matched separately from verified live itinerary results.`
      : undefined,
    result.dataMode.toLowerCase().includes('cached')
      ? 'Provider limitation: cached schedule rows are not shown as live availability.'
      : undefined,
    result.debug?.originCoverage?.status === 'insufficient'
      ? 'Schedule coverage: connected sources do not have complete coverage for this airport or route.'
      : undefined
  ].filter(Boolean)

  return Array.from(new Set(notes)).slice(0, 3)
}

function developerDiagnostics(result: WorkspaceResultSet) {
  return [
    ...result.warnings.map((warning) => `Warning: ${warning}`),
    ...(result.debug?.safeErrors || []).map((error) => `Safe error: ${error}`),
    ...(result.debug?.providerDiagnostics || []).map((diagnostic) => `${diagnostic.category}: ${diagnostic.summary} ${diagnostic.detail}`),
    ...(result.debug?.dataFreshnessExplanation || []).map((detail) => `Freshness: ${detail}`),
    ...(result.debug?.providerExplanation || []).map((detail) => `Provider: ${detail}`)
  ].filter(Boolean)
}

function initialFiltersFromContext(context: TripContext): WorkspaceFilters {
  return {
    maxStops: context.maxStops,
    avoidAirports: context.avoidedAirports,
    carriers: context.preferredAirlines,
    sort: context.connectionPreference === 'earliest arrival' ? 'earliest' : 'ranked'
  }
}

export default function ConversationalTripWorkspace({ initialPrompt = '' }: { initialPrompt?: string }) {
  const [context, setContext] = useState<TripContext>(() => emptyTripContext())
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      text: 'Find the non-rev route most likely to get you there. Search your trip, compare your chances, and know your backups. Public schedule preview is available first; verify airline eligibility to unlock ZED compatibility, load intelligence, personalized scoring, saved trips, watchlists, and load requests.'
    }
  ])
  const [prompt, setPrompt] = useState(initialPrompt)
  const [results, setResults] = useState<WorkspaceResultSet[]>([])
  const [activeResultId, setActiveResultId] = useState<string | null>(null)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('expanded')
  const [filters, setFilters] = useState<WorkspaceFilters>({ avoidAirports: [], carriers: [], sort: 'ranked' })
  const [powerView, setPowerView] = useState(false)
  const [developerDiagnosticsEnabled, setDeveloperDiagnosticsEnabled] = useState(false)
  const [expandedCards, setExpandedCards] = useState<string[]>([])
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [searchState, setSearchState] = useState<'idle' | 'parsing' | 'validating' | 'searching' | 'success' | 'no-viable-plans' | 'api-validation-error' | 'api-server-error' | 'malformed-response' | 'offline-network-error'>('idle')
  const [error, setError] = useState('')
  const restored = useRef(false)
  const restoredSavedResult = useRef(false)
  const hydratedInitialPrompt = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    try {
      const saved = window.localStorage.getItem(storageKey)
      if (!saved) return
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed.messages)) setMessages(parsed.messages)
      if (Array.isArray(parsed.results)) {
        restoredSavedResult.current = parsed.results.length > 0
        setResults(parsed.results)
      }
      if (parsed.context) setContext(parsed.context)
      if (parsed.activeResultId) setActiveResultId(parsed.activeResultId)
      if (parsed.workspaceMode && (parsed.activeResultId || parsed.results?.length)) setWorkspaceMode(parsed.workspaceMode)
      if (parsed.filters) setFilters(parsed.filters)
      if (Array.isArray(parsed.expandedCards)) setExpandedCards(parsed.expandedCards)
      if (Array.isArray(parsed.compareIds)) setCompareIds(parsed.compareIds)
    } catch {
      window.localStorage.removeItem(storageKey)
    }
  }, [])

  useEffect(() => {
    if (!restored.current) return
    window.localStorage.setItem(storageKey, JSON.stringify({
      context,
      messages,
      results,
      activeResultId,
      workspaceMode,
      filters,
      expandedCards,
      compareIds
    }))
  }, [context, messages, results, activeResultId, workspaceMode, filters, expandedCards, compareIds])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const enabled = ['1', 'true', 'yes', 'on'].includes((params.get('debug') || params.get('developer') || '').toLowerCase()) || window.localStorage.getItem('nonrevyDeveloperMode') === 'true'
    setDeveloperDiagnosticsEnabled(enabled)
  }, [])

  useEffect(() => {
    if (hydratedInitialPrompt.current || restoredSavedResult.current || !initialPrompt.trim()) return
    hydratedInitialPrompt.current = true
    void submitPrompt(initialPrompt)
  }, [initialPrompt])

  const activeResult = useMemo(
    () => results.find((result) => result.id === activeResultId) || results[results.length - 1] || null,
    [results, activeResultId]
  )
  const allScheduleItineraries = activeResult?.itineraries || []
  const filteredItineraries = useMemo(
    () => applyWorkspaceFilters(allScheduleItineraries, filters),
    [allScheduleItineraries, filters]
  )
  const pinnedCount = context.pinnedItineraryIds.length
  const filteredOutCount = Math.max(0, allScheduleItineraries.length - filteredItineraries.length)
  const comparisonItineraries = filteredItineraries.filter((itinerary) => compareIds.includes(itinerary.id))

  function addAssistantMessage(text: string, resultId?: string) {
    setMessages((current) => [...current, { id: newId('assistant'), role: 'assistant', text, resultId }])
  }

  function addAssistantMessageOnce(text: string, resultId?: string) {
    setMessages((current) => {
      if (!shouldAppendAssistantMessage(current, text, resultId)) return current
      return [...current, { id: newId('assistant'), role: 'assistant', text, resultId }]
    })
  }

  function updateContextFromPrompt(nextPrompt: string) {
    const merged = mergeTripContext(context, nextPrompt)
    setContext(merged)
    setFilters((current) => {
      if (merged.followUpIntent === 'show-all') return { avoidAirports: [], carriers: [], sort: 'ranked' }
      const exactStops = /\bonly\s+one[-\s]?stop\b|\bone[-\s]?stop\s+routes?\b/i.test(nextPrompt)
        ? 1
        : /\bnonstop\s+only\b|\bonly\s+nonstop\b/i.test(nextPrompt)
          ? 0
          : undefined
      return {
        ...current,
        exactStops,
        maxStops: merged.maxStops,
        avoidAirports: merged.avoidedAirports,
        carriers: merged.preferredAirlines,
        sort: merged.connectionPreference === 'earliest arrival' ? 'earliest' : current.sort
      }
    })
    return merged
  }

  async function runProviderSearch(query: string, nextContext: TripContext) {
    setLoading(true)
    setError('')
    setSearchState('parsing')
    markActivationStep('runFirstTripPlan')
    const storage = typeof window !== 'undefined' ? window.sessionStorage : undefined
    try {
      setSearchState('validating')
      const profile = loadTravelerProfileFromStorage()
      setSearchState('searching')
      const providerQuery = providerSearchPromptFromContext(query, nextContext)
      const result = await runBetaSearchFromPrompt({ prompt: providerQuery, profile, storage })
      if (result.ok) {
        setSearchState('success')
        window.location.href = '/results'
        return
      }

      setSearchState(result.state)
      addAssistantMessageOnce(result.message)
    } finally {
      setLoading(false)
    }
  }

  async function submitPrompt(nextPrompt = prompt) {
    const trimmed = nextPrompt.trim()
    if (!trimmed) {
      setError('Ask for a route, destination, date, or itinerary refinement.')
      return
    }
    setPrompt('')
    setMessages((current) => [...current, { id: newId('user'), role: 'user', text: trimmed }])
    const shouldRefresh = promptRequiresProviderRefresh(trimmed, context)
    const nextContext = updateContextFromPrompt(trimmed)
    if (shouldRefresh || !activeResult) {
      await runProviderSearch(trimmed, nextContext)
      return
    }

    const intent = nextContext.followUpIntent
    const result = activeResult
    if (intent === 'earliest-arrival') {
      setFilters((current) => ({ ...current, sort: 'earliest' }))
      addAssistantMessage('Sorted the current result by earliest verified arrival. No provider refresh needed.', result.id)
    } else if (intent === 'backup' || intent === 'first-leg-fills') {
      setFilters((current) => ({ ...current, sort: 'fewest-stops' }))
      addAssistantMessage('I’m showing the current result with backup-friendly routing first. I’m not inventing alternate flights beyond the returned itinerary set.', result.id)
    } else if (intent === 'compare') {
      addAssistantMessage('Select Compare on two itinerary cards and I’ll keep their schedule, source, freshness, and load-data status side by side.', result.id)
    } else if (intent === 'show-all') {
      addAssistantMessage(`Filters cleared. All ${result.itineraries.length} scheduled itineraries remain accessible.`, result.id)
    } else {
      addAssistantMessage('Updated the current trip workspace using local filters. The cached result set is still attached below.', result.id)
    }
    setWorkspaceMode((current) => current === 'minimized' ? 'collapsed' : current)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitPrompt()
  }

  function togglePin(id: string) {
    setContext((current) => ({
      ...current,
      pinnedItineraryIds: current.pinnedItineraryIds.includes(id)
        ? current.pinnedItineraryIds.filter((item) => item !== id)
        : [...current.pinnedItineraryIds, id],
      selectedItineraryId: id
    }))
  }

  function toggleCompare(id: string) {
    setCompareIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current.slice(-1), id]
    )
  }

  function applyAction(action: string, itinerary: ConversationalItinerary) {
    if (action === 'avoid') {
      const airports = routeAirports(itinerary).slice(1, -1)
      const nextAvoid = airports[0]
      if (!nextAvoid) return
      setContext((current) => ({ ...current, avoidedAirports: Array.from(new Set([...current.avoidedAirports, nextAvoid])) }))
      setFilters((current) => ({ ...current, avoidAirports: Array.from(new Set([...current.avoidAirports, nextAvoid])) }))
      addAssistantMessage(`Avoiding ${nextAvoid} in the current result set. I did not rerun provider search.`, activeResult?.id)
    }
    if (action === 'prefer') {
      const carrier = itinerary.carrier || itinerary.legs?.[0]?.carrier
      if (!carrier) return
      setContext((current) => ({ ...current, preferredAirlines: Array.from(new Set([...current.preferredAirlines, carrier])) }))
      setFilters((current) => ({ ...current, carriers: Array.from(new Set([...current.carriers, carrier])) }))
      addAssistantMessage(`Preferring ${carrier} in the current result set.`, activeResult?.id)
    }
    if (action === 'explain') {
      addAssistantMessage(`This card is a verified itinerary display only: ${itineraryRoute(itinerary)} from ${sourceLabel(itinerary)} with ${freshnessLabel(itinerary, activeResult?.dataMode || '')}. ${noLoadDataLabel(itinerary)}.`, activeResult?.id)
    }
    if (action === 'backups') {
      const backups = itinerary.suggestedRecoveryPaths?.map((path) => path.label).join(' · ')
      addAssistantMessage(backups || 'No backup itinerary has been verified from current schedule rows for this card.', activeResult?.id)
    }
  }

  return (
    <main className="app-shell nonrevy-conversation">
      <section className="nonrevy-conversation__chat" aria-label="Conversational trip workspace">
        <header className="nonrevy-conversation__header">
          <a href="/" className="nonrevy-conversation__brand nonrevy-logo">NONREVY</a>
          <p>Private Beta</p>
          <p>Search your trip - Compare your chances - Know your backups</p>
        </header>

        <ContextStrip context={context} />

        <div className="nonrevy-conversation__messages" aria-live="polite">
          {messages.map((message) => (
            <article key={message.id} className={`nonrevy-conversation__message nonrevy-conversation__message--${message.role}`}>
              <p>{message.text}</p>
              {message.resultId ? (
                <InlineResult
                  result={results.find((result) => result.id === message.resultId) || null}
                  active={message.resultId === activeResultId}
                  mode={workspaceMode}
                  onOpen={() => {
                    setActiveResultId(message.resultId || null)
                    setWorkspaceMode('expanded')
                  }}
                  onCollapse={() => {
                    setActiveResultId(message.resultId || null)
                    setWorkspaceMode('collapsed')
                  }}
                  onMinimize={() => {
                    setActiveResultId(message.resultId || null)
                    setWorkspaceMode('minimized')
                  }}
                  developerDiagnosticsEnabled={developerDiagnosticsEnabled}
                />
              ) : null}
            </article>
          ))}
          {loading ? <div className="nonrevy-conversation__loading" aria-live="polite">{searchState === 'searching' ? 'Searching beta route frameworks...' : searchState === 'validating' ? 'Validating trip request...' : 'Parsing trip request...'}</div> : null}
          {error ? <p className="nonrevy-conversation__error" role="alert">{error}</p> : null}
        </div>

        <div className="nonrevy-conversation__examples" aria-label="Example prompts">
          {examplePrompts.map((example) => (
            <button key={example} type="button" onClick={() => void submitPrompt(example)}>{example}</button>
          ))}
        </div>

        <form className="nonrevy-conversation__composer" onSubmit={onSubmit}>
          <label className="nonrevy-conversation__composer-label" htmlFor="conversation-trip-prompt">Trip request</label>
          <div>
            <textarea
              id="conversation-trip-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Where do you need to go?"
              rows={1}
            />
            <button type="submit" disabled={loading}>
              <span>{loading ? 'Searching' : 'Send'}</span>
              <SendIcon />
            </button>
          </div>
        </form>
      </section>

      {activeResult && workspaceMode === 'expanded' ? (
        <section className="nonrevy-workspace" aria-label="Expanded itinerary workspace">
          <WorkspaceHeader
            result={activeResult}
            filters={filters}
            context={context}
            mode={workspaceMode}
            filteredCount={filteredItineraries.length}
            filteredOutCount={filteredOutCount}
            pinnedCount={pinnedCount}
            powerView={powerView}
            onFilters={setFilters}
            onPowerView={setPowerView}
            onCollapse={() => setWorkspaceMode('collapsed')}
            onMinimize={() => setWorkspaceMode('minimized')}
          />

          <Warnings result={activeResult} developerDiagnosticsEnabled={developerDiagnosticsEnabled} />

          {!filteredItineraries.length ? (
            <NoResultPanel result={activeResult} filteredOutCount={filteredOutCount} developerDiagnosticsEnabled={developerDiagnosticsEnabled} />
          ) : powerView ? (
            <PowerView itineraries={filteredItineraries} selectedIds={compareIds} onCompare={toggleCompare} result={activeResult} />
          ) : (
            <div className="nonrevy-workspace__grid">
              {filteredItineraries.map((itinerary) => (
                <ItineraryCard
                  key={itinerary.id}
                  itinerary={itinerary}
                  result={activeResult}
                  pinned={context.pinnedItineraryIds.includes(itinerary.id)}
                  comparing={compareIds.includes(itinerary.id)}
                  expanded={expandedCards.includes(itinerary.id)}
                  onPin={() => togglePin(itinerary.id)}
                  onCompare={() => toggleCompare(itinerary.id)}
                  onExpand={() => setExpandedCards((current) => current.includes(itinerary.id) ? current.filter((id) => id !== itinerary.id) : [...current, itinerary.id])}
                  onAction={applyAction}
                />
              ))}
            </div>
          )}

          {comparisonItineraries.length ? <ComparisonStrip itineraries={comparisonItineraries} result={activeResult} /> : null}
          {filteredOutCount ? <button type="button" className="nonrevy-workspace__show-all" onClick={() => setFilters({ avoidAirports: [], carriers: [], sort: 'ranked' })}>Show everything ({allScheduleItineraries.length})</button> : null}
        </section>
      ) : null}

      {activeResult && workspaceMode === 'minimized' ? (
        <button type="button" className="nonrevy-trip-bar" onClick={() => setWorkspaceMode('expanded')}>
          <strong>{activeResult.itineraries.length || activeResult.frameworkRoutes.length} trip result{activeResult.itineraries.length === 1 ? '' : 's'}</strong>
          <span>{activeResult.context.origin || 'Origin'} → {activeResult.context.destination || 'Destination'} · {pinnedCount} pinned</span>
        </button>
      ) : null}
    </main>
  )
}

function SendIcon() {
  return (
    <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4z" />
    </svg>
  )
}

function InlineResult({ result, active, mode, onOpen, onCollapse, onMinimize, developerDiagnosticsEnabled }: {
  result: WorkspaceResultSet | null
  active: boolean
  mode: WorkspaceMode
  onOpen: () => void
  onCollapse: () => void
  onMinimize: () => void
  developerDiagnosticsEnabled: boolean
}) {
  if (!result) return null
  const limitations = providerLimitationNotes(result)
  const diagnostics = developerDiagnostics(result)
  return (
    <div className={`nonrevy-inline-result${active ? ' nonrevy-inline-result--active' : ''}`}>
      <div>
        <strong>{result.itineraries.length ? `${result.itineraries.length} viable itinerar${result.itineraries.length === 1 ? 'y' : 'ies'} found` : 'No verified live itineraries found'}</strong>
        <span>{result.dataMode} · {result.source} · {new Date(result.createdAt).toLocaleTimeString()}</span>
        {limitations.map((limitation) => <small key={limitation}>{limitation}</small>)}
        <DebugDisclosure diagnostics={diagnostics} enabled={developerDiagnosticsEnabled} />
      </div>
      <div>
        <button type="button" onClick={mode === 'expanded' && active ? onCollapse : onOpen}>{mode === 'expanded' && active ? 'Collapse' : 'Expand'}</button>
        <button type="button" onClick={onMinimize}>Minimize</button>
      </div>
    </div>
  )
}

function ContextStrip({ context }: { context: TripContext }) {
  const chips = [
    ['Origin', context.origin],
    ['Destination', context.destination],
    ['Date', context.date],
    ['Benefits', context.travelerBenefits.join(', ')],
    ['Preferred', context.preferredAirlines.join(', ')],
    ['Avoid', context.avoidedAirports.join(', ')],
    ['Max stops', typeof context.maxStops === 'number' ? String(context.maxStops) : undefined],
    ['Connections', context.connectionPreference],
    ['Cabin', context.cabin],
    ['Overnight', context.overnightTolerance],
    ['Pinned', context.pinnedItineraryIds.length ? String(context.pinnedItineraryIds.length) : undefined],
    ['Intent', context.followUpIntent]
  ].filter(([, value]) => Boolean(value))

  if (!chips.length) return null

  return (
    <section className="nonrevy-context-strip" aria-label="Current trip context">
      {chips.map(([label, value]) => (
        <span key={label}>
          <strong>{label}</strong>
          {value}
        </span>
      ))}
    </section>
  )
}

function WorkspaceHeader({ result, filters, context, mode, filteredCount, filteredOutCount, pinnedCount, powerView, onFilters, onPowerView, onCollapse, onMinimize }: {
  result: WorkspaceResultSet
  filters: WorkspaceFilters
  context: TripContext
  mode: WorkspaceMode
  filteredCount: number
  filteredOutCount: number
  pinnedCount: number
  powerView: boolean
  onFilters: (filters: WorkspaceFilters) => void
  onPowerView: (value: boolean) => void
  onCollapse: () => void
  onMinimize: () => void
}) {
  return (
    <header className="nonrevy-workspace__header">
      <div>
        <p className="nonrevy-workspace__eyebrow">Itinerary workspace</p>
        <h2>{context.origin || 'Origin'} → {context.destination || 'Destination'}</h2>
        <p>{mode} · {filteredCount} shown · {result.itineraries.length} total viable scheduled itineraries · {pinnedCount} pinned{filteredOutCount ? ` · ${filteredOutCount} hidden by local filters` : ''}</p>
      </div>
      <div className="nonrevy-workspace__controls">
        <select value={filters.sort} onChange={(event) => onFilters({ ...filters, sort: event.target.value as WorkspaceFilters['sort'] })} aria-label="Sort itineraries">
          <option value="ranked">Ranked</option>
          <option value="earliest">Earliest arrival</option>
          <option value="fewest-stops">Fewest stops</option>
          <option value="duration">Duration</option>
        </select>
        <select value={filters.maxStops ?? ''} onChange={(event) => onFilters({ ...filters, maxStops: event.target.value === '' ? undefined : Number(event.target.value) })} aria-label="Filter stops">
          <option value="">Any stops</option>
          <option value="0">Nonstop</option>
          <option value="1">Up to 1 stop</option>
          <option value="2">Up to 2 stops</option>
        </select>
        <input
          value={filters.carriers.join(', ')}
          onChange={(event) => onFilters({ ...filters, carriers: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })}
          placeholder="Carrier filter"
          aria-label="Carrier filter"
        />
        <input
          value={filters.avoidAirports.join(', ')}
          onChange={(event) => onFilters({ ...filters, avoidAirports: event.target.value.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean) })}
          placeholder="Avoid airports"
          aria-label="Avoid airports"
        />
        <button type="button" aria-pressed={powerView} onClick={() => onPowerView(!powerView)}>Power View</button>
        <button type="button" onClick={onCollapse}>Collapse</button>
        <button type="button" onClick={onMinimize}>Minimize</button>
      </div>
    </header>
  )
}

function Warnings({ result, developerDiagnosticsEnabled }: { result: WorkspaceResultSet; developerDiagnosticsEnabled: boolean }) {
  const warnings = providerLimitationNotes(result)
  const diagnostics = developerDiagnostics(result)
  if (!warnings.length && !result.frameworkRoutes.length && !result.itineraries.length) return null
  return (
    <section className="nonrevy-workspace__warnings">
      <p><strong>Schedule coverage:</strong> {result.dataMode}</p>
      <p><strong>Itinerary results:</strong> {result.itineraries.length ? `${result.itineraries.length} verified live itinerar${result.itineraries.length === 1 ? 'y' : 'ies'} returned.` : verifiedLiveUnavailableMessage}</p>
      <p><strong>Load availability:</strong> Standby/load availability is separate and unavailable unless a verified load source is attached.</p>
      <p><strong>Provider limitation:</strong> {warnings[0] || 'No provider limitation is shown for this result.'}</p>
      {warnings.slice(1).map((warning) => <p key={warning}>{warning}</p>)}
      <DebugDisclosure diagnostics={diagnostics} enabled={developerDiagnosticsEnabled} />
    </section>
  )
}

function NoResultPanel({ result, filteredOutCount, developerDiagnosticsEnabled }: { result: WorkspaceResultSet; filteredOutCount: number; developerDiagnosticsEnabled: boolean }) {
  const diagnostics = developerDiagnostics(result)
  return (
    <section className="nonrevy-empty-result">
      <strong>{filteredOutCount ? 'No itineraries match the current filters.' : 'No verified live itineraries are available for this result.'}</strong>
      <p>{filteredOutCount ? 'Clear filters to bring the verified returned itineraries back.' : verifiedLiveUnavailableMessage}</p>
      {result.frameworkRoutes.length ? <p>{result.frameworkRoutes.length} route framework{result.frameworkRoutes.length === 1 ? '' : 's'} matched, but frameworks are not displayed as live availability.</p> : null}
      <DebugDisclosure diagnostics={diagnostics} enabled={developerDiagnosticsEnabled} />
    </section>
  )
}

function DebugDisclosure({ diagnostics, enabled }: { diagnostics: string[]; enabled: boolean }) {
  if (!enabled || !diagnostics.length) return null
  return (
    <details className="nonrevy-debug-disclosure">
      <summary>Developer diagnostics</summary>
      <ul>
        {diagnostics.map((diagnostic) => <li key={diagnostic}>{diagnostic}</li>)}
      </ul>
    </details>
  )
}

function ItineraryCard({ itinerary, result, pinned, comparing, expanded, onPin, onCompare, onExpand, onAction }: {
  itinerary: ConversationalItinerary
  result: WorkspaceResultSet
  pinned: boolean
  comparing: boolean
  expanded: boolean
  onPin: () => void
  onCompare: () => void
  onExpand: () => void
  onAction: (action: string, itinerary: ConversationalItinerary) => void
}) {
  const legs = itinerary.legs || []
  return (
    <article className="nonrevy-itinerary-card">
      <header>
        <div>
          <h3>{itineraryRoute(itinerary)}</h3>
          <p>{itinerary.carrier || legs.map((leg) => leg.carrier).filter(Boolean).join(', ') || 'Carrier pending'} · {itinerary.flightNumber || legs.map((leg) => leg.flightNumber).filter(Boolean).join(', ') || 'Flight numbers pending'}</p>
        </div>
        <span>{itinerary.risk || 'Trust pending'}</span>
      </header>
      <dl>
        <div><dt>Depart</dt><dd>{formatTime(itinerary.departureTime || legs[0]?.departureTime)}</dd></div>
        <div><dt>Arrive</dt><dd>{formatTime(itinerary.arrivalTime || legs[legs.length - 1]?.arrivalTime)}</dd></div>
        <div><dt>Duration</dt><dd>{itinerary.duration || 'Pending schedule data'}</dd></div>
        <div><dt>Stops</dt><dd>{itineraryStopCount(itinerary)}</dd></div>
        <div><dt>Overnight</dt><dd>{hasOvernightSegment(itinerary) ? 'Overnight segment' : 'Not indicated'}</dd></div>
        <div><dt>Load</dt><dd>{noLoadDataLabel(itinerary)}</dd></div>
      </dl>
      <div className="nonrevy-itinerary-card__badges">
        <span>{sourceLabel(itinerary)}</span>
        <span>{freshnessLabel(itinerary, result.dataMode)}</span>
        <span>{itinerary.dataFreshnessWarning || 'No freshness warning attached'}</span>
      </div>
      <div className="nonrevy-itinerary-card__actions">
        <button type="button" onClick={onPin}>{pinned ? 'Pinned' : 'Pin'}</button>
        <button type="button" aria-pressed={comparing} onClick={onCompare}>Compare</button>
        <button type="button" onClick={() => onAction('explain', itinerary)}>Explain</button>
        <button type="button" onClick={() => onAction('backups', itinerary)}>Show backups</button>
        <button type="button" onClick={onExpand}>{expanded ? 'Hide segments' : 'Show segments'}</button>
        <button type="button" onClick={() => onAction('avoid', itinerary)}>Avoid airport</button>
        <button type="button" onClick={() => onAction('prefer', itinerary)}>Prefer carrier</button>
        <button type="button" onClick={onPin}>Watch route</button>
      </div>
      {expanded ? (
        <div className="nonrevy-itinerary-card__segments">
          {legs.length ? legs.map((leg, index) => (
            <section key={`${itinerary.id}-${index}-${leg.flightNumber || leg.origin}`}>
              <strong>Leg {index + 1}: {leg.origin || 'Origin'} → {leg.destination || 'Destination'}</strong>
              <p>{leg.carrier || 'Carrier pending'} {leg.flightNumber || 'Flight number pending'} · {formatTime(leg.departureTime)} → {formatTime(leg.arrivalTime)} · {leg.duration || 'Duration pending'} · {leg.status || 'Status pending'}</p>
              <small>{leg.sourceProvider || leg.source || 'Source pending'} · {leg.sourceCheckedAt || 'Freshness timestamp pending'}</small>
            </section>
          )) : <p>No ordered segments were attached by the provider response.</p>}
          {itinerary.suggestedRecoveryPaths?.length ? (
            <section>
              <strong>Backups from returned data</strong>
              {itinerary.suggestedRecoveryPaths.map((path) => <p key={path.id || path.label}>{path.label}{path.note ? ` · ${path.note}` : ''}</p>)}
            </section>
          ) : <p>No backup itinerary has been verified from current schedule rows.</p>}
        </div>
      ) : null}
    </article>
  )
}

function PowerView({ itineraries, selectedIds, onCompare, result }: {
  itineraries: ConversationalItinerary[]
  selectedIds: string[]
  onCompare: (id: string) => void
  result: WorkspaceResultSet
}) {
  return (
    <div className="nonrevy-power-view">
      <table>
        <thead>
          <tr>
            <th>Compare</th>
            <th>Route</th>
            <th>Flights</th>
            <th>Depart</th>
            <th>Arrive</th>
            <th>Stops</th>
            <th>Source</th>
            <th>Freshness</th>
            <th>Load</th>
          </tr>
        </thead>
        <tbody>
          {itineraries.map((itinerary) => (
            <tr key={itinerary.id}>
              <td><input type="checkbox" checked={selectedIds.includes(itinerary.id)} onChange={() => onCompare(itinerary.id)} aria-label={`Compare ${itineraryRoute(itinerary)}`} /></td>
              <td>{itineraryRoute(itinerary)}</td>
              <td>{itinerary.flightNumber || itinerary.legs?.map((leg) => leg.flightNumber).filter(Boolean).join(', ') || 'Pending'}</td>
              <td>{formatTime(itinerary.departureTime || itinerary.legs?.[0]?.departureTime)}</td>
              <td>{formatTime(itinerary.arrivalTime || itinerary.legs?.[itinerary.legs.length - 1]?.arrivalTime)}</td>
              <td>{itineraryStopCount(itinerary)}</td>
              <td>{sourceLabel(itinerary)}</td>
              <td>{freshnessLabel(itinerary, result.dataMode)}</td>
              <td>{noLoadDataLabel(itinerary)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ComparisonStrip({ itineraries, result }: { itineraries: ConversationalItinerary[]; result: WorkspaceResultSet }) {
  return (
    <section className="nonrevy-comparison-strip">
      <h3>Comparison</h3>
      <div>
        {itineraries.map((itinerary) => (
          <article key={itinerary.id}>
            <strong>{itineraryRoute(itinerary)}</strong>
            <p>{formatTime(itinerary.departureTime || itinerary.legs?.[0]?.departureTime)} → {formatTime(itinerary.arrivalTime || itinerary.legs?.[itinerary.legs.length - 1]?.arrivalTime)}</p>
            <p>{itineraryStopCount(itinerary)} stops · {sourceLabel(itinerary)} · {freshnessLabel(itinerary, result.dataMode)} · {noLoadDataLabel(itinerary)}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
