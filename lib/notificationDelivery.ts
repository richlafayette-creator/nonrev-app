export const notificationPreferencesStorageKey = 'nonrevy.notificationPreferences'
export const notificationDeliveriesStorageKey = 'nonrevy.notificationDeliveries'
export const notificationQueueStorageKey = 'nonrevy.notificationQueue'
export const notificationPushSubscriptionStorageKey = 'nonrevy.browserPushSubscription'
export const notificationEngineRunStorageKey = 'nonrevy.notificationEngineRuns'

export type NotificationChannel = 'browser-push' | 'email' | 'mobile-push'
export type NotificationFrequency = 'immediate' | 'hourly' | 'daily' | 'paused'

export type NotificationEventType =
  | 'watchlist'
  | 'route-confidence-changes'
  | 'community-load-reports'
  | 'better-route-found'
  | 'disruption-alerts'
  | 'weather-alerts'
  | 'did-you-get-on-reminders'

export type NotificationDeliveryStatus =
  | 'sent-browser'
  | 'sent-service-worker'
  | 'stored-local'
  | 'placeholder'
  | 'queued-by-frequency'
  | 'blocked-by-preference'
  | 'no-channel-enabled'
  | 'browser-permission-blocked'
  | 'delivery-error'

export type NotificationQueueStatus = 'queued' | 'processed' | 'blocked'

export type BrowserPushSubscriptionRecord = {
  endpoint: string
  expirationTime: number | null
  keys?: Record<string, string>
  createdAt: string
  status: 'active' | 'missing-public-key' | 'unsupported' | 'permission-blocked' | 'subscribe-error'
  statusMessage: string
}

export type NotificationEngineRunRecord = {
  id: string
  startedAt: string
  completedAt: string
  alertsBefore: number
  alertsAfter: number
  remindersBefore: number
  remindersAfter: number
  queueBefore: number
  queueAfter: number
  deliveriesBefore: number
  deliveriesAfter: number
  status: 'completed' | 'partial'
  statusMessage: string
}

export type NotificationPreferences = {
  eventTypes: Record<NotificationEventType, boolean>
  channels: Record<NotificationChannel, boolean>
  frequency: NotificationFrequency
  maxPerHour: number
  updatedAt: string
}

export type NotificationDeliveryRequest = {
  eventType: NotificationEventType
  title: string
  body: string
  targetId?: string
  targetLabel?: string
  source: 'watchlist' | 'route-confidence' | 'community-load-report' | 'better-route' | 'disruption' | 'weather' | 'outcome-reminder' | 'local-engine'
  eventKey: string
  details?: string[]
}

export type NotificationDeliveryRecord = NotificationDeliveryRequest & {
  id: string
  channel: NotificationChannel
  status: NotificationDeliveryStatus
  statusMessage: string
  createdAt: string
}

export type NotificationQueueRecord = NotificationDeliveryRequest & {
  id: string
  channels: NotificationChannel[]
  status: NotificationQueueStatus
  statusMessage: string
  createdAt: string
  nextAttemptAt: string
  attempts: number
  processedAt?: string
}

export const notificationEventOptions: Array<{ key: NotificationEventType; label: string; description: string }> = [
  { key: 'watchlist', label: 'Watchlists', description: 'Notify when watched trips are added or produce local alert activity.' },
  { key: 'route-confidence-changes', label: 'Route confidence changes', description: 'Notify when confidence or success probability changes materially.' },
  { key: 'community-load-reports', label: 'Community load reports', description: 'Notify when a structured community load report is submitted.' },
  { key: 'better-route-found', label: 'Better itinerary found', description: 'Notify when a stronger saved route appears for the same market.' },
  { key: 'disruption-alerts', label: 'Disruption alerts', description: 'Notify when delay, cancellation, diversion, or route-health risk appears.' },
  { key: 'weather-alerts', label: 'Weather alerts', description: 'Notify when weather risk reaches a notification threshold.' },
  { key: 'did-you-get-on-reminders', label: 'Outcome reminders', description: 'Notify after dated trips so outcomes can be captured.' }
]

export const notificationChannelOptions: Array<{ key: NotificationChannel; label: string; description: string }> = [
  { key: 'browser-push', label: 'Browser push', description: 'Uses the browser Notification API when permission is granted; otherwise keeps a local inbox record.' },
  { key: 'email', label: 'Email', description: 'Queued as a safe placeholder until an email provider is configured.' },
  { key: 'mobile-push', label: 'Mobile push', description: 'Queued as a safe placeholder until a mobile push provider is configured.' }
]

