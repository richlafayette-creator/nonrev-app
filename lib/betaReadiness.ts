export const betaReadinessDashboardFeatureFlag = 'NONREV_BETA_READINESS_DASHBOARD_ENABLED' as const

export type BetaReadinessStatus = 'ready' | 'warning' | 'unavailable'
export type BetaReadinessComponentName =
  | 'Provider Health'
  | 'Historical Reliability'
  | 'Airport Intelligence'
  | 'Commercial Availability'
  | 'Weather'
  | 'Recovery Engine v2'
  | 'Standby Confidence'
  | 'Planner Signal Attribution'
  | 'Smoke Tests'
  | 'i18n foundation'

export type BetaReadinessProviderSummary = {
  component: BetaReadinessComponentName
  provider: string
  status: BetaReadinessStatus
  summary: string
}

export type BetaReadinessCacheSummary = {
  component: BetaReadinessComponentName
  status: BetaReadinessStatus
  summary: string
  cacheAgeMinutes: number | null
  stale: boolean
}

export type BetaReadinessDiagnosticsSummary = {
  component: BetaReadinessComponentName
  status: BetaReadinessStatus
  summary: string
  diagnosticsOnly: true
  missingNeutral: true
}

export type BetaReadinessComponentInput = {
  status?: string | boolean | null
  enabled?: boolean | null
  available?: boolean | null
  ready?: boolean | null
  providerName?: string | null
  provider?: string | null
  providers?: unknown[] | null
  summary?: string | null
  diagnostics?: unknown[] | string[] | null
  cacheStatus?: string | null
  cacheAgeMinutes?: number | null
  stale?: boolean | null
  missing?: boolean | null
  lastUpdated?: string | null
  metadata?: Record<string, unknown>
  value?: unknown
}

export type BetaReadinessSmokeTestInput = {
  name: string
  status: 'pass' | 'warning' | 'fail' | 'skip'
  summary?: string
}

export type BetaReadinessI18nInput = {
  defaultLocale?: string | null
  locales?: string[] | readonly string[] | null
  messageCatalogsPresent?: boolean | null
  status?: string | null
  summary?: string | null
}

export type BetaReadinessInput = {
  providerHealth?: unknown
  historicalReliability?: unknown
  airportIntelligence?: unknown
  commercialAvailability?: unknown
  weather?: unknown
  recoveryEngineV2?: unknown
  standbyConfidence?: unknown
  plannerSignalAttribution?: unknown
  smokeTests?: BetaReadinessSmokeTestInput[] | unknown
  i18n?: BetaReadinessI18nInput | unknown
  now?: Date
  env?: Record<string, string | undefined>
}

export type BetaReadiness = {
  enabled: true
  featureFlagEnvVar: typeof betaReadinessDashboardFeatureFlag
  generatedAt: string
  overallStatus: BetaReadinessStatus
  ready: BetaReadinessComponentName[]
  warning: BetaReadinessComponentName[]
  unavailable: BetaReadinessComponentName[]
  missingComponents: BetaReadinessComponentName[]
  providerSummaries: BetaReadinessProviderSummary[]
  cacheSummaries: BetaReadinessCacheSummary[]
  diagnosticsSummaries: BetaReadinessDiagnosticsSummary[]
  diagnosticsOnly: true
  advisoryOnly: true
  noItineraryGenerationChange: true
  noRankingChange: true
  noScoringChange: true
  noPlannerBehaviorChange: true
  noUiChange: true
  noApiContractChange: true
  noAdvisoryWordingChange: true
  neverExposeSecrets: true
  limitations: string[]
}

const componentNames: BetaReadinessComponentName[] = [
  'Provider Health',
  'Historical Reliability',
  'Airport Intelligence',
  'Commercial Availability',
  'Weather',
  'Recovery Engine v2',
  'Standby Confidence',
  'Planner Signal Attribution',
  'Smoke Tests',
  'i18n foundation'
]

const limitations = [
  'Beta readiness is diagnostics-only and does not change itinerary generation, ranking, scoring, planner behavior, UI, API contracts, or advisory wording.',
  'Ready means diagnostics inputs appear configured enough for private-beta review; it does not confirm live flight, standby, seat, booking, recovery, hotel, ground transport, or operational availability.',
  'Missing, disabled, unavailable, stale, failed, skipped, and unknown components remain neutral.',
  'Secrets, credential-like values, provider tokens, internal paths, and stack details are redacted from summaries.'
]

