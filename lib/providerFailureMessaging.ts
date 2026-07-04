export type ProviderFailureKind = 'unavailable' | 'rate-limited' | 'partial' | 'stale'

export function providerFailureMessage(provider: string, kind: ProviderFailureKind, detail = '') {
  const safeDetail = detail.trim().replace(/\b(api[_-]?key|token|secret|password)=([^\s&]+)/gi, '$1=[redacted]')
  const suffix = safeDetail ? ` ${safeDetail}` : ''
  if (kind === 'rate-limited') return `${provider} rate or quota limit reached; live availability is unavailable right now.${suffix}`
  if (kind === 'partial') return `${provider} returned partial coverage; missing legs are not filled with fabricated availability.${suffix}`
  if (kind === 'stale') return `${provider} data is stale; use it only as stored/cached route context, not current live availability.${suffix}`
  return `${provider} unavailable; live availability could not be confirmed.${suffix}`
}

export function providerFailureKindFromStatus(status?: number, message = ''): ProviderFailureKind {
  const lower = message.toLowerCase()
  if (status === 429 || /rate limit|usage limit|quota|monthly/.test(lower)) return 'rate-limited'
  if (/partial|incomplete|some legs|missing legs/.test(lower)) return 'partial'
  if (/stale|cached|historical|older/.test(lower)) return 'stale'
  return 'unavailable'
}

export function providerFailureMessageFromStatus(provider: string, status?: number, message = '') {
  return providerFailureMessage(provider, providerFailureKindFromStatus(status, message), message)
}
