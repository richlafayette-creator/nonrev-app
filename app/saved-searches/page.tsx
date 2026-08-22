'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { supportedCarrierOptions } from '../../lib/carrierScope'
import {
  loadSavedSearches,
  markSavedSearchRun,
  removeSavedSearch,
  renameSavedSearch,
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
  const [status, setStatus] = useState('Saved searches are stored in your beta account when available. This browser keeps a backup if account saving is unavailable.')
  const [editingId, setEditingId] = useState('')
  const [editingLabel, setEditingLabel] = useState('')

  function refreshSavedSearches() {
    setSavedSearches(loadSavedSearches())
  }

  useEffect(() => {
    refreshSavedSearches()
    void syncSavedSearches().then((result) => {
      setSavedSearches(result.searches)
      setStatus(result.storageMode === 'supabase' ? 'Saved searches are stored in your beta account.' : 'Saved searches are available in this browser until account saving is available again.')
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

  function startRename(search: SavedSearch) {
    setEditingId(search.id)
    setEditingLabel(search.label)
  }

  function saveRename(search: SavedSearch) {
    const searches = renameSavedSearch(search.id, editingLabel)
    setSavedSearches(searches)
    setStatus(`Renamed saved search to “${editingLabel.trim() || search.label}”.`)
    setEditingId('')
    setEditingLabel('')
  }

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#020617', color: 'white', padding: 40, fontFamily: 'Arial' }}>
      <nav className="top-nav" style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Search</a>
        <a href="/saved-searches" style={{ marginRight: 16, color: '#67e8f9' }}>Saved</a>
        <a href="/watchlist" style={{ marginRight: 16, color: '#facc15' }}>Watchlist</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/beta-feedback" style={{ color: '#c084fc' }}>Feedback</a>
      </nav>

      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ color: '#67e8f9', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Saved searches</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Rerun your frequent nonrev searches.</h1>
        <p style={{ color: '#94a3b8', fontSize: 18, maxWidth: 820 }}>
          Save common routes, flight-number checks, and trip prompts so you can relaunch planning quickly. Your beta account keeps them available across sessions when account saving is available.
        </p>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '24px 0' }}>
          {[
            { labelText: 'Saved Searches', value: savedSearches.length, color: '#67e8f9' },
            { labelText: 'Route Searches', value: summary.routeSearches, color: '#38bdf8' },
            { labelText: 'AI Trip Prompts', value: summary.aiTrips, color: '#c084fc' },
            { labelText: 'Total Reruns', value: summary.totalRuns, color: '#22c55e' }
          ].map((metric) => (
            <article key={metric.labelText} style={{ border: '1px solid #334155', borderRadius: 18, padding: 18, background: '#0f172a' }}>
              <small style={{ color: '#94a3b8' }}>{metric.labelText}</small>
              <h2 style={{ color: metric.color, margin: '6px 0 0' }}>{metric.value}</h2>
            </article>
          ))}
        </section>

        <section style={{ border: '1px solid #334155', borderRadius: 22, padding: 20, background: '#0f172a', marginBottom: 22 }}>
          <h2 style={{ marginTop: 0 }}>Add a saved search</h2>
          <form onSubmit={addSavedSearch} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label style={{ color: '#cbd5e1' }}>
                Search type
                <select value={kind} onChange={(event) => setKind(event.target.value as SavedSearchKind)} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #334155', background: '#020617', color: 'white' }}>
                  <option value="route-search">Route search</option>
                  <option value="ai-trip">AI trip prompt</option>
                </select>
              </label>
              <label style={{ color: '#cbd5e1' }}>
                Optional label
                <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Morning Hawaii check" style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #334155', background: '#020617', color: 'white' }} />
              </label>
              {kind === 'route-search' ? (
                <label style={{ color: '#cbd5e1' }}>
                  Carrier scope
                  <select value={carrier} onChange={(event) => setCarrier(event.target.value)} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 12, borderRadius: 12, border: '1px solid #334155', background: '#020617', color: 'white' }}>
                    {supportedCarrierOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <label style={{ color: '#cbd5e1' }}>
              {kind === 'ai-trip' ? 'AI trip prompt' : 'Route, airport pair, or flight number'}
              <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={3} placeholder={kind === 'ai-trip' ? 'best Maui option from LAX this weekend' : 'LAX to HNL tomorrow'} style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 14, borderRadius: 16, border: '1px solid #334155', background: '#020617', color: 'white' }} />
            </label>
            <button type="submit" style={{ justifySelf: 'start', padding: '13px 18px', borderRadius: 999, border: 'none', background: '#67e8f9', color: '#020617', fontWeight: 'bold' }}>
              Save search
            </button>
          </form>
          <p style={{ color: '#67e8f9', marginBottom: 0 }}>{status}</p>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {savedSearches.length === 0 ? (
            <article style={{ border: '1px dashed #475569', borderRadius: 20, padding: 22, background: '#0f172a' }}>
              <h2 style={{ marginTop: 0 }}>No saved searches yet</h2>
              <p style={{ color: '#cbd5e1' }}>Save a frequent route here, or run a search and save the itinerary that looks useful.</p>
              <a href="/" style={{ color: '#38bdf8', fontWeight: 'bold' }}>Start a search</a>
            </article>
          ) : null}
          {savedSearches.map((search) => (
            <article key={search.id} style={{ border: '1px solid #334155', borderRadius: 20, padding: 18, background: '#0f172a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <small style={{ color: search.kind === 'ai-trip' ? '#c084fc' : '#67e8f9', fontWeight: 'bold' }}>{kindLabel(search.kind)}</small>
                  {editingId === search.id ? (
                    <input
                      value={editingLabel}
                      onChange={(event) => setEditingLabel(event.target.value)}
                      aria-label={`Rename ${search.label}`}
                      style={{ display: 'block', boxSizing: 'border-box', width: '100%', marginTop: 6, padding: 10, borderRadius: 12, border: '1px solid #334155', background: '#020617', color: 'white', fontWeight: 'bold' }}
                    />
                  ) : (
                    <h2 style={{ margin: '6px 0', color: '#f8fafc', fontSize: 22 }}>{search.label}</h2>
                  )}
                </div>
                <span style={{ border: '1px solid #334155', borderRadius: 999, padding: '5px 10px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>{search.runCount} run{search.runCount === 1 ? '' : 's'}</span>
              </div>
              <p style={{ color: '#e2e8f0' }}>{search.query}</p>
              <dl style={{ display: 'grid', gap: 8, margin: '0 0 16px' }}>
                {search.carrier ? (
                  <div>
                    <dt style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Carrier scope</dt>
                    <dd style={{ margin: '3px 0 0', color: '#e2e8f0' }}>{search.carrier}</dd>
                  </div>
                ) : null}
                <div>
                  <dt style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Last run</dt>
                  <dd style={{ margin: '3px 0 0', color: '#e2e8f0' }}>{formatDate(search.lastRunAt)}</dd>
                </div>
              </dl>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => runSearch(search)} style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#38bdf8', color: '#020617', fontWeight: 'bold' }}>
                  Run search
                </button>
                {editingId === search.id ? (
                  <>
                    <button type="button" onClick={() => saveRename(search)} style={{ padding: '10px 14px', borderRadius: 999, border: 'none', background: '#22c55e', color: '#052e16', fontWeight: 'bold' }}>
                      Save rename
                    </button>
                    <button type="button" onClick={() => setEditingId('')} style={{ padding: '10px 14px', borderRadius: 999, border: '1px solid #475569', background: '#020617', color: '#cbd5e1', fontWeight: 'bold' }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => startRename(search)} style={{ padding: '10px 14px', borderRadius: 999, border: '1px solid #67e8f9', background: '#020617', color: '#67e8f9', fontWeight: 'bold' }}>
                    Rename
                  </button>
                )}
                <button type="button" onClick={() => deleteSearch(search)} style={{ padding: '10px 14px', borderRadius: 999, border: '1px solid #fb7185', background: '#020617', color: '#fda4af', fontWeight: 'bold' }}>
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
