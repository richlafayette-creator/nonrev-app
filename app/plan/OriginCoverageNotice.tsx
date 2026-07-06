export type OriginCoverageRecommendation = {
  code: string
  name: string
  distanceMiles?: number
  searchQuery?: string
  reason: string
}

export type OriginCoverageDiagnostic = {
  status: 'sufficient' | 'insufficient' | 'unknown'
  origin?: string
  destination?: string
  providerOriginRowCount: number
  frameworkRouteCount: number
  message: string
  recommendations: OriginCoverageRecommendation[]
  limitations: string[]
}

export function travelerSearchUrl(query: string) {
  return `/results?q=${encodeURIComponent(query)}`
}

export function OriginCoverageNotice({ coverage }: { coverage?: OriginCoverageDiagnostic }) {
  if (!coverage || coverage.status !== 'insufficient') return null
  return (
    <section className="nonrevy-production-empty" aria-live="polite" style={{ marginBottom: 16 }}>
      <p className="nonrevy-production-empty__eyebrow">Origin coverage</p>
      <h2>Provider coverage is limited from {coverage.origin || 'this origin'}.</h2>
      <p className="nonrevy-production-empty__subtext">{coverage.message}</p>
      {coverage.recommendations.length ? (
        <div className="nonrevy-production-empty__grid">
          <section>
            <strong>Nearest supported airports to try</strong>
            <ul className="nonrevy-production-empty__suggestions">
              {coverage.recommendations.map((airport) => (
                <li key={airport.code}>
                  {airport.searchQuery ? <a href={travelerSearchUrl(airport.searchQuery)}>{airport.code}{airport.distanceMiles !== undefined ? ` · ${airport.distanceMiles} mi` : ''}</a> : <span>{airport.code}</span>}
                  <span>{airport.name}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <strong>Important guardrail</strong>
            <p className="nonrevy-production-empty__muted">These are alternate search origins only. Nonrevy is not fabricating flights from {coverage.origin || 'the requested origin'} and is not claiming standby availability.</p>
          </section>
        </div>
      ) : null}
    </section>
  )
}
