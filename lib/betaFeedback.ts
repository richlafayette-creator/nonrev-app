import { accountPersistenceFetch } from './accountPersistenceClient'

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

function mergeFeedbackRecords(records: BetaFeedbackRecord[]) {
  const merged = new Map<string, BetaFeedbackRecord>()
  records
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .forEach((record) => {
      if (!merged.has(record.id)) merged.set(record.id, record)
    })
  return [...merged.values()].slice(0, 100)
}

function saveBetaFeedback(records: BetaFeedbackRecord[]) {
  if (!isBrowser()) return records
  const trimmed = mergeFeedbackRecords(records)
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
  void persistBetaFeedbackRecord(normalized)
  return normalized
}

export function markBetaFeedbackReviewed(id: string) {
  const records = saveBetaFeedback(loadBetaFeedback().map((item) => item.id === id ? { ...item, status: 'reviewed' } : item))
  const updated = records.find((item) => item.id === id)
  if (updated) void persistBetaFeedbackRecord(updated)
  return records
}

export function clearBetaFeedback() {
  void accountPersistenceFetch<{ cleared?: boolean }>('/api/beta-feedback', { method: 'DELETE' })
  return saveBetaFeedback([])
}

export async function persistBetaFeedbackRecord(record: BetaFeedbackRecord) {
  return accountPersistenceFetch<{ record?: BetaFeedbackRecord; records?: BetaFeedbackRecord[]; storageMode?: string; status?: string; detail?: string }>('/api/beta-feedback', {
    method: 'POST',
    body: JSON.stringify({ record })
  })
}

export async function syncBetaFeedback() {
  const localRecords = loadBetaFeedback()
  const result = await accountPersistenceFetch<{ records?: BetaFeedbackRecord[]; storageMode?: string; status?: string; detail?: string }>('/api/beta-feedback', {
    method: 'POST',
    body: JSON.stringify({ records: localRecords })
  })
  const merged = saveBetaFeedback(mergeFeedbackRecords([...(result?.records || []), ...localRecords]))
  return { records: merged, storageMode: result?.storageMode || 'local-fallback', status: result?.status || 'local-fallback', detail: result?.detail || 'Local beta feedback fallback is active.' }
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
