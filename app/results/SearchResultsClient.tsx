'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { type BetaSearchStoredResult } from '../../lib/betaSearchClient'
import { buildSearchResultsViewModel, type SearchPlanCardViewModel } from './searchResultsViewModel'

const betaSearchResultStorageKey = 'nonrevy.betaSearchResult.v1'

type ResultsState =
  | { status: 'loading' }
  | { status: 'ready'; stored: BetaSearchStoredResult }
  | { status: 'missing' }
  | { status: 'malformed' }

export default function SearchResultsClient() {
  const [state, setState] = useState<ResultsState>({ status: 'loading' })

  useEffect(() => {
    try {
      const stored = readStoredBetaSearchResult()
      setState(stored ? { status: 'ready', stored } : { status: 'missing' })
    } catch {
      setState({ status: 'malformed' })
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
          <h1>{state.status === 'malformed' ? 'Stored result needs a new search' : viewModel.title}</h1>
          <p>{state.status === 'malformed' ? 'The saved beta search result could not be read safely.' : viewModel.subtitle}</p>
          <Link className="nonrevy-primary-action nonrevy-primary-action--search" href="/">Back to search</Link>
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
          <Link className="nonrevy-primary-action nonrevy-primary-action--search" href="/">New search</Link>
        </header>

        <section className="nonrevy-results-page__warning" aria-label="Search transparency">
          <h2>Search Transparency</h2>
          <p><strong>{viewModel.dataQualityLabel}</strong></p>
          <p>{viewModel.staticOnlyNotice}</p>
          <p><strong>Provider readiness:</strong> {viewModel.providerReadinessLabel}</p>
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
        </section>

        {!viewModel.cards.length ? (
          <section className="nonrevy-production-empty" aria-live="polite">
            <p className="nonrevy-production-empty__eyebrow">No viable plans</p>
            <h2>No ranked recommendation cards were returned.</h2>
            <p className="nonrevy-production-empty__subtext">Try a request with a three-letter origin airport, a departure date, and a destination airport or supported region.</p>
            <Link href="/">Back to search</Link>
          </section>
        ) : (
          <section aria-label="Ranked beta recommendations" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
            {viewModel.cards.map((card) => <PlanCard key={card.key} card={card} />)}
          </section>
        )}
      </section>
    </main>
  )
}

function readStoredBetaSearchResult(): BetaSearchStoredResult | null {
  const value = window.sessionStorage.getItem(betaSearchResultStorageKey)
  if (!value) return null
  const parsed = JSON.parse(value)
  if (!parsed || parsed.version !== 1 || !parsed.result || !parsed.request) return null
  return parsed as BetaSearchStoredResult
}

function PlanCard({ card }: { card: SearchPlanCardViewModel }) {
  return (
    <article className="nonrevy-ranked-result-card" aria-labelledby={`${card.key}-heading`}>
      <header>
        <p className="nonrevy-production-empty__eyebrow">Rank {card.rank} · {card.status}</p>
        <h2 id={`${card.key}-heading`}>{card.label}</h2>
        <p>{card.destinationContext}</p>
      </header>

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <div className="nonrevy-ranked-result-card__field"><span>Gateway</span><strong>{card.gateway}</strong></div>
        <div className="nonrevy-ranked-result-card__field"><span>Destination</span><strong>{card.destinationLabel}</strong></div>
        <div className="nonrevy-ranked-result-card__field"><span>Final score</span><strong>{card.finalScore}/100</strong></div>
        <div className="nonrevy-ranked-result-card__field"><span>Confidence</span><strong>{card.confidence}/100</strong></div>
        <div className="nonrevy-ranked-result-card__field"><span>Planning success score</span><strong>{card.planningSuccessScore}/100</strong></div>
        <div className="nonrevy-ranked-result-card__field"><span>ZED</span><strong>{card.wholePartyZedLabel}</strong></div>
      </dl>
      <p>{card.planningScoreNote}</p>
      <p><strong>Eligible ZED airlines:</strong> {card.eligibleZedAirlinesLabel} · <Link href="/profile">Review ZED agreements</Link></p>
      <p>{card.shortSummary}</p>

      <CompactList title="Strengths" items={card.strengths} empty="No strengths were returned." />
      <CompactList title="Weaknesses" items={card.weaknesses} empty="No weaknesses were returned." />
      <CompactList title="Risks" items={card.risks} empty="No risks were returned." />
      <CompactList title="Switch conditions" items={card.switchConditions} empty="No switch conditions were returned." />
      <CompactList title="Fallbacks" items={card.fallbacks} empty="No fallbacks were returned." />
      <CompactList title="Data warnings" items={card.dataWarnings} empty="No data warnings were returned." />

      <section>
        <h3>Segments</h3>
        <p><strong>Transport modes:</strong> {card.transportModes.join(', ') || 'Not specified'}</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {card.segments.map((segment) => (
            <article key={segment.key} className="nonrevy-flight-board-row__leg-detail">
              <strong>{segment.origin} to {segment.destination}</strong>
              <p>{segment.transportType} · {segment.carrierLabel}</p>
              <p>{segment.scheduleStatus} · {segment.loadStatus}</p>
              {segment.notes.length ? <p>{segment.notes.join(' ')}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <details className="nonrevy-results-page__below">
        <summary>Unknown schedule and load indicators</summary>
        <ul>
          {card.unknownIndicators.map((indicator) => <li key={indicator}>{indicator}</li>)}
        </ul>
      </details>
    </article>
  )
}

function CompactList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : <p>{empty}</p>}
    </section>
  )
}