function featureEnabled(env: Record<string, string | undefined>) {
  const value = String(env[betaReadinessDashboardFeatureFlag] || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function sanitizeText(value: string, env: Record<string, string | undefined>) {
  let sanitized = value
  for (const secret of Object.values(env)) {
    if (secret?.trim()) sanitized = sanitized.split(secret).join('[redacted]')
  }
  return sanitized
    .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, '$1[redacted]')
    .replace(/([?&](?:api_?key|token|access_token)=)[^\s&]+/gi, '$1[redacted]')
    .replace(/\b(?:sk|pk|key|token)_[a-z0-9_\-]{8,}\b/gi, '[redacted]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g, '[redacted]')
    .replace(/\b[A-Za-z]:?\/?(?:root|home|Users|workspace|app|lib|src)\/[\w./-]+\b/g, '[internal]')
    .replace(/\b(?:lib|app|src)\/[\w./-]+\.(?:ts|tsx|js|jsx)(?::\d+(?::\d+)?)?/g, '[internal]')
    .replace(/\bat\s+[\w.$<>]+\s+\([^)]*\)/g, 'at [internal]')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function num(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null
}

function statusFrom(value: unknown): BetaReadinessStatus | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (['ready', 'healthy', 'available', 'present', 'pass', 'passed', 'success', 'enabled', 'fresh', 'configured', 'server-refresh-ready', 'cache-read-ready', 'advisory'].includes(normalized)) return 'ready'
  if (['warning', 'warn', 'degraded', 'partial', 'stale', 'limited', 'mixed', 'unknown', 'needs-load', 'cache-missing', 'credential-missing', 'manual-source-ready'].includes(normalized)) return 'warning'
  if (['unavailable', 'disabled', 'feature-disabled', 'failed', 'fail', 'failure', 'error', 'timeout', 'expired', 'missing', 'not-implemented', 'credential-missing'].includes(normalized)) return 'unavailable'
  return null
}

function worse(a: BetaReadinessStatus, b: BetaReadinessStatus): BetaReadinessStatus {
  const rank: Record<BetaReadinessStatus, number> = { ready: 0, warning: 1, unavailable: 2 }
  return rank[b] > rank[a] ? b : a
}

function statusForComponent(value: unknown): BetaReadinessStatus {
  if (value === undefined || value === null) return 'unavailable'
  if (Array.isArray(value)) return value.length ? 'ready' : 'unavailable'
  const record = asRecord(value)
  if (!record) return 'warning'
  if (record.enabled === false || record.available === false || record.missing === true) return 'unavailable'
  if (record.ready === true || record.available === true) return 'ready'
  const direct = statusFrom(record.overallStatus) ?? statusFrom(record.status) ?? statusFrom(record.readinessLevel)
  if (direct) return direct
  const summaryRecord = asRecord(record.summary)
  const summaryStatus = statusFrom(summaryRecord?.overallStatus) ?? statusFrom(summaryRecord?.status)
  if (summaryStatus) return summaryStatus
  if (Array.isArray(record.providers)) return record.providers.length ? 'warning' : 'unavailable'
  if (Array.isArray(record.sources)) return record.sources.length ? 'warning' : 'unavailable'
  if (Array.isArray(record.gates)) return record.gates.length ? 'warning' : 'unavailable'
  return 'warning'
}

function providerNameFrom(value: unknown, fallback: string) {
  const record = asRecord(value)
  return text(record?.provider) ?? text(record?.providerName) ?? text(record?.source) ?? text(record?.name) ?? fallback
}

function providerStatusFrom(value: unknown, fallback: BetaReadinessStatus) {
  const record = asRecord(value)
  if (!record) return fallback
  if (record.enabled === false || record.available === false) return 'unavailable'
  return statusFrom(record.status) ?? statusFrom(record.health) ?? statusFrom(record.availability) ?? fallback
}

function providerSummaryFrom(component: BetaReadinessComponentName, value: unknown, componentStatus: BetaReadinessStatus, env: Record<string, string | undefined>): BetaReadinessProviderSummary[] {
  const record = asRecord(value)
  const nested = record?.providers ?? record?.sources ?? record?.gates
  const providers = Array.isArray(nested) && nested.length ? nested : [value]
  return providers.map((provider, index) => {
    const providerRecord = asRecord(provider)
    const providerName = sanitizeText(providerNameFrom(provider, component), env)
    const status = providerStatusFrom(provider, componentStatus)
    const summary = text(providerRecord?.summary)
      ?? text(providerRecord?.diagnostic)
      ?? text(providerRecord?.message)
      ?? `${providerName} readiness is ${status}.`
    return {
      component,
      provider: providerName || `${component} provider ${index + 1}`,
      status,
      summary: sanitizeText(summary, env)
    }
  })
}

function cacheSummaryFrom(component: BetaReadinessComponentName, value: unknown, componentStatus: BetaReadinessStatus, env: Record<string, string | undefined>): BetaReadinessCacheSummary {
  const record = asRecord(value)
  const summaryRecord = asRecord(record?.summary)
  const cacheRecord = asRecord(record?.cache) ?? asRecord(record?.dataFreshness)
  const cacheStatus = text(record?.cacheStatus) ?? text(cacheRecord?.status) ?? text(summaryRecord?.cacheStatus)
  const status = statusFrom(cacheStatus) ?? componentStatus
  const age = num(record?.cacheAgeMinutes) ?? num(cacheRecord?.ageMinutes) ?? num(summaryRecord?.cacheAgeMinutes) ?? num(cacheRecord?.maxAgeMinutes)
  const stale = record?.stale === true || cacheStatus === 'stale' || cacheStatus === 'expired' || status === 'warning'
  const summary = cacheStatus
    ? `${component} cache status is ${cacheStatus}${age === null ? '' : ` at ${age} minute(s) old`}.`
    : `${component} cache state was not supplied; neutral diagnostics apply.`
  return { component, status, summary: sanitizeText(summary, env), cacheAgeMinutes: age, stale }
}

function diagnosticSummaryFrom(component: BetaReadinessComponentName, value: unknown, componentStatus: BetaReadinessStatus, env: Record<string, string | undefined>): BetaReadinessDiagnosticsSummary {
  const record = asRecord(value)
  const diagnostics = Array.isArray(record?.diagnostics) ? record.diagnostics : []
  const explicitSummary = text(record?.summary)
  const summary = explicitSummary
    ?? (diagnostics.length ? `${component} supplied ${diagnostics.length} diagnostic item(s).` : `${component} diagnostics are ${componentStatus}.`)
  return {
    component,
    status: componentStatus,
    summary: sanitizeText(summary, env),
    diagnosticsOnly: true,
    missingNeutral: true
  }
}

function smokeStatus(value: unknown): BetaReadinessStatus {
  if (!Array.isArray(value)) return 'unavailable'
  if (!value.length) return 'unavailable'
  return value.reduce<BetaReadinessStatus>((status, item) => worse(status, statusFrom(asRecord(item)?.status) ?? 'warning'), 'ready')
}

function i18nStatus(value: unknown): BetaReadinessStatus {
  const record = asRecord(value)
  if (!record) return 'unavailable'
  const direct = statusFrom(record.status)
  if (direct) return direct
  const locales = Array.isArray(record.locales) ? record.locales : []
  if (record.messageCatalogsPresent === false) return 'unavailable'
  if (text(record.defaultLocale) && locales.length >= 1) return locales.length >= 2 ? 'ready' : 'warning'
  return 'unavailable'
}

function componentValue(input: BetaReadinessInput, component: BetaReadinessComponentName): unknown {
  switch (component) {
    case 'Provider Health': return input.providerHealth
    case 'Historical Reliability': return input.historicalReliability
    case 'Airport Intelligence': return input.airportIntelligence
    case 'Commercial Availability': return input.commercialAvailability
    case 'Weather': return input.weather
    case 'Recovery Engine v2': return input.recoveryEngineV2
    case 'Standby Confidence': return input.standbyConfidence
    case 'Planner Signal Attribution': return input.plannerSignalAttribution
    case 'Smoke Tests': return input.smokeTests
    case 'i18n foundation': return input.i18n
  }
}

function componentStatus(input: BetaReadinessInput, component: BetaReadinessComponentName): BetaReadinessStatus {
  if (component === 'Smoke Tests') return smokeStatus(input.smokeTests)
  if (component === 'i18n foundation') return i18nStatus(input.i18n)
  return statusForComponent(componentValue(input, component))
}

export function buildBetaReadiness(input: BetaReadinessInput = {}): BetaReadiness | undefined {
  const env = input.env || process.env
  if (!featureEnabled(env)) return undefined
  const generatedAt = (input.now || new Date()).toISOString()
  const statuses = new Map(componentNames.map((component) => [component, componentStatus(input, component)] as const))
  const ready = componentNames.filter((component) => statuses.get(component) === 'ready')
  const warning = componentNames.filter((component) => statuses.get(component) === 'warning')
  const unavailable = componentNames.filter((component) => statuses.get(component) === 'unavailable')
  const missingComponents = componentNames.filter((component) => componentValue(input, component) === undefined || componentValue(input, component) === null)
  const overallStatus: BetaReadinessStatus = unavailable.length ? 'unavailable' : warning.length ? 'warning' : 'ready'

  const providerSummaries = componentNames.flatMap((component) => providerSummaryFrom(component, componentValue(input, component), statuses.get(component) || 'unavailable', env))
  const cacheSummaries = componentNames.map((component) => cacheSummaryFrom(component, componentValue(input, component), statuses.get(component) || 'unavailable', env))
  const diagnosticsSummaries = componentNames.map((component) => diagnosticSummaryFrom(component, componentValue(input, component), statuses.get(component) || 'unavailable', env))

  return {
    enabled: true,
    featureFlagEnvVar: betaReadinessDashboardFeatureFlag,
    generatedAt,
    overallStatus,
    ready,
    warning,
    unavailable,
    missingComponents,
    providerSummaries,
    cacheSummaries,
    diagnosticsSummaries,
    diagnosticsOnly: true,
    advisoryOnly: true,
    noItineraryGenerationChange: true,
    noRankingChange: true,
    noScoringChange: true,
    noPlannerBehaviorChange: true,
    noUiChange: true,
    noApiContractChange: true,
    noAdvisoryWordingChange: true,
    neverExposeSecrets: true,
    limitations: limitations.map((limitation) => sanitizeText(limitation, env))
  }
}
