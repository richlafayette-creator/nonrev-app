export const notificationPreferencesStorageKey = 'nonrevy.notificationPreferences'
export const notificationDeliveriesStorageKey = 'nonrevy.notificationDeliveries'

export type NotificationChannel = 'browser-push' | 'email' | 'mobile-push'

export type NotificationEventType =
  | 'watchlist'
  | 'route-confidence-changes'
  | 'better-route-found'
  | 'disruption-alerts'
  | 'weather-alerts'
  | 'did-you-get-on-reminders'

export type NotificationDeliveryStatus = 'stored-local' | 'blocked-by-preference' | 'no-channel-enabled'

export type NotificationPreferences = {
  eventTypes: Record<NotificationEventType, boolean>
  channels: Record<NotificationChannel, boolean>
  updatedAt: string
}

export type NotificationDeliveryRequest = {
  eventType: NotificationEventType
  title: string
  body: string
  targetId?: string
  targetLabel?: string
  source: 'watchlist' | 'route-confidence' | 'better-route' | 'disruption' | 'weather' | 'outcome-reminder' | 'local-engine'
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

export const notificationEventOptions: Array<{ key: NotificationEventType; label: string; description: string }> = [
  { key: 'watchlist', label: 'Watchlists', description: 'Notify when watched trips produce local alert activity.' },
  { key: 'route-confidence-changes', label: 'Route confidence changes', description: 'Notify when confidence or success probability changes materially.' },
  { key: 'better-route-found', label: 'Better route found', description: 'Notify when a stronger saved route appears for the same market.' },
  { key: 'disruption-alerts', label: 'Disruption alerts', description: 'Notify when delay, cancellation, diversion, or route-health risk appears.' },
  { key: 'weather-alerts', label: 'Weather alerts', description: 'Notify when weather risk reaches a notification threshold.' },
  { key: 'did-you-get-on-reminders', label: 'Did-you-get-on reminders', description: 'Notify after dated trips so outcomes can be captured.' }
]

export const notificationChannelOptions: Array<{ key: NotificationChannel; label: string; description: string }> = [
  { key: 'browser-push', label: 'Browser push', description: 'Framework-ready local browser push channel; service worker/provider can attach later.' },
  { key: 'email', label: 'Email', description: 'Future email delivery channel placeholder.' },
  { key: 'mobile-push', label: 'Mobile push', description: 'Future mobile push delivery channel placeholder.' }
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
  updatedAt: new Date(0).toISOString()
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function normalizePreferences(value: Partial<NotificationPreferences> | null | undefined): NotificationPreferences {
  return {
    eventTypes: { ...defaultNotificationPreferences.eventTypes, ...(value?.eventTypes || {}) },
    channels: { ...defaultNotificationPreferences.channels, ...(value?.channels || {}) },
    updatedAt: value?.updatedAt || new Date().toISOString()
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
  const next = normalizePreferences({ ...preferences, updatedAt: new Date().toISOString() })
  window.localStorage.setItem(notificationPreferencesStorageKey, JSON.stringify(next))
  window.dispatchEvent(new Event('nonrevy-notification-preferences-updated'))
  return next
}

export function loadNotificationDeliveries() {
  if (!isBrowser()) return []

  try {
    const stored = window.localStorage.getItem(notificationDeliveriesStorageKey)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed as NotificationDeliveryRecord[] : []
  } catch {
    return []
  }
}

function saveNotificationDeliveries(records: NotificationDeliveryRecord[]) {
  if (!isBrowser()) return records
  const trimmed = records
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 120)
  window.localStorage.setItem(notificationDeliveriesStorageKey, JSON.stringify(trimmed))
  window.dispatchEvent(new Event('nonrevy-notification-deliveries-updated'))
  return trimmed
}

export function eventTypeEnabled(eventType: NotificationEventType, preferences = loadNotificationPreferences()) {
  return preferences.eventTypes[eventType] !== false
}

export function enabledNotificationChannels(preferences = loadNotificationPreferences()) {
  return notificationChannelOptions.map((option) => option.key).filter((channel) => preferences.channels[channel])
}

export function deliverNotification(request: NotificationDeliveryRequest) {
  if (!isBrowser()) return []

  const preferences = loadNotificationPreferences()
  const existing = loadNotificationDeliveries()
  if (existing.some((record) => record.eventKey === request.eventKey && record.eventType === request.eventType)) return existing

  const createdAt = new Date().toISOString()
  if (!eventTypeEnabled(request.eventType, preferences)) {
    return saveNotificationDeliveries([
      {
        ...request,
        id: `${request.eventType}-${request.eventKey}-blocked-${Date.now()}`,
        channel: 'browser-push',
        status: 'blocked-by-preference',
        statusMessage: 'Notification event type is disabled in local preferences.',
        createdAt
      },
      ...existing
    ])
  }

  const channels = enabledNotificationChannels(preferences)
  if (channels.length === 0) {
    return saveNotificationDeliveries([
      {
        ...request,
        id: `${request.eventType}-${request.eventKey}-no-channel-${Date.now()}`,
        channel: 'browser-push',
        status: 'no-channel-enabled',
        statusMessage: 'No notification channel is enabled; delivery was not attempted.',
        createdAt
      },
      ...existing
    ])
  }

  const records = channels.map((channel) => ({
    ...request,
    id: `${request.eventType}-${request.eventKey}-${channel}-${Date.now()}`,
    channel,
    status: 'stored-local' as const,
    statusMessage: channel === 'browser-push'
      ? 'Stored locally for browser push framework; service worker/provider delivery can attach later.'
      : `Stored locally for future ${channel} provider delivery.`,
    createdAt
  }))

  return saveNotificationDeliveries([...records, ...existing])
}

export function clearNotificationDeliveries() {
  if (!isBrowser()) return []
  window.localStorage.setItem(notificationDeliveriesStorageKey, JSON.stringify([]))
  window.dispatchEvent(new Event('nonrevy-notification-deliveries-updated'))
  return []
}

export function notificationDiagnostics() {
  const preferences = loadNotificationPreferences()
  const deliveries = loadNotificationDeliveries()
  const enabledEvents = notificationEventOptions.filter((option) => preferences.eventTypes[option.key]).length
  const enabledChannels = enabledNotificationChannels(preferences)
  const storedLocal = deliveries.filter((delivery) => delivery.status === 'stored-local').length
  const blocked = deliveries.filter((delivery) => delivery.status !== 'stored-local').length

  return {
    preferences,
    deliveries,
    enabledEvents,
    enabledChannels,
    storedLocal,
    blocked,
    status: enabledEvents > 0 && enabledChannels.length > 0 ? 'Connected' as const : 'Limited' as const,
    detail: `${enabledEvents}/${notificationEventOptions.length} alert types enabled; ${enabledChannels.length}/${notificationChannelOptions.length} channels enabled; ${deliveries.length} local delivery record${deliveries.length === 1 ? '' : 's'}.`
  }
}
