export const betaFeedbackStorageKey = 'nonrevy.betaFeedback'

export type BetaFeedbackCategory = 'Wrong result' | 'Confusing UI' | 'Missing feature' | 'Bug' | 'Praise' | 'Other'
export type BetaFeedbackSentiment = 'Positive' | 'Neutral' | 'Blocked'
export type BetaFeedbackStatus = 'new' | 'reviewed'

export type BetaFeedbackRecord = {
  id: string
  category: BetaFeedbackCategory
  sentiment: BetaFeedbackSentiment
  message: string
  contact: string
  pageUrl: string
  createdAt: string
  status: BetaFeedbackStatus
}

export type BetaFeedbackDraft = {
  category: BetaFeedbackCategory
  sentiment: BetaFeedbackSentiment
  message: string
  contact?: string
  pageUrl?: string
}

export const betaFeedbackCategories: BetaFeedbackCategory[] = ['Wrong result', 'Confusing UI', 'Missing feature', 'Bug', 'Praise', 'Other']
export const betaFeedbackSentiments: BetaFeedbackSentiment[] = ['Positive', 'Neutral', 'Blocked']

function isBrowser() {
  return typeof window !== 'undefined'
}

function nowIso() {
  return new Date().toISOString()
}

function feedbackId() {
  const random = Math.random().toString(36).slice(2, 8)
  return `beta-feedback-${Date.now()}-${random}`
}

function normalizeFeedback(value: Partial<BetaFeedbackRecord> | null | undefined): BetaFeedbackRecord | null {
  if (!value?.message || typeof value.message !== 'string') return null
  return {
    id: value.id || feedbackId(),
    category: betaFeedbackCategories.includes(value.category as BetaFeedbackCategory) ? value.category as BetaFeedbackCategory : 'Other',
    sentiment: betaFeedbackSentiments.includes(value.sentiment as BetaFeedbackSentiment) ? value.sentiment as BetaFeedbackSentiment : 'Neutral',
    message: value.message.trim(),
    contact: typeof value.contact === 'string' ? value.contact.trim() : '',
    pageUrl: typeof value.pageUrl === 'string' ? value.pageUrl : '',
    createdAt: value.createdAt || nowIso(),
    status: value.status === 'reviewed' ? 'reviewed' : 'new'
  }
}

export function loadBetaFeedback() {
  if (!isBrowser()) return []
  try {
    const stored = window.localStorage.getItem(betaFeedbackStorageKey)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeFeedback(item as Partial<BetaFeedbackRecord>))
      .filter((item): item is BetaFeedbackRecord => Boolean(item))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  } catch {
    return []
  }
}

function saveBetaFeedback(records: BetaFeedbackRecord[]) {
  if (!isBrowser()) return records
  const trimmed = records
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 100)
  window.localStorage.setItem(betaFeedbackStorageKey, JSON.stringify(trimmed))
  window.dispatchEvent(new Event('nonrevy-beta-feedback-updated'))
  return trimmed
}

export function submitBetaFeedback(draft: BetaFeedbackDraft) {
  const normalized = normalizeFeedback({
    ...draft,
    id: feedbackId(),
    contact: draft.contact || '',
    pageUrl: draft.pageUrl || (isBrowser() ? window.location.href : ''),
    createdAt: nowIso(),
    status: 'new'
  })
  if (!normalized) return null
  saveBetaFeedback([normalized, ...loadBetaFeedback()])
  return normalized
}

export function markBetaFeedbackReviewed(id: string) {
  return saveBetaFeedback(loadBetaFeedback().map((item) => item.id === id ? { ...item, status: 'reviewed' } : item))
}

export function clearBetaFeedback() {
  return saveBetaFeedback([])
}

export function betaFeedbackSummary(records = loadBetaFeedback()) {
  const open = records.filter((item) => item.status === 'new').length
  const blocked = records.filter((item) => item.sentiment === 'Blocked').length
  const newest = records[0]?.createdAt || ''
  return { total: records.length, open, blocked, newest }
}

export function betaFeedbackExportText(records = loadBetaFeedback()) {
  if (!records.length) return 'No private beta feedback captured yet.'
  return records.map((item) => [
    `${item.category} · ${item.sentiment} · ${item.status}`,
    `When: ${item.createdAt}`,
    item.pageUrl ? `Page: ${item.pageUrl}` : '',
    item.contact ? `Contact: ${item.contact}` : '',
    `Feedback: ${item.message}`
  ].filter(Boolean).join('\n')).join('\n\n---\n\n')
}