export const notificationFrequencyOptions: Array<{ key: NotificationFrequency; label: string; description: string }> = [
  { key: 'immediate', label: 'Immediate', description: 'Process eligible notifications as soon as they are queued.' },
  { key: 'hourly', label: 'Hourly digest', description: 'Hold new notifications until the top of the next local hour.' },
  { key: 'daily', label: 'Daily digest', description: 'Hold new notifications until the next local daily digest window.' },
  { key: 'paused', label: 'Paused', description: 'Keep notifications queued without delivery attempts.' }
]

const defaultEventTypes = notificationEventOptions.reduce((flags, option) => {
  flags[option.key] = true
  return flags
}, {} as Record<NotificationEventType, boolean>)

export const defaultNotificationPreferences: NotificationPreferences = {
  eventTypes: defaultEventTypes,
  channels: {
    'browser-push': true,
    email: false,
    'mobile-push': false
  },
  frequency: 'immediate',
  maxPerHour: 20,
  updatedAt: new Date(0).toISOString()
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function nowIso() {
  return new Date().toISOString()
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizePreferences(value: Partial<NotificationPreferences> | null | undefined): NotificationPreferences {
  return {
    eventTypes: { ...defaultNotificationPreferences.eventTypes, ...(value?.eventTypes || {}) },
    channels: { ...defaultNotificationPreferences.channels, ...(value?.channels || {}) },
    frequency: value?.frequency || defaultNotificationPreferences.frequency,
    maxPerHour: clamp(Number(value?.maxPerHour || defaultNotificationPreferences.maxPerHour), 1, 200),
    updatedAt: value?.updatedAt || new Date().toISOString()
  }
}

function readArray<T>(storageKey: string): T[] {
  if (!isBrowser()) return []
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

export function loadNotificationPreferences(): NotificationPreferences {
  if (!isBrowser()) return defaultNotificationPreferences

  try {
    const stored = window.localStorage.getItem(notificationPreferencesStorageKey)
    if (!stored) return normalizePreferences(defaultNotificationPreferences)
    return normalizePreferences(JSON.parse(stored) as Partial<NotificationPreferences>)
  } catch {
    return normalizePreferences(defaultNotificationPreferences)
  }
}

export function saveNotificationPreferences(preferences: NotificationPreferences) {
  if (!isBrowser()) return preferences
  const next = normalizePreferences({ ...preferences, updatedAt: nowIso() })
  window.localStorage.setItem(notificationPreferencesStorageKey, JSON.stringify(next))
  window.dispatchEvent(new Event('nonrevy-notification-preferences-updated'))
  return next
}

export function loadNotificationDeliveries() {
  return readArray<NotificationDeliveryRecord>(notificationDeliveriesStorageKey)
}

export function loadNotificationQueue() {
  return readArray<NotificationQueueRecord>(notificationQueueStorageKey)
}

function saveNotificationDeliveries(records: NotificationDeliveryRecord[]) {
  if (!isBrowser()) return records
  const trimmed = records
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 200)
  window.localStorage.setItem(notificationDeliveriesStorageKey, JSON.stringify(trimmed))
  window.dispatchEvent(new Event('nonrevy-notification-deliveries-updated'))
  return trimmed
}

function saveNotificationQueue(records: NotificationQueueRecord[]) {
  if (!isBrowser()) return records
  const trimmed = records
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 200)
  window.localStorage.setItem(notificationQueueStorageKey, JSON.stringify(trimmed))
  window.dispatchEvent(new Event('nonrevy-notification-queue-updated'))
  return trimmed
}

export function eventTypeEnabled(eventType: NotificationEventType, preferences = loadNotificationPreferences()) {
  return preferences.eventTypes[eventType] !== false
}

export function enabledNotificationChannels(preferences = loadNotificationPreferences()) {
  return notificationChannelOptions.map((option) => option.key).filter((channel) => preferences.channels[channel])
}

function nextAttemptForFrequency(frequency: NotificationFrequency, now = new Date()) {
  if (frequency === 'immediate') return now.toISOString()
  if (frequency === 'hourly') {
    const next = new Date(now)
    next.setMinutes(60, 0, 0)
    return next.toISOString()
  }
  if (frequency === 'daily') {
    const next = new Date(now)
    next.setDate(next.getDate() + 1)
    next.setHours(9, 0, 0, 0)
    return next.toISOString()
  }
  const paused = new Date(now)
  paused.setFullYear(paused.getFullYear() + 1)
  return paused.toISOString()
}

function deliveriesLastHour(deliveries = loadNotificationDeliveries()) {
  const cutoff = Date.now() - 3_600_000
  return deliveries.filter((delivery) => (delivery.status === 'sent-browser' || delivery.status === 'sent-service-worker') && Date.parse(delivery.createdAt) >= cutoff).length
}

function alreadySeen(eventType: NotificationEventType, eventKey: string) {
  const deliveries = loadNotificationDeliveries()
  const queue = loadNotificationQueue()
  return deliveries.some((record) => record.eventType === eventType && record.eventKey === eventKey) ||
    queue.some((record) => record.eventType === eventType && record.eventKey === eventKey && record.status !== 'blocked')
}

function statusForChannel(channel: NotificationChannel): NotificationDeliveryStatus {
  if (channel === 'browser-push') {
    if (!('Notification' in window)) return 'stored-local'
    if (Notification.permission === 'granted') return 'sent-browser'
    if (Notification.permission === 'denied') return 'browser-permission-blocked'
    return 'stored-local'
  }
  return 'placeholder'
}

async function registrationReady() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const existing = await navigator.serviceWorker.getRegistration('/sw.js')
    if (existing) return existing
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

function persistPushSubscription(record: BrowserPushSubscriptionRecord | null) {
  if (!isBrowser()) return record
  if (!record) window.localStorage.removeItem(notificationPushSubscriptionStorageKey)
  else window.localStorage.setItem(notificationPushSubscriptionStorageKey, JSON.stringify(record))
  window.dispatchEvent(new Event('nonrevy-browser-push-subscription-updated'))
  return record
}

export function loadBrowserPushSubscription() {
  if (!isBrowser()) return null
  try {
    const stored = window.localStorage.getItem(notificationPushSubscriptionStorageKey)
    if (!stored) return null
    return JSON.parse(stored) as BrowserPushSubscriptionRecord
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export async function registerBrowserPushSubscription() {
  if (!isBrowser()) return null
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return persistPushSubscription({
      endpoint: '',
      expirationTime: null,
      createdAt: nowIso(),
      status: 'unsupported',
      statusMessage: 'This browser does not support the Push API and service-worker notifications.'
    })
  }

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') {
    return persistPushSubscription({
      endpoint: '',
      expirationTime: null,
      createdAt: nowIso(),
      status: 'permission-blocked',
      statusMessage: `Browser push permission is ${permission}.`
    })
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) {
    return persistPushSubscription({
      endpoint: '',
      expirationTime: null,
      createdAt: nowIso(),
      status: 'missing-public-key',
      statusMessage: 'Browser push permission is granted. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY to enable remote Push API subscriptions.'
    })
  }

  try {
    const registration = await registrationReady()
    if (!registration) throw new Error('Service worker unavailable')
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    })
    const serialized = subscription.toJSON() as PushSubscriptionJSON
    return persistPushSubscription({
      endpoint: serialized.endpoint || '',
      expirationTime: subscription.expirationTime,
      keys: serialized.keys,
      createdAt: nowIso(),
      status: 'active',
      statusMessage: 'Browser Push API subscription is active on this device.'
    })
  } catch {
    return persistPushSubscription({
      endpoint: '',
      expirationTime: null,
      createdAt: nowIso(),
      status: 'subscribe-error',
      statusMessage: 'Browser Push API subscription failed; local service-worker notifications still work when the app is open.'
    })
  }
}

