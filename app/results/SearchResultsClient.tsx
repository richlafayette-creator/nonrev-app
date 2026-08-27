'use client'

import Link from 'next/link'
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  loadStoredBetaSearchResult,
  readTravelerProfileFromStorage,
  runBetaSearchFromPrompt,
  type BetaSearchStoredResult
} from '../../lib/betaSearchClient'
import {
  removeResultItinerary,
  requestLoadsForResult,
  saveResultItinerary,
  scheduledResultActionAvailability,
  watchResultItinerary
} from '../../lib/resultWorkflowActions'
import { buildCompactItinerarySummary, buildExpandedItineraryIdentity, buildSearchResultsViewModel, layoverLabelBetweenSegments, type SearchPlanCardViewModel, type SearchSegmentViewModel } from './searchResultsViewModel'
import { useI18n } from '../I18nProvider'

type ResultsState =
  | { status: 'loading' }
  | { status: 'ready'; stored: BetaSearchStoredResult }
  | { status: 'missing' }
  | { status: 'malformed' }
  | { status: 'search-error'; message: string }

export type ResultsUrlSearchInput = {
  prompt: string
  explicitDepartureDate?: string
}

export function searchInputFromResultsUrl(search: string): ResultsUrlSearchInput | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const prompt = [
    params.get('aiTrip'),
    params.get('prompt'),
    params.get('q'),
    params.get('query')
  ].find((value) => value && value.trim())?.trim()
  const origin = params.get('origin')?.trim().toUpperCase()
  const destination = params.get('destination')?.trim().toUpperCase()
  const synthesizedPrompt = origin && destination ? `${origin} to ${destination}` : ''
  const explicitDepartureDate = normalizeResultsDate(params.get('date') || params.get('departureDate'))
  const selectedPrompt = prompt || synthesizedPrompt

  if (!selectedPrompt) return null
  return {
    prompt: selectedPrompt,
    ...(explicitDepartureDate ? { explicitDepartureDate } : {})
  }
}

