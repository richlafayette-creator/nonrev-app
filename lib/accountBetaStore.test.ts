import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  listAccountBetaRecords,
  persistentBetaFeedbackTableName,
  persistentSavedSearchesTableName,
  upsertAccountBetaRecords
} from './accountBetaStore.ts'
import type { BetaFeedbackRecord } from './betaFeedback.ts'
import type { SavedSearch } from './savedSearches.ts'

const originalFetch = globalThis.fetch
const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
}

type FetchCall = {
  url: string
  init?: RequestInit
}

function feedback(overrides: Partial<BetaFeedbackRecord> = {}): BetaFeedbackRecord {
  return {
    id: 'feedback-1',
    category: 'Bug report',
    sentiment: 'Neutral',
    message: 'The itinerary copy is confusing.',
    contact: 'beta@example.com',
    pageUrl: 'https://beta.nonrevy.com/results',
    deviceClass: 'mobile',
    createdAt: '2026-08-21T01:00:00.000Z',
    status: 'new',
    ...overrides
  }
}

function savedSearch(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: 'saved-search-1',
    label: 'LAX to HND tomorrow',
    kind: 'route-search',
    query: 'LAX to HND tomorrow',
    carrier: 'all',
    createdAt: '2026-08-21T01:00:00.000Z',
    updatedAt: '2026-08-21T01:00:00.000Z',
    runCount: 0,
    ...overrides
  }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

function installSupabaseMock(handler: (url: string, init?: RequestInit) => unknown | Promise<unknown>, calls: FetchCall[] = []) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://nonrevy-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
  delete process.env.SUPABASE_URL
  Object.defineProperty(globalThis, 'fetch', {
    value: async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const handled = await handler(url, init)
      if (handled instanceof Response) return handled
      return jsonResponse(handled)
    },
    configurable: true
  })
  return calls
}

function restoreGlobals() {
  Object.defineProperty(globalThis, 'fetch', { value: originalFetch, configurable: true })
  process.env.SUPABASE_URL = originalEnv.SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY
}

describe('account beta persistence store', () => {
  beforeEach(() => {
    restoreGlobals()
  })

  afterEach(() => {
    restoreGlobals()
  })

  it('persists authenticated beta feedback to the account-backed feedback table', async () => {
    const calls = installSupabaseMock((url, init) => {
      if (url.includes(`/${persistentBetaFeedbackTableName}?on_conflict=id`) && init?.method === 'POST') {
        return JSON.parse(String(init.body))
      }
      return []
    })

    const result = await upsertAccountBetaRecords('beta-feedback', 'user:traveler-1', [feedback()])

    assert.equal(result.status, 'ready')
    assert.equal(result.storageMode, 'supabase')
    assert.equal(result.data[0].id, 'feedback-1')
    const insert = calls.find((call) => call.init?.method === 'POST')
    assert.ok(insert)
    const body = JSON.parse(String(insert.init?.body))
    assert.equal(body[0].id, 'user:traveler-1:feedback-1')
    assert.equal(body[0].user_id, 'user:traveler-1')
    assert.equal(body[0].category, 'Bug report')
    assert.equal(body[0].payload.message, 'The itinerary copy is confusing.')
  })

  it('scopes beta feedback reads to the current account owner', async () => {
    const calls = installSupabaseMock((url) => {
      if (url.includes('user_id=eq.user%3Atraveler-2')) return [{ payload: feedback({ id: 'feedback-2' }) }]
      return []
    })

    const result = await listAccountBetaRecords('beta-feedback', 'user:traveler-2', 25)

    assert.equal(result.status, 'ready')
    assert.equal(result.data[0].id, 'feedback-2')
    assert.ok(calls[0].url.includes(`${persistentBetaFeedbackTableName}?select=payload`))
    assert.ok(calls[0].url.includes('user_id=eq.user%3Atraveler-2'))
    assert.doesNotMatch(calls[0].url, /traveler-1/)
  })

  it('persists saved searches to the account-backed saved-search table', async () => {
    const calls = installSupabaseMock((url, init) => {
      if (url.includes(`/${persistentSavedSearchesTableName}?on_conflict=id`) && init?.method === 'POST') {
        return JSON.parse(String(init.body))
      }
      return []
    })

    const result = await upsertAccountBetaRecords('saved-searches', 'user:traveler-1', [savedSearch()])

    assert.equal(result.status, 'ready')
    assert.equal(result.data[0].query, 'LAX to HND tomorrow')
    const insert = calls.find((call) => call.init?.method === 'POST')
    assert.ok(insert?.url.includes(`${persistentSavedSearchesTableName}?on_conflict=id`))
    const body = JSON.parse(String(insert?.init?.body))
    assert.equal(body[0].id, 'user:traveler-1:saved-search-1')
    assert.equal(body[0].route, 'LAX to HND tomorrow')
  })

  it('uses stable row ids and merge-upsert behavior for duplicate saved searches', async () => {
    const calls = installSupabaseMock((url, init) => {
      if (url.includes(`/${persistentSavedSearchesTableName}?on_conflict=id`) && init?.method === 'POST') {
        return JSON.parse(String(init.body))
      }
      return []
    })

    await upsertAccountBetaRecords('saved-searches', 'user:traveler-1', [
      savedSearch({ label: 'First label' }),
      savedSearch({ label: 'Updated label' })
    ])

    const insert = calls.find((call) => call.init?.method === 'POST')
    assert.equal(insert?.init?.headers && 'Prefer' in insert.init.headers, true)
    assert.equal((insert?.init?.headers as Record<string, string>).Prefer, 'resolution=merge-duplicates,return=representation')
    const body = JSON.parse(String(insert?.init?.body))
    assert.deepEqual(body.map((row: { id: string }) => row.id), [
      'user:traveler-1:saved-search-1',
      'user:traveler-1:saved-search-1'
    ])
  })

  it('keeps local fallback graceful when account beta tables are unavailable', async () => {
    installSupabaseMock(() => jsonResponse({ message: 'SQL schema cache relation nonrevy_beta_feedback failed with Bearer secret-value' }, 404))

    const result = await listAccountBetaRecords('beta-feedback', 'user:traveler-1', 25)

    assert.equal(result.status, 'unreachable')
    assert.equal(result.storageMode, 'local-fallback')
    assert.deepEqual(result.data, [])
    assert.doesNotMatch(result.detail, /SQL|schema cache|Bearer secret-value/)
    assert.match(result.detail, /Feedback account sync is unavailable/)
  })

  it('documents the additive schema and one-response DB uniqueness guard', () => {
    const sql = fs.readFileSync('docs/private-beta-persistence-hardening.sql', 'utf8')

    assert.match(sql, /create table if not exists public\.nonrevy_beta_feedback/)
    assert.match(sql, /create table if not exists public\.nonrevy_saved_searches/)
    assert.match(sql, /alter table public\.nonrevy_beta_feedback enable row level security/)
    assert.match(sql, /alter table public\.nonrevy_saved_searches enable row level security/)
    assert.match(sql, /load_responses_one_response_per_request_idx/)
    assert.match(sql, /on public\.load_responses \(request_id\)/)
    assert.match(sql, /having count\(\*\) > 1/)
  })
})