function sendServiceWorkerNotification(record: NotificationQueueRecord) {
  if (!('serviceWorker' in navigator)) return false

  navigator.serviceWorker.ready.then((registration) => {
    registration.showNotification(record.title, {
      body: record.body,
      tag: record.eventKey,
      badge: '/icons/nonrevy-icon.svg',
      icon: '/icons/nonrevy-icon.svg',
      data: { eventType: record.eventType, targetId: record.targetId, source: record.source, url: '/notifications' }
    })
  }).catch(() => {
    // Delivery diagnostics are recorded by the caller; do not interrupt queue processing.
  })

  return true
}

function deliverToChannel(record: NotificationQueueRecord, channel: NotificationChannel): NotificationDeliveryRecord {
  const createdAt = nowIso()
  const status = statusForChannel(channel)
  let statusMessage = ''

  try {
    if (channel === 'browser-push' && status === 'sent-browser') {
      const sentViaServiceWorker = sendServiceWorkerNotification(record)
      if (!sentViaServiceWorker) {
        new Notification(record.title, {
          body: record.body,
          tag: record.eventKey,
          icon: '/icons/nonrevy-icon.svg',
          data: { eventType: record.eventType, targetId: record.targetId, source: record.source, url: '/notifications' }
        })
      }
      statusMessage = sentViaServiceWorker
        ? 'Service worker accepted the browser push notification.'
        : 'Browser Notification API accepted the push notification.'
    } else if (channel === 'browser-push' && status === 'browser-permission-blocked') {
      statusMessage = 'Browser push permission is denied; notification retained in local history.'
    } else if (channel === 'browser-push') {
      statusMessage = 'Browser push permission is not granted or unavailable; notification retained in local history.'
    } else {
      statusMessage = `${channel === 'email' ? 'Email' : 'Mobile push'} provider is a placeholder; notification retained in queue/history for future provider delivery.`
    }
  } catch {
    return {
      ...record,
      id: `${record.eventType}-${record.eventKey}-${channel}-${Date.now()}`,
      channel,
      status: 'delivery-error',
      statusMessage: 'Delivery attempt failed in the local notification engine.',
      createdAt
    }
  }

  return {
    ...record,
    id: `${record.eventType}-${record.eventKey}-${channel}-${Date.now()}`,
    channel,
    status: channel === 'browser-push' && status === 'sent-browser' && 'serviceWorker' in navigator ? 'sent-service-worker' : status,
    statusMessage,
    createdAt
  }
}

