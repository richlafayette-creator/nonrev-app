'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { supportedCarrierOptions } from '../../lib/carrierScope'
import {
  loadSavedSearches,
  markSavedSearchRun,
  removeSavedSearch,
  saveSavedSearch,
  savedSearchRunUrl,
  syncSavedSearches,
  type SavedSearch,
  type SavedSearchKind
} from '../../lib/savedSearches'

function formatDate(value?: string) {
  if (!value) return 'Never run'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function kindLabel(kind: SavedSearchKind) {
  return kind === 'ai-trip' ? 'AI trip prompt' : 'Route search'
}

export default function SavedSearchesPage() {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [kind, setKind] = useState<SavedSearchKind>('route-search')
  const [query, setQuery] = useState('LAX to HNL tomorrow')
  const [label, setLabel] = useState('')
  const [carrier, setCarrier] = useState('all')
  const [status, setStatus] = useState('Saved searches sync to your beta account when available, with local fallback.')

  function refreshSavedSearches() {
    setSavedSearches(loadSavedSearches())
  }

  useEffect(() => {
    refreshSavedSearches()
    void syncSavedSearches().then((result) => {
      setSavedSearches(result.searches)
      setStatus(result.storageMode === 'supabase' ? 'Saved searches synced to beta account.' : result.detail)
    })
    window.addEventListener('nonrevy-saved-searches-updated', refreshSavedSearches)
    window.addEventListener('storage', refreshSavedSearches)
    return () => {
      window.removeEventListener('nonrevy-saved-searches-updated', refreshSavedSearches)
      window.removeEventListener('storage', refreshSavedSearches)
    }
  }, [])

  const summary = useMemo(() => {
    const routeSearches = savedSearches.filter((search) => search.kind === 'route-search').length
    const aiTrips = savedSearches.filter((search) => search.kind === 'ai-trip').length
    const totalRuns = savedSearches.reduce((total, search) => total + search.runCount, 0)
    return { routeSearches, aiTrips, totalRuns }
  }, [savedSearches])

  function addSavedSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = saveSavedSearch({
      kind,
      query,
      carrier: kind === 'route-search' ? carrier : undefined,
      label
    })
    if (!saved) {
      setStatus('Add a route, flight number, or AI trip prompt before saving.')
      return
    }
    setSavedSearches(loadSavedSearches())
    setStatus(`Saved “${saved.label}”.`)
    setLabel('')
  }

  function runSearch(search: SavedSearch) {
    markSavedSearchRun(search.id)
    window.location.href = savedSearchRunUrl(search)
  }

  function deleteSearch(search: SavedSearch) {
    setSavedSearches(removeSavedSearch(search.id))
    setStatus(`Removed “${search.label}”.`)
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: 'var(--color-slate-950)', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: 'var(--color-sky-400)' }}>Home</a>
        <a href="/plan" style={{ marginRight: 16, color: 'var(--color-rose-400)' }}>Plan</a>
        <a href="/saved-searches" style={{ marginRight: 16, color: 'var(--color-sky-300)' }}>Saved Searches</a>
        <a href="/watchlist" style={{ marginRight: 16, color: 'var(--color-yellow-400)' }}>Watchlist</a>
        <a href="/alerts" style={{ color: 'var(--color-pink-400)' }}>Alerts</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: 'var(--color-sky-300)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Saved searches</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Rerun your frequent nonrev searches.</h1>
        <p style={{ color: 'var(--color-slate-400)', fontSize: 18, maxWidth: 820 }}>
          Save common routes, flight-number checks, and AI trip prompts so you can relaunch planning quickly. This is local-only browser storage and does not change provider APIs or backend behavior.
        </p>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {[
            { labelText: 'Saved Searches', value: savedSearches.length, color: 'var(--color-sky-300)' },
            { labelText: 'Route Searches', value: summary.routeSearches, color: 'var(--color-sky-400)' },
            { labelText: 'AI Trip Prompts', value: summary.aiTrips, color: 'var(--color-purple-400)' },
            { labelText: 'Total Reruns', value: summary.totalRuns, color: 'var(--color-green-500)' }
          ].map((metric) => (
            <article key={metric.labelText} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 18, padding: 18, background: 'var(--color-slate-850)' }}>
              <small style={{ color: 'var(--color-slate-400)' }}>{metric.labelText}</small>
              <h2 style={{ color: metric.color, margin: '6px 0 0' }}>{metric.value}</h2>
            </article>
          ))}
        </section>

        <section style={{ border: '1px solid var(--color-slate-700)', borderRadius: 22, padding: 20, background: 'var(--color-slate-850)', marginBottom: 22 }}>
          <h2 style={{ marginTop: 0 }}>Add a saved search</h2>
          <form onSubmit={addSavedSearch} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label style={{ color: 'var(--color-slate-300)' }}>
                Search type
                <select value={kind} onChange={(event) => setKind(event.target.value as SavedSearchKind)} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-700)', background: 'var(--color-slate-950)', color: 'white' }}>
                  <option value="route-search">Route search</option>
                  <option value="ai-trip">AI trip prompt</option>
                </select>
              </label>
              <label style={{ color: 'var(--color-slate-300)' }}>
                Optional label
                <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Morning Hawaii check" style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-700)', background: 'var(--color-slate-950)', color: 'white' }} />
              </label>
              {kind === 'route-search' ? (
                <label style={{ color: 'var(--color-slate-300)' }}>
                  Carrier scope
                  <select value={carrier} onChange={(event) => setCarrier(event.target.value)} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid var(--color-slate-700)', background: 'var(--color-slate-950)', color: 'white' }}>
                    {supportedCarrierOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <label style={{ color: 'var(--color-slate-300)' }}>
              {kind === 'ai-trip' ? 'AI trip prompt' : 'Route, airport pair, or flight number'}
              <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={3} placeholder={kind === 'ai-trip' ? 'best Maui option from LAX this weekend' : 'LAX to HNL tomorrow'} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 14, borderRadius: 16, border: '1px solid var(--color-slate-700)', background: 'var(--color-slate-950)', color: 'white' }} />
            </label>
            <button type="submit" style={{ justifySelf: 'start', padding: '13px 18px', borderRadius: 999, border: 'none', background: 'var(--color-sky-300)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
              Save search
            </button>
          </form>
          <p style={{ color: 'var(--color-sky-300)', marginBottom: 0 }}>{status}</p>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {savedSearches.length === 0 ? (
            <article style={{ border: '1px dashed var(--color-slate-600)', borderRadius: 20, padding: 22, background: 'var(--color-slate-850)' }}>
              <h2 style={{ marginTop: 0 }}>No saved searches yet</h2>
              <p style={{ color: 'var(--color-slate-300)' }}>Save a frequent route or AI prompt here, or use the save buttons on the home search.</p>
            </article>
          ) : null}
          {savedSearches.map((search) => (
            <article key={search.id} style={{ border: '1px solid var(--color-slate-700)', borderRadius: 20, padding: 18, background: 'var(--color-slate-850)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <small style={{ color: search.kind === 'ai-trip' ? 'var(--color-purple-400)' : 'var(--color-sky-300)', fontWeight: 'bold' }}>{kindLabel(search.kind)}</small>
                  <h2 style={{ margin: '6px 0', color: 'var(--color-slate-50)', fontSize: 22 }}>{search.label}</h2>
                </div>
                <span style={{ border: '1px solid var(--color-slate-700)', borderRadius: 999, padding: '5px 10px', color: 'var(--color-slate-300)', whiteSpace: 'nowrap' }}>{search.runCount} run{search.runCount === 1 ? '' : 's'}</span>
              </div>
              <p style={{ color: 'var(--color-slate-200)' }}>{search.query}</p>
              <dl style={{ display: 'grid', gap: 8, margin: '0 0 16px' }}>
                {search.carrier ? (
                  <div>
                    <dt style={{ color: 'var(--color-slate-400)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Carrier scope</dt>
                    <dd style={{ margin: '3px 0 0', color: 'var(--color-slate-200)' }}>{search.carrier}</dd>
                  </div>
                ) : null}
                <div>
                  <dt style={{ color: 'var(--color-slate-400)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Last run</dt>
                  <dd style={{ margin: '3px 0 0', color: 'var(--color-slate-200)' }}>{formatDate(search.lastRunAt)}</dd>
                </div>
              </dl>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => runSearch(search)} style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: 'var(--color-sky-400)', color: 'var(--color-slate-950)', fontWeight: 'bold' }}>
                  Run search
                </button>
                <button type="button" onClick={() => deleteSearch(search)} style={{ padding: '10px 14px', borderRadius: 999, border: '1px solid var(--color-rose-400)', background: 'var(--color-slate-950)', color: '#fda4af', fontWeight: 'bold' }}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  )
}