function normalizeResultsDate(value: string | null) {
  const text = value?.trim() || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const parsed = Date.parse(`${text}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return ''
  return new Date(parsed).toISOString().slice(0, 10) === text ? text : ''
}

export default function SearchResultsClient() {
  const { t } = useI18n()
  const [state, setState] = useState<ResultsState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function hydrateResults() {
      const urlSearchInput = searchInputFromResultsUrl(window.location.search)
      if (urlSearchInput) {
        const result = await runBetaSearchFromPrompt({
          ...urlSearchInput,
          profile: readTravelerProfileFromStorage(window.localStorage),
          storage: window.sessionStorage
        })
        if (cancelled) return
        if (result.ok) {
          setState({ status: 'ready', stored: result.storedResult })
          window.history.replaceState(null, '', '/results')
        } else {
          setState({ status: 'search-error', message: result.message })
        }
        return
      }

      const stored = loadStoredBetaSearchResult(window.sessionStorage)
      if (cancelled) return
      setState(stored ? { status: 'ready', stored } : { status: 'missing' })
    }

    hydrateResults().catch(() => {
      if (!cancelled) setState({ status: 'malformed' })
    })

    return () => {
      cancelled = true
    }
  }, [])

  const viewModel = useMemo(() => buildSearchResultsViewModel(state.status === 'ready' ? state.stored : null), [state])

  if (state.status === 'loading') {
    return (
      <main className="app-shell nonrevy-results-page">
        <section className="nonrevy-results-page__shell" aria-live="polite">
          <h1>Loading beta search results</h1>
          <p>Restoring the latest search from this browser session.</p>
        </section>
      </main>
    )
  }

  if (state.status !== 'ready') {
    return (
      <main className="app-shell nonrevy-results-page">
        <section className="nonrevy-results-page__shell" aria-live="polite">
          <h1>{emptyStateTitle(state)}</h1>
          <p>{emptyStateMessage(state, viewModel.subtitle)}</p>
          <Link className="nonrevy-primary-action nonrevy-primary-action--search" href="/"><span className="nonrevy-primary-action__label">Back to search</span></Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell nonrevy-results-page">
      <section className="nonrevy-results-page__shell">
        <header className="nonrevy-results-search" aria-label="Beta search result summary">
          <Link href="/" className="nonrevy-results-search__brand nonrevy-logo">NONREVY</Link>
          <div>
            <h1>{viewModel.title}</h1>
            <p>{viewModel.subtitle}</p>
          </div>
          <Link className="nonrevy-primary-action nonrevy-primary-action--search" href="/"><span className="nonrevy-primary-action__label">New search</span></Link>
        </header>

        {viewModel.publicPreview?.enabled ? (
          <section className="nonrevy-results-page__notice nonrevy-results-page__notice--preview" aria-live="polite">
            <strong>{t('publicSchedulePreview')}</strong>
            <p>{t('previewLockedMessage')}</p>
            <Link href={`/verify?next=${encodeURIComponent('/results')}`}>{t('verifyUnlockTravelerFeatures')}</Link>
          </section>
        ) : null}

        {!viewModel.cards.length && !viewModel.secondaryCards.length ? (
          <section className="nonrevy-production-empty" aria-live="polite">
            <p className="nonrevy-production-empty__eyebrow">No flight options yet</p>
            <h2>No scheduled options were returned.</h2>
            <p className="nonrevy-production-empty__subtext">Try a request with a three-letter origin airport, a departure date, and a destination airport or supported region.</p>
            <Link href="/">Back to search</Link>
          </section>
        ) : (
          <>
            {viewModel.cards.length ? (
              <section className="nonrevy-itinerary-results-list" aria-label="Flight options">
                {viewModel.cards.map((card, index) => <PlanCard key={card.key} card={card} displayRank={index + 1} publicPreview={viewModel.publicPreview?.enabled || false} />)}
              </section>
            ) : (
              <section className="nonrevy-results-page__notice" aria-live="polite">
                <strong>No verified scheduled itineraries yet.</strong>
                <p>Route frameworks are preserved below for investigation, but they are not shown as scheduled flight options.</p>
              </section>
            )}

            {viewModel.secondaryCards.length ? (
              <section className="nonrevy-secondary-routes" aria-label="Routes to investigate">
                <header>
                  <p className="nonrevy-production-empty__eyebrow">Needs schedule verification</p>
                  <h2>Routes to investigate</h2>
                </header>
                <div className="nonrevy-itinerary-results-list nonrevy-itinerary-results-list--secondary">
                  {viewModel.secondaryCards.map((card, index) => <PlanCard key={card.key} card={card} displayRank={index + 1} publicPreview={viewModel.publicPreview?.enabled || false} />)}
                </div>
              </section>
            ) : null}
          </>
        )}

        <SearchTransparencyPanel viewModel={viewModel} />
      </section>
    </main>
  )
}

function emptyStateTitle(state: Exclude<ResultsState, { status: 'loading' } | { status: 'ready'; stored: BetaSearchStoredResult }>) {
  if (state.status === 'malformed') return 'Stored result needs a new search'
  if (state.status === 'search-error') return 'Search could not be completed'
  return 'No saved beta search yet'
}

function emptyStateMessage(
  state: Exclude<ResultsState, { status: 'loading' } | { status: 'ready'; stored: BetaSearchStoredResult }>,
  missingSubtitle: string
) {
  if (state.status === 'malformed') return 'The saved beta search result could not be read safely.'
  if (state.status === 'search-error') return state.message
  return missingSubtitle
}

function SearchTransparencyPanel({ viewModel }: { viewModel: ReturnType<typeof buildSearchResultsViewModel> }) {
  return (
    <details className="nonrevy-results-page__warning" aria-label="Search transparency">
      <summary>Search details · {viewModel.dataQualityLabel}</summary>
      <div className="nonrevy-results-page__warning-body">
        <p><strong>{viewModel.dataQualityLabel}</strong></p>
        <p>{viewModel.staticOnlyNotice}</p>
        <p><strong>Schedule sources:</strong> {viewModel.providerReadinessLabel}</p>
        {viewModel.warnings.length ? (
          <details>
            <summary>Warnings</summary>
            <ul>
              {viewModel.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </details>
        ) : null}
        {viewModel.missingData.length ? (
          <details>
            <summary>Missing data</summary>
            <ul>
              {viewModel.missingData.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </details>
        ) : null}
      </div>
    </details>
  )
}

function PlanCard({ card, displayRank, publicPreview }: { card: SearchPlanCardViewModel; displayRank: number; publicPreview?: boolean }) {
  const { t } = useI18n()
  const [actionStatus, setActionStatus] = useState('')
  const [loadRequestPending, setLoadRequestPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [watched, setWatched] = useState(false)
  const [loadRequested, setLoadRequested] = useState(false)
  const availability = scheduledResultActionAvailability(card)
  const summary = buildCompactItinerarySummary(card, displayRank)
  const expandedIdentity = buildExpandedItineraryIdentity(card)
  const legSummary = visibleLegSummary(card)
  const stopsSummary = compactStopsSummary(card, summary.stopsLabel)
  const scoreLabel = publicPreview ? 'Lock' : String(card.finalScore)
  const scoreAriaLabel = publicPreview ? t('previewLockedMessage') : `Score ${card.finalScore} out of 100`
  const verifyHref = `/verify?next=${encodeURIComponent('/results')}`

  function promptVerification(action: string) {
    setActionStatus(`${action} unlocks after airline eligibility verification.`)
  }

  function handleSave() {
    if (publicPreview) {
      promptVerification('Saving trips')
      return
    }
    const result = saveResultItinerary(card)
    setActionStatus(result.message)
    setSaved(true)
  }

  function handleUnsave() {
    if (publicPreview) {
      promptVerification('Saving trips')
      return
    }
    const result = removeResultItinerary(card)
    setActionStatus(result.message)
    setSaved(false)
  }

  function handleWatch() {
    if (publicPreview) {
      promptVerification('Watching trips')
      return
    }
    const result = watchResultItinerary(card)
    setActionStatus(result.message)
    setWatched(true)
  }

  async function handleLoadRequest() {
    if (publicPreview) {
      promptVerification('Load requests')
      return
    }
    if (loadRequestPending) return
    setLoadRequestPending(true)
    setActionStatus('Submitting load request...')
    const result = await requestLoadsForResult(card)
    setActionStatus(result.message)
    setLoadRequested(result.ok)
    setLoadRequestPending(false)
  }

  return (
    <details className={`nonrevy-itinerary-row nonrevy-itinerary-row--${card.resultClass}`} aria-labelledby={`${card.key}-heading`}>
      <summary className="nonrevy-itinerary-row__summary">
        <span className="nonrevy-itinerary-row__option">{summary.optionLabel}</span>
        <span className="nonrevy-itinerary-row__primary">
          <span className="nonrevy-itinerary-row__flight">
            <AirlineCodeBadge code={summary.airlineCode} name={summary.airlineName} />
            <strong id={`${card.key}-heading`} title={summary.flightSummary}>{summary.flightSummary}</strong>
          </span>
          <span className="nonrevy-itinerary-row__route-time">
            <span className="nonrevy-itinerary-row__route">{summary.routeSummary}</span>
            <span className="nonrevy-itinerary-row__times">{summary.timeSummary}</span>
          </span>
        </span>
        <span className="nonrevy-itinerary-row__meta" aria-label={`${summary.durationLabel}, ${stopsSummary}, ${publicPreview ? 'ZED locked, load locked' : `${summary.zedLabel}, ${summary.loadLabel}`}`}>
          <span className="nonrevy-itinerary-row__duration">{summary.durationLabel}</span>
          <span className="nonrevy-itinerary-row__legs">{stopsSummary}</span>
          <span className={`nonrevy-itinerary-row__zed nonrevy-itinerary-row__zed--${card.zedEligibilityStatus}`}>{publicPreview ? 'ZED locked' : summary.zedLabel}</span>
          <span className="nonrevy-itinerary-row__load">{publicPreview ? 'Load locked' : summary.loadLabel}</span>
        </span>
        <span className="nonrevy-itinerary-row__score" aria-label={scoreAriaLabel}>{scoreLabel}</span>
        {legSummary ? <span className="nonrevy-itinerary-row__leg-summary">{legSummary}</span> : null}
      </summary>

      <div className="nonrevy-itinerary-row__expanded">
        <header className="nonrevy-itinerary-row__expanded-head">
          <div className="nonrevy-itinerary-row__expanded-title">
            {summary.optionLabel === 'Best option' ? <span className="nonrevy-itinerary-row__expanded-badge">Best option</span> : null}
            <AirlineCodeBadge code={summary.airlineCode} name={summary.airlineName} />
            <h2 title={summary.flightSummary}>{summary.flightSummary}</h2>
          </div>
          <div className="nonrevy-itinerary-row__expanded-meta" aria-label={`${expandedIdentity.requestedJourneyLabel}, ${summary.durationLabel}, ${stopsSummary}, ${publicPreview ? 'score locked' : `score ${card.finalScore}`}`}>
            <span>{expandedIdentity.requestedJourneyLabel}</span>
            <span>{summary.durationLabel}</span>
            <span>{stopsSummary}</span>
            <strong aria-label={scoreAriaLabel}>{scoreLabel}</strong>
            <span className={`nonrevy-itinerary-card__zed nonrevy-itinerary-card__zed--${card.zedEligibilityStatus}`}>
              {publicPreview ? 'ZED compatibility locked' : expandedZedLabel(card)}
              {publicPreview ? <> · <Link href={verifyHref}>Verify</Link></> : card.zedEligibilityAction ? <> · <Link href="/profile">{card.zedEligibilityAction}</Link></> : null}
            </span>
            <span>{publicPreview ? 'Load intelligence locked' : summary.loadLabel}</span>
          </div>
          {card.resultClass !== 'scheduled' ? <p className="nonrevy-itinerary-card__classification">{card.resultClassSummary}</p> : null}
        </header>

        {card.resultClass !== 'scheduled' ? (
          <section className="nonrevy-itinerary-card__identity" aria-label={`${summary.optionLabel} requested journey coverage`}>
            <div>
              <span>Requested journey</span>
              <strong>{expandedIdentity.requestedJourneyLabel}</strong>
              <small>{expandedIdentity.scheduleState}</small>
            </div>
            {expandedIdentity.unverifiedSummary ? (
              <div>
                <span>Unverified portion</span>
                <strong>{expandedIdentity.unverifiedSummary}</strong>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="nonrevy-itinerary-card__segments" aria-label={`${summary.optionLabel} ${expandedIdentity.verifiedSegmentLabel.toLowerCase()}`}>
          {card.resultClass !== 'scheduled' ? (
            <header className="nonrevy-itinerary-card__segments-head">
              <span>{expandedIdentity.verifiedSegmentLabel}</span>
              <p>{card.resultClass === 'partial'
                ? 'These are the provider-backed legs currently attached to this route idea.'
                : 'These are route concept legs only; operating flights and schedules have not been verified.'}</p>
            </header>
          ) : null}
          {card.segments.map((segment, index) => (
            <Fragment key={segment.key}>
              {index > 0 ? <Layover previous={card.segments[index - 1]} next={segment} /> : null}
              <SegmentCard segment={segment} />
            </Fragment>
          ))}
        </section>

        {publicPreview ? (
          <div className="nonrevy-itinerary-card__actions" aria-label={`${summary.optionLabel} locked traveler actions`}>
              <a href={verifyHref}>{t('verifyUnlockTravelerFeatures')}</a>
            <button type="button" onClick={() => promptVerification('Load requests')}>Request load</button>
            <button type="button" onClick={() => promptVerification('Saving and watching trips')}>Save / Watch</button>
          </div>
        ) : availability.canSave || availability.canWatch || availability.canRequestLoad ? (
          <div className="nonrevy-itinerary-card__actions" aria-label={`${summary.optionLabel} traveler actions`}>
            <button type="button" onClick={handleLoadRequest} disabled={!availability.canRequestLoad || loadRequestPending}>{loadRequestPending ? 'Requesting...' : 'Request load'}</button>
            {saved ? (
              <button type="button" onClick={handleUnsave}>Saved · remove</button>
            ) : (
              <button type="button" onClick={handleSave}>Save</button>
            )}
            <button type="button" onClick={handleWatch}>{watched ? 'Watching' : 'Watch'}</button>
            {loadRequested ? <Link href="/my-requests">My requests</Link> : null}
          </div>
        ) : (
          <p className="nonrevy-itinerary-card__action-note">{availability.reason}</p>
        )}

        {actionStatus ? <p className="nonrevy-itinerary-card__action-status" aria-live="polite">{actionStatus}</p> : null}

        <details className="nonrevy-route-details">
        <summary>Why this ranking?</summary>

        <dl className="nonrevy-route-details__snapshot">
          <div className="nonrevy-ranked-result-card__field"><span>Score</span><strong>{publicPreview ? 'Locked' : `${card.finalScore}/100`}</strong></div>
          <div className="nonrevy-ranked-result-card__field"><span>Confidence</span><strong>{publicPreview ? 'Locked' : `${card.confidence}/100`}</strong></div>
          <div className="nonrevy-ranked-result-card__field"><span>Data quality</span><strong>{card.dataQualityLevel}</strong></div>
          <div className="nonrevy-ranked-result-card__field"><span>ZED</span><strong>{publicPreview ? 'Locked' : expandedZedLabel(card)}</strong></div>
        </dl>

        <div className="nonrevy-route-details__grid">
          <RankingContext card={card} />
          <CompactList title="Strengths" items={card.strengths} />
          <CompactList title="Risks" items={uniqueDisplayItems([...card.weaknesses, ...card.risks, ...card.switchConditions])} />
          <CompactList title="Data quality" items={card.dataWarnings} />
          <CompactList title="Fallbacks" items={card.fallbacks} />
        </div>

        <details className="nonrevy-results-page__below">
          <summary>Unknown schedule and load indicators</summary>
          <ul>
            {card.unknownIndicators.map((indicator) => <li key={indicator}>{indicator}</li>)}
          </ul>
        </details>
        </details>
      </div>
    </details>
  )
}

function expandedZedLabel(card: SearchPlanCardViewModel) {
  if (card.zedEligibilityStatus === 'unknown') return 'ZED eligibility not confirmed'
  return card.zedEligibilityLabel
}

function uniqueDisplayItems(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
}

function visibleLegSummary(card: SearchPlanCardViewModel) {
  if (card.resultClass !== 'scheduled' || card.segments.length < 2) return ''
  return card.segments
    .map((segment) => `${segment.flightNumber}: ${segment.origin} -> ${segment.destination}`)
    .join(' · ')
}

function compactStopsSummary(card: SearchPlanCardViewModel, stopsLabel: string) {
  if (card.resultClass !== 'scheduled' || card.segments.length <= 1) return stopsLabel
  const viaAirports = card.segments.slice(0, -1).map((segment) => segment.destination).filter(Boolean)
  return viaAirports.length ? `${stopsLabel} via ${viaAirports.join('/')}` : stopsLabel
}

function AirlineCodeBadge({ code, name }: { code: string; name: string }) {
  return (
    <span
      className="nonrevy-itinerary-row__airline-code"
      data-airline-name={name}
      tabIndex={0}
      title={name}
      aria-label={`${code}: ${name}`}
    >
      {code}
    </span>
  )
}

function SegmentCard({ segment }: { segment: SearchSegmentViewModel }) {
  const scheduleWarning = segment.scheduleStatus === 'Schedule not yet verified' ? segment.scheduleStatus : ''
  return (
    <div className="nonrevy-itinerary-segment" role="group" aria-label={`${segment.origin} to ${segment.destination}`}>
      <div className="nonrevy-itinerary-segment__carrier">
        <AirlineCodeBadge code={segment.airlineCode} name={segment.airlineName} />
        <div>
          <strong>{segment.flightNumber}</strong>
          <span>{segment.airlineName}</span>
        </div>
      </div>

      <div className="nonrevy-itinerary-segment__timeline">
        <div className="nonrevy-itinerary-segment__endpoint">
          <strong>{segment.origin}</strong>
          <span>{segment.departureTime}</span>
          {segment.departureDate ? <small>{segment.departureDate}</small> : null}
        </div>
        <div className="nonrevy-itinerary-segment__path" aria-hidden="true">
          <span />
        </div>
        <div className="nonrevy-itinerary-segment__endpoint nonrevy-itinerary-segment__endpoint--arrival">
          <strong>{segment.destination}</strong>
          <span>{segment.arrivalTime}</span>
          {segment.arrivalDate ? <small>{segment.arrivalDate}</small> : null}
        </div>
      </div>

      <div className="nonrevy-itinerary-segment__meta">
        {segment.estimatedDuration ? <span>{segment.estimatedDuration}</span> : null}
        {scheduleWarning ? <span>{scheduleWarning}</span> : null}
        <span>{segment.loadStatus}</span>
        {segmentFootnote(segment) ? <span>{segmentFootnote(segment)}</span> : null}
      </div>
    </div>
  )
}

function Layover({ previous, next }: { previous: SearchSegmentViewModel; next: SearchSegmentViewModel }) {
  const label = layoverLabelBetweenSegments(previous, next)
  if (!label) return null
  return <div className="nonrevy-itinerary-layover">{label}</div>
}

function itineraryMetaChips(card: SearchPlanCardViewModel) {
  const endpointCodes = new Set(card.segments.flatMap((segment) => [segment.origin, segment.destination]).map((value) => value.toUpperCase()))
  const chips: string[] = []
  if (card.segments.length > 1) chips.push(`${card.segments.length} segments`)
  if (card.gateway && !endpointCodes.has(card.gateway.toUpperCase())) chips.push(card.gateway)
  if (card.destinationLabel && !endpointCodes.has(card.destinationLabel.toUpperCase()) && card.destinationLabel !== card.gateway) chips.push(card.destinationLabel)
  return chips
}

function segmentFootnote(segment: SearchSegmentViewModel) {
  if (segment.scheduleStatus === 'Schedule not yet verified') return 'Schedule not yet verified'
  return /^flight$/i.test(segment.transportType.trim()) ? '' : segment.transportType
}

function RankingContext({ card }: { card: SearchPlanCardViewModel }) {
  const details = uniqueDisplayItems([
    card.shortSummary,
    card.planningScoreNote,
    card.zedEligibilityAction ? `ZED: ${expandedZedLabel(card)}` : '',
    card.eligibleZedAirlinesLabel && card.eligibleZedAirlinesLabel !== 'None carrier-confirmed' ? `Eligible ZED airlines: ${card.eligibleZedAirlinesLabel}` : ''
  ])
  if (!details.length) return null
  return <CompactList title="Score" items={details} />
}

function CompactList({ title, items }: { title: string; items: string[] }) {
  const displayItems = uniqueDisplayItems(items)
  if (!displayItems.length) return null
  return (
    <section className="nonrevy-route-details__signal-card">
      <span>{title}</span>
      <ul>
        {displayItems.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  )
}