function blockedDeliveryRecord(request: NotificationDeliveryRequest, channel: NotificationChannel, status: NotificationDeliveryStatus, statusMessage: string): NotificationDeliveryRecord {
  return {
    ...request,
    id: `${request.eventType}-${request.eventKey}-${status}-${Date.now()}`,
    channel,
    status,
    statusMessage,
    createdAt: nowIso()
  }
}

export function enqueueNotification(request: NotificationDeliveryRequest) {
  if (!isBrowser()) return []

  const preferences = loadNotificationPreferences()
  const existingQueue = loadNotificationQueue()
  const existingDeliveries = loadNotificationDeliveries()
  if (alreadySeen(request.eventType, request.eventKey)) return existingQueue

  if (!eventTypeEnabled(request.eventType, preferences)) {
    saveNotificationDeliveries([
      blockedDeliveryRecord(request, 'browser-push', 'blocked-by-preference', 'Notification event type is disabled in local preferences.'),
      ...existingDeliveries
    ])
    return existingQueue
  }

  const channels = enabledNotificationChannels(preferences)
  if (channels.length === 0) {
    saveNotificationDeliveries([
      blockedDeliveryRecord(request, 'browser-push', 'no-channel-enabled', 'No notification channel is enabled; delivery was not attempted.'),
      ...existingDeliveries
    ])
    return existingQueue
  }

  const queued: NotificationQueueRecord = {
    ...request,
    id: `${request.eventType}-${request.eventKey}-queue-${Date.now()}`,
    channels,
    status: 'queued',
    statusMessage: preferences.frequency === 'paused'
      ? 'Queued because notification delivery is paused.'
      : `Queued for ${preferences.frequency} notification processing.`,
    createdAt: nowIso(),
    nextAttemptAt: nextAttemptForFrequency(preferences.frequency),
    attempts: 0
  }

  const nextQueue = saveNotificationQueue([queued, ...existingQueue])
  if (preferences.frequency === 'immediate') processNotificationQueue()
  return nextQueue
}

export function processNotificationQueue(options: { force?: boolean } = {}) {
  if (!isBrowser()) return []

  const preferences = loadNotificationPreferences()
  const queue = loadNotificationQueue()
  const deliveries = loadNotificationDeliveries()
  const now = Date.now()
  const nextQueue: NotificationQueueRecord[] = []
  const newDeliveries: NotificationDeliveryRecord[] = []
  let sentThisHour = deliveriesLastHour(deliveries)

  queue.forEach((record) => {
    if (record.status !== 'queued') {
      nextQueue.push(record)
      return
    }

    if (preferences.frequency === 'paused' && !options.force) {
      nextQueue.push({ ...record, statusMessage: 'Queued because notification delivery is paused.' })
      return
    }

    if (!options.force && Date.parse(record.nextAttemptAt) > now) {
      nextQueue.push(record)
      return
    }

    if (!options.force && sentThisHour >= preferences.maxPerHour) {
      nextQueue.push({
        ...record,
        statusMessage: `Queued by max-per-hour frequency control (${preferences.maxPerHour}/hour).`,
        nextAttemptAt: new Date(now + 3_600_000).toISOString()
      })
      newDeliveries.push(blockedDeliveryRecord(record, record.channels[0] || 'browser-push', 'queued-by-frequency', `Held by max-per-hour control (${preferences.maxPerHour}/hour).`))
      return
    }

    record.channels.forEach((channel) => {
      const delivery = deliverToChannel(record, channel)
      newDeliveries.push(delivery)
      if (delivery.status === 'sent-browser' || delivery.status === 'sent-service-worker') sentThisHour += 1
    })
  })

  if (JSON.stringify(nextQueue) !== JSON.stringify(queue)) saveNotificationQueue(nextQueue)
  if (newDeliveries.length) saveNotificationDeliveries([...newDeliveries, ...deliveries])
  return nextQueue
}

