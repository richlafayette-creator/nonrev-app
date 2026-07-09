import { execSync } from 'node:child_process'
import packageJson from '../../package.json'

export const dynamic = 'force-dynamic'

type DiagnosticRow = { label: string; value: string; detail?: string }

function safeGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unavailable'
  }
}

function configured(key: string) {
  return process.env[key] ? 'configured' : 'not configured'
}

function providerRows(): DiagnosticRow[] {
  return [
    { label: 'FlightAware', value: configured('FLIGHTAWARE_API_KEY'), detail: 'Primary live itinerary provider when credentials and server access are available.' },
    { label: 'Aviationstack', value: configured('AVIATIONSTACK_API_KEY'), detail: 'Fallback schedule provider; absence should degrade gracefully.' },
    { label: 'Supabase URL', value: configured('NEXT_PUBLIC_SUPABASE_URL'), detail: 'Stored schedules, local beta persistence, and data-health scaffolds depend on this configuration.' },
    { label: 'Supabase anon key', value: configured('NEXT_PUBLIC_SUPABASE_ANON_KEY'), detail: 'Client read access presence only; secret values are never displayed.' }
  ]
}

function freshnessRows(): DiagnosticRow[] {
  return [
    { label: 'Live itinerary freshness', value: process.env.FLIGHTAWARE_API_KEY ? 'provider eligible' : 'fallback/unknown', detail: 'Route results still show trust receipts and warnings when provider rows are unavailable.' },
    { label: 'Stored schedule freshness', value: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'store configured' : 'store missing', detail: 'Stored Supabase rows are used only when available and freshness-labelled.' },
    { label: 'Weather freshness', value: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'cache eligible' : 'local placeholder', detail: 'Weather risk remains advisory and should not imply confirmed loads.' }
  ]
}

function featureFlagRows(): DiagnosticRow[] {
  return [
    'NONREVY_TEST_DATA_MODE',
    'NEXT_PUBLIC_NONREVY_DEMO_MODE',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_MAPBOX_TOKEN',
    'FLIGHTAWARE_API_KEY',
    'AVIATIONSTACK_API_KEY'
  ].map((key) => ({ label: key, value: configured(key) }))
}

export default function DiagnosticsPage() {
  const buildRows: DiagnosticRow[] = [
    { label: 'Build version', value: packageJson.version || '0.0.0' },
    { label: 'Current git commit', value: safeGitCommit() },
    { label: 'Environment', value: process.env.VERCEL_ENV || process.env.NODE_ENV || 'local' },
    { label: 'Runtime', value: 'Next.js server diagnostics page' }
  ]

  const renderRows = (rows: DiagnosticRow[]) => rows.map((row) => (
    <article key={`${row.label}-${row.value}`} style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 14, background: '#ffffff' }}>
      <span style={{ display: 'block', color: '#6b7280', fontSize: 12, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase' }}>{row.label}</span>
      <strong style={{ display: 'block', color: '#111827', marginTop: 5, overflowWrap: 'anywhere' }}>{row.value}</strong>
      {row.detail ? <p style={{ color: '#4B5563', margin: '6px 0 0', lineHeight: 1.45 }}>{row.detail}</p> : null}
    </article>
  ))

  return (
    <main className="app-shell" style={{ minHeight: '100vh', background: '#fbfcff', color: '#111827', padding: 40, fontFamily: 'Arial' }}>
      <section style={{ maxWidth: 1040, margin: '0 auto' }}>
        <p style={{ color: '#4f46e5', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Hidden developer mode</p>
        <h1 style={{ fontSize: 44, margin: '8px 0 12px' }}>Nonrevy diagnostics</h1>
        <p style={{ color: '#4B5563', fontSize: 18, maxWidth: 780, lineHeight: 1.55 }}>
          Lightweight MVP diagnostics for provider configuration, data freshness checks, build identity, runtime environment, and feature flags. Values are configuration presence only; secrets are never printed.
        </p>

        {[
          ['Build', buildRows],
          ['Provider status', providerRows()],
          ['Data freshness', freshnessRows()],
          ['Feature flags', featureFlagRows()]
        ].map(([title, rows]) => (
          <section key={String(title)} style={{ marginTop: 22 }}>
            <h2 style={{ color: '#111827' }}>{String(title)}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {renderRows(rows as DiagnosticRow[])}
            </div>
          </section>
        ))}
      </section>
    </main>
  )
}
