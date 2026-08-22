import { accountPersistenceHeaders } from './accountPersistenceClient'
import type { AccountLoadRequest, AccountLoadRequestInput } from './loadRequestAccountStore'

export type LoadRequestApiResponse = {
  request?: AccountLoadRequest | null
  requests?: AccountLoadRequest[]
  storageMode?: 'supabase' | 'local-fallback'
  status?: string
  detail?: string
  error?: string
}

async function parseJson(response: Response): Promise<LoadRequestApiResponse> {
  try {
    return await response.json() as LoadRequestApiResponse
  } catch {
    return {}
  }
}

export async function submitAccountLoadRequest(input: AccountLoadRequestInput): Promise<LoadRequestApiResponse> {
  if (typeof window === 'undefined') return { status: 'error', error: 'Load requests can only be submitted from the browser.' }
  try {
    const response = await fetch('/api/load-requests', {
      method: 'POST',
      headers: await accountPersistenceHeaders(),
      cache: 'no-store',
      body: JSON.stringify({ request: input })
    })
    const data = await parseJson(response)
    if (!response.ok) {
      return {
        status: data.status || 'error',
        storageMode: data.storageMode,
        error: data.error || 'Could not submit this load request.',
        detail: data.detail
      }
    }
    return data
  } catch {
    return {
      status: 'error',
      storageMode: 'local-fallback',
      error: "Couldn't confirm request status. Check My Requests before retrying."
    }
  }
}

export async function listAccountLoadRequests(): Promise<LoadRequestApiResponse> {
  if (typeof window === 'undefined') return { requests: [], status: 'error', error: 'Load requests can only be loaded from the browser.' }
  try {
    const response = await fetch('/api/load-requests', {
      headers: await accountPersistenceHeaders(),
      cache: 'no-store'
    })
    const data = await parseJson(response)
    if (!response.ok) {
      return {
        requests: [],
        status: data.status || 'error',
        storageMode: data.storageMode,
        error: data.error || 'Could not load account requests.',
        detail: data.detail
      }
    }
    return data
  } catch {
    return {
      requests: [],
      status: 'error',
      storageMode: 'local-fallback',
      error: 'Account request sync is unavailable right now.'
    }
  }
}

export async function listOpenResponderLoadRequests(): Promise<LoadRequestApiResponse> {
  if (typeof window === 'undefined') return { requests: [], status: 'error', error: 'Open requests can only be loaded from the browser.' }
  try {
    const response = await fetch('/api/load-requests?scope=open&limit=200', {
      headers: await accountPersistenceHeaders(),
      cache: 'no-store'
    })
    const data = await parseJson(response)
    if (!response.ok) return { requests: [], status: data.status || 'error', error: data.error || 'Could not load open requests.', detail: data.detail }
    return data
  } catch {
    return { requests: [], status: 'error', error: 'Open request sync is unavailable right now.' }
  }
}

export async function cancelAccountLoadRequest(requestId: string | number): Promise<LoadRequestApiResponse> {
  if (typeof window === 'undefined') return { status: 'error', error: 'Load requests can only be cancelled from the browser.' }
  try {
    const response = await fetch('/api/load-requests', {
      method: 'POST',
      headers: await accountPersistenceHeaders(),
      cache: 'no-store',
      body: JSON.stringify({ action: 'cancel', requestId })
    })
    const data = await parseJson(response)
    if (!response.ok) return { status: data.status || 'error', error: data.error || 'Could not cancel this request.', detail: data.detail }
    return data
  } catch {
    return { status: 'error', error: 'Could not cancel this request. Try again.' }
  }
}

export async function answerAccountLoadRequest(requestId: string | number, intel: string, responderToken: string): Promise<LoadRequestApiResponse> {
  if (typeof window === 'undefined') return { status: 'error', error: 'Load requests can only be answered from the browser.' }
  try {
    const response = await fetch('/api/load-requests', {
      method: 'POST',
      headers: {
        ...(await accountPersistenceHeaders()),
        'x-nonrevy-responder-token': responderToken
      },
      cache: 'no-store',
      body: JSON.stringify({ action: 'answer', requestId, response: { intel } })
    })
    const data = await parseJson(response)
    if (!response.ok) return { status: data.status || 'error', error: data.error || 'Could not submit this response.', detail: data.detail }
    return data
  } catch {
    return { status: 'error', error: 'Could not submit this response. Try again.' }
  }
}