export function deliverNotification(request: NotificationDeliveryRequest) {
  if (!isBrowser()) return []
  enqueueNotification(request)
  return loadNotificationDeliveries()
}

export async function requestBrowserPushPermission() {
  if (!isBrowser() || !('Notification' in window)) return 'unsupported' as const
  if (Notification.permission === 'granted') return 'granted' as const
  const permission = await Notification.requestPermission()
  window.dispatchEvent(new Event('nonrevy-notification-preferences-updated'))
  return permission
}

export function loadNotificationEngineRuns() {
  return readArray<NotificationEngineRunRecord>(notificationEngineRunStorageKey)
}

export function saveNotificationEngineRun(record: NotificationEngineRunRecord) {
  if (!isBrowser()) return []
  const runs = [record, ...loadNotificationEngineRuns()]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 80)
  window.localStorage.setItem(notificationEngineRunStorageKey, JSON.stringify(runs))
  window.dispatchEvent(new Event('nonrevy-notification-engine-runs-updated'))
  return runs
}

export function clearNotificationDeliveries() {
  if (!isBrowser()) return []
  window.localStorage.setItem(notificationDeliveriesStorageKey, JSON.stringify([]))
  window.dispatchEvent(new Event('nonrevy-notification-deliveries-updated'))
  return []
}

export function clearNotificationQueue() {
  if (!isBrowser()) return []
  window.localStorage.setItem(notificationQueueStorageKey, JSON.stringify([]))
  window.dispatchEvent(new Event('nonrevy-notification-queue-updated'))
  return []
}

export function notificationDiagnostics() {
  const preferences = loadNotificationPreferences()
  const deliveries = loadNotificationDeliveries()
  const queue = loadNotificationQueue()
  const enabledEvents = notificationEventOptions.filter((option) => preferences.eventTypes[option.key]).length
  const enabledChannels = enabledNotificationChannels(preferences)
  const sentBrowser = deliveries.filter((delivery) => delivery.status === 'sent-browser' || delivery.status === 'sent-service-worker').length
  const sentServiceWorker = deliveries.filter((delivery) => delivery.status === 'sent-service-worker').length
  const storedLocal = deliveries.filter((delivery) => delivery.status === 'stored-local').length
  const placeholders = deliveries.filter((delivery) => delivery.status === 'placeholder').length
  const blocked = deliveries.filter((delivery) => ['blocked-by-preference', 'no-channel-enabled', 'browser-permission-blocked', 'delivery-error', 'queued-by-frequency'].includes(delivery.status)).length
  const queued = queue.filter((record) => record.status === 'queued').length
  const browserPermission = isBrowser() && 'Notification' in window ? Notification.permission : 'unsupported'
  const browserPushSubscription = loadBrowserPushSubscription()
  const readyForBrowserPush = browserPermission === 'granted' && preferences.channels['browser-push']

  return {
    preferences,
    deliveries,
    queue,
    enabledEvents,
    enabledChannels,
    sentBrowser,
    sentServiceWorker,
    storedLocal,
    placeholders,
    blocked,
    queued,
    browserPermission,
    browserPushSubscription,
    readyForBrowserPush,
    status: enabledEvents > 0 && enabledChannels.length > 0 ? 'Connected' as const : 'Limited' as const,
    detail: `${enabledEvents}/${notificationEventOptions.length} alert types enabled; ${enabledChannels.length}/${notificationChannelOptions.length} channels enabled; ${queued} queued; ${deliveries.length} delivery/history record${deliveries.length === 1 ? '' : 's'}; browser permission ${browserPermission}.`
  }
}
