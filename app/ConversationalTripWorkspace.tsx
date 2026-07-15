'use client'

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { isCurrentLiveAvailability } from '../lib/liveAvailabilityGuard'
import {
  applyWorkspaceFilters,
  emptyTripContext,
  itineraryStopCount,
  mergeTripContext,
  noLoadDataLabel,
  promptRequiresProviderRefresh,
  routeAirports,
  summarizeVerifiedResult,
  type ConversationalItinerary,
  type TripContext,
  type WorkspaceFilters,
  type WorkspaceMode,
  type WorkspaceResultSet
} from '../lib/conversationalTripWorkspace'
import { markActivationStep } from '../lib/onboardingActivation'

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

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
      text: 'Tell me where you need to go. I’ll keep the answer short and attach any verified itinerary workspace right here.'
    }
  ])
  const [prompt, setPrompt] = useState(initialPrompt)
  const [results, setResults] = useState<WorkspaceResultSet[]>([])
  const [activeResultId, setActiveResultId] = useState<string | null>(null)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('collapsed')
  const [filters, setFilters] = useState<WorkspaceFilters>({ avoidAirports: [], carriers: [], sort: 'ranked' })
  const [powerView, setPowerView] = useState(false)
  const [expandedCards, setExpandedCards] = useState<string[]>([])
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const restored = useRef(false)
  const hydratedInitialPrompt = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    try {
      const saved = window.localStorage.getItem(storageKey)
      if (!saved) return
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed.messages)) setMessages(parsed.messages)
      if (Array.isArray(parsed.results)) setResults(parsed.results)
      if (parsed.context) setContext(parsed.context)
      if (parsed.activeResultId) setActiveResultId(parsed.activeResultId)
      if (parsed.workspaceMode) setWorkspaceMode(parsed.workspaceMode)
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
    if (hydratedInitialPrompt.current || !initialPrompt.trim()) return
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
    markActivationStep('runFirstTripPlan')
    const params = new URLSearchParams({ q: query })
    if (nextContext.origin) params.set('origin', nextContext.origin)
    if (nextContext.date) params.set('date', nextContext.date)
    if (nextContext.preferredAirlines[0]) params.set('carrier', nextContext.preferredAirlines[0].toLowerCase())
    params.set('maxLegs', String((nextContext.maxStops ?? 1) + 1))

    try {
      const response = await fetch(`/api/itinerary/search?${params.toString()}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.errorMessage || data?.message || `Search failed with HTTP ${response.status}`)

      const rawItineraries = Array.isArray(data?.itineraries) ? data.itineraries as ConversationalItinerary[] : []
      const rawFrameworkRoutes = Array.isArray(data?.frameworkRoutes) ? data.frameworkRoutes as ConversationalItinerary[] : []
      const scheduleItineraries = rawItineraries.filter((itinerary) => isCurrentLiveAvailability(itinerary))
      const frameworkRoutes = [...rawFrameworkRoutes, ...rawItineraries.filter((itinerary) => itinerary.dataFreshnessRule === 'route-framework' || itinerary.sourceProvider === 'route-framework' || itinerary.source === 'route-framework')]
      const result: WorkspaceResultSet = {
        id: newId('result'),
        query,
        context: nextContext,
        itineraries: scheduleItineraries,
        frameworkRoutes,
        warnings: Array.isArray(data?.warnings) ? data.warnings : [],
        source: data?.sourceLabel || 'Canonical itinerary search',
        dataMode: apiDataModeLabel(data?.dataMode, scheduleItineraries.length),
        status: data?.errorMessage || '',
        debug: data?.debug || null,
        createdAt: new Date().toISOString()
      }
      result.status = summarizeVerifiedResult(result)
      setResults((current) => [...current, result])
      setActiveResultId(result.id)
      setWorkspaceMode('collapsed')
      addAssistantMessage(summarizeVerifiedResult(result), result.id)
    } catch (providerError) {
      const message = providerError instanceof Error && providerError.message ? providerError.message : 'No current live itinerary data is available for that request.'
      setError(message)
      addAssistantMessage(`${message} Try a specific airport pair, a different date, or broader carrier scope.`)
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
          <p>Fly Smarter</p>
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
                />
              ) : null}
            </article>
          ))}
          {loading ? <div className="nonrevy-conversation__loading">Checking current schedule availability…</div> : null}
          {error ? <p className="nonrevy-conversation__error">{error}</p> : null}
        </div>

        <div className="nonrevy-conversation__examples" aria-label="Example prompts">
          {examplePrompts.map((example) => (
            <button key={example} type="button" onClick={() => void submitPrompt(example)}>{example}</button>
          ))}
        </div>

        <form className="nonrevy-conversation__composer" onSubmit={onSubmit}>
          <label htmlFor="conversation-trip-prompt">Trip request</label>
          <div>
            <textarea
              id="conversation-trip-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask for a trip, then refine it: avoid SFO, one-stop only, earliest arrival..."
              rows={2}
            />
            <button type="submit" disabled={loading}>{loading ? 'Searching' : 'Send'}</button>
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

          <Warnings result={activeResult} />

          {powerView ? (
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

function InlineResult({ result, active, mode, onOpen, onCollapse, onMinimize }: {
  result: WorkspaceResultSet | null
  active: boolean
  mode: WorkspaceMode
  onOpen: () => void
  onCollapse: () => void
  onMinimize: () => void
}) {
  if (!result) return null
  return (
    <div className={`nonrevy-inline-result${active ? ' nonrevy-inline-result--active' : ''}`}>
      <div>
        <strong>{result.itineraries.length} viable itineraries found</strong>
        <span>{result.dataMode} · {result.source} · {new Date(result.createdAt).toLocaleTimeString()}</span>
        {result.warnings[0] || result.debug?.originCoverage?.status === 'insufficient' ? (
          <small>{result.warnings[0] || result.debug?.originCoverage?.message || 'Partial coverage warning attached'}</small>
        ) : null}
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

function Warnings({ result }: { result: WorkspaceResultSet }) {
  const warnings = [
    ...result.warnings,
    ...(result.debug?.originCoverage?.status === 'insufficient' && result.debug.originCoverage.message ? [result.debug.originCoverage.message] : []),
    ...(result.debug?.trueLiveDataUnavailableReason ? [result.debug.trueLiveDataUnavailableReason] : [])
  ]
  if (!warnings.length && !result.frameworkRoutes.length) return null
  return (
    <section className="nonrevy-workspace__warnings">
      {warnings.map((warning) => <p key={warning}>{warning}</p>)}
      {result.frameworkRoutes.length ? <p>{result.frameworkRoutes.length} framework route{result.frameworkRoutes.length === 1 ? '' : 's'} exist separately from verified schedule availability.</p> : null}
      <p>Schedule availability and standby/load availability are separate. No seat count or probability is shown without a verified source.</p>
    </section>
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
