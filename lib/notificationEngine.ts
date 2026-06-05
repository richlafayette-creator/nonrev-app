import { loadAlertHistory, refreshRealTimeAlerts } from './alerts'
import { generateOutcomeReminders, loadOutcomeReminders } from './outcomeReminders'
import {
  loadNotificationDeliveries,
  loadNotificationQueue,
  processNotificationQueue,
  saveNotificationEngineRun,
  type NotificationEngineRunRecord
} from './notificationDelivery'

function isBrowser() {
  return typeof window !== 'undefined'
}

export function runNotificationEngine() {
  if (!isBrowser()) return null

  const startedAt = new Date().toISOString()
  const alertsBefore = loadAlertHistory().length
  const remindersBefore = loadOutcomeReminders().length
  const queueBefore = loadNotificationQueue().length
  const deliveriesBefore = loadNotificationDeliveries().length

  let status: NotificationEngineRunRecord['status'] = 'completed'
  const messages: string[] = []

  try {
    refreshRealTimeAlerts()
    messages.push('Refreshed watchlist, route-confidence, disruption, better-route, and weather notification sources.')
  } catch {
    status = 'partial'
    messages.push('Route alert refresh failed; queue processing continued.')
  }

  try {
    generateOutcomeReminders()
    messages.push('Checked due outcome reminders.')
  } catch {
    status = 'partial'
    messages.push('Outcome reminder check failed; queue processing continued.')
  }

  try {
    processNotificationQueue()
    messages.push('Processed eligible queued notifications.')
  } catch {
    status = 'partial'
    messages.push('Queue processing failed after notification source refresh.')
  }

  const completedAt = new Date().toISOString()
  const record: NotificationEngineRunRecord = {
    id: `notification-engine-${Date.now()}`,
    startedAt,
    completedAt,
    alertsBefore,
    alertsAfter: loadAlertHistory().length,
    remindersBefore,
    remindersAfter: loadOutcomeReminders().length,
    queueBefore,
    queueAfter: loadNotificationQueue().length,
    deliveriesBefore,
    deliveriesAfter: loadNotificationDeliveries().length,
    status,
    statusMessage: messages.join(' ')
  }

  saveNotificationEngineRun(record)
  return record
}
