const CACHE_NAME = 'nonrevy-pwa-v1'
const OFFLINE_URL = '/offline'
const APP_SHELL = ['/', '/plan', OFFLINE_URL, '/brand/nonrevy-logo.png', '/icons/nonrevy-icon.svg', '/icons/nonrevy-maskable-icon.svg']

function notificationUrl(data) {
  if (data && typeof data.url === 'string' && data.url.startsWith('/')) return data.url
  return '/notifications'
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          return cached || caches.match(OFFLINE_URL)
        })
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') return response
      const copy = response.clone()
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      return response
    }))
  )
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'nonrevy update', body: event.data ? event.data.text() : 'New route notification available.' }
  }

  const title = payload.title || 'nonrevy update'
  const options = {
    body: payload.body || 'Open nonrevy to review your latest alert.',
    tag: payload.tag || payload.eventKey || 'nonrevy-notification',
    icon: payload.icon || '/icons/nonrevy-icon.svg',
    badge: payload.badge || '/icons/nonrevy-icon.svg',
    data: { ...(payload.data || {}), url: notificationUrl(payload.data) }
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = notificationUrl(event.notification.data)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).pathname === url)
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    })
  )
})
