const accountDeviceIdStorageKey = 'nonrevy.persistentDeviceId'

function isBrowser() {
  return typeof window !== 'undefined'
}

function persistentDeviceId() {
  if (!isBrowser()) return 'server'
  try {
    const existing = window.localStorage.getItem(accountDeviceIdStorageKey)
    if (existing) return existing
    const created = `device-${crypto.randomUUID?.() || Date.now()}`
    window.localStorage.setItem(accountDeviceIdStorageKey, created)
    return created
  } catch {
    return 'device-local-fallback'
  }
}

export async function accountPersistenceHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-nonrevy-device-id': persistentDeviceId()
  }

  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  } catch {
    // Account sync is optional; API will use the stable device id fallback.
  }

  return headers
}

export async function accountPersistenceFetch<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  if (!isBrowser()) return null
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(await accountPersistenceHeaders()),
        ...(init.headers || {})
      },
      cache: 'no-store'
    })
    if (!response.ok) return null
    return await response.json() as T
  } catch {
    return null
  }
}
