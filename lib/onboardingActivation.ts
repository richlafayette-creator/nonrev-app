import { loadNotificationPreferences, notificationPreferencesStorageKey, enabledNotificationChannels } from './notificationDelivery'
import { loadSavedItineraryComparisons } from './savedItineraryComparisons'
import { loadSavedTripWatchlist } from './watchlist'
import { loadTripOutcomes } from './tripOutcomes'
import {
  defaultTravelerProfile,
  loadTravelerProfileFromStorage,
  normalizeTravelerProfile,
  parseAirportList,
  saveTravelerProfileToStorage,
  travelerProfileStorageKey,
  type TravelerProfileScaffold,
  type TravelerType
} from './travelerProfile'

export const onboardingStorageKey = 'nonrevy.onboarding'
export const activationProgressStorageKey = 'nonrevy.activationProgress'

export type OnboardingState = {
  employeeAirline: string
  travelerType: TravelerType
  passPriority: string
  homeAirport: string
  preferredDestinations: string[]
  completedAt?: string
  updatedAt: string
}

export type ActivationStepKey =
  | 'completeProfile'
  | 'runFirstTripPlan'
  | 'saveFirstWatchlist'
  | 'enableNotifications'
  | 'recordFirstOutcome'

export type ActivationStep = {
  key: ActivationStepKey
  label: string
  completed: boolean
  detail: string
  href: string
}

export type ActivationProgress = {
  score: number
  completedCount: number
  totalCount: number
  steps: ActivationStep[]
  onboardingCompleted: boolean
  lastUpdated: string
}

const activationStepLabels: Record<ActivationStepKey, string> = {
  completeProfile: 'Complete profile',
  runFirstTripPlan: 'Run first trip plan',
  saveFirstWatchlist: 'Save first watchlist',
  enableNotifications: 'Enable notifications',
  recordFirstOutcome: 'Record first outcome'
}

export const defaultOnboardingState: OnboardingState = {
  employeeAirline: defaultTravelerProfile.employeeAirline,
  travelerType: defaultTravelerProfile.travelerType,
  passPriority: defaultTravelerProfile.passPriority,
  homeAirport: defaultTravelerProfile.homeAirport,
  preferredDestinations: defaultTravelerProfile.preferredAirports,
  updatedAt: new Date(0).toISOString()
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function normalizeOnboardingState(value: Partial<OnboardingState> | null | undefined): OnboardingState {
  return {
    ...defaultOnboardingState,
    ...value,
    employeeAirline: value?.employeeAirline || defaultOnboardingState.employeeAirline,
    travelerType: value?.travelerType || defaultOnboardingState.travelerType,
    passPriority: (value?.passPriority || defaultOnboardingState.passPriority).toUpperCase(),
    homeAirport: (value?.homeAirport || defaultOnboardingState.homeAirport).toUpperCase(),
    preferredDestinations: value?.preferredDestinations?.length
      ? value.preferredDestinations.map((airport) => airport.toUpperCase())
      : defaultOnboardingState.preferredDestinations,
    updatedAt: value?.updatedAt || new Date().toISOString()
  }
}

export function loadOnboardingState(): OnboardingState {
  if (!isBrowser()) return defaultOnboardingState

  try {
    const stored = window.localStorage.getItem(onboardingStorageKey)
    if (!stored) return defaultOnboardingState
    return normalizeOnboardingState(JSON.parse(stored) as Partial<OnboardingState>)
  } catch {
    return defaultOnboardingState
  }
}

export function onboardingStateToTravelerProfile(state: OnboardingState): TravelerProfileScaffold {
  return normalizeTravelerProfile({
    employeeAirline: state.employeeAirline,
    travelerType: state.travelerType,
    passPriority: state.passPriority,
    homeAirport: state.homeAirport,
    preferredAirports: state.preferredDestinations
  })
}

export function saveOnboardingState(state: OnboardingState, complete = false) {
  const normalized = normalizeOnboardingState({
    ...state,
    completedAt: complete ? new Date().toISOString() : state.completedAt,
    updatedAt: new Date().toISOString()
  })

  if (!isBrowser()) return normalized

  window.localStorage.setItem(onboardingStorageKey, JSON.stringify(normalized))
  saveTravelerProfileToStorage(onboardingStateToTravelerProfile(normalized))
  window.dispatchEvent(new Event('nonrevy-onboarding-updated'))
  window.dispatchEvent(new Event('nonrevy-activation-progress-updated'))
  return normalized
}

export function markActivationStep(step: ActivationStepKey) {
  if (!isBrowser()) return
  const stored = loadActivationMarkers()
  const next = { ...stored, [step]: new Date().toISOString() }
  window.localStorage.setItem(activationProgressStorageKey, JSON.stringify(next))
  window.dispatchEvent(new Event('nonrevy-activation-progress-updated'))
}

function loadActivationMarkers(): Partial<Record<ActivationStepKey, string>> {
  if (!isBrowser()) return {}

  try {
    const stored = window.localStorage.getItem(activationProgressStorageKey)
    if (!stored) return {}
    return JSON.parse(stored) as Partial<Record<ActivationStepKey, string>>
  } catch {
    return {}
  }
}

function hasStoredTravelerProfile(profile: TravelerProfileScaffold) {
  if (!isBrowser()) return false
  return Boolean(window.localStorage.getItem(travelerProfileStorageKey)) && Boolean(profile.employeeAirline && profile.travelerType && profile.passPriority && profile.homeAirport && profile.preferredAirports.length)
}

function hasExplicitNotificationPreference() {
  if (!isBrowser()) return false
  return Boolean(window.localStorage.getItem(notificationPreferencesStorageKey)) && enabledNotificationChannels(loadNotificationPreferences()).length > 0
}

export function calculateActivationProgress(): ActivationProgress {
  const onboarding = loadOnboardingState()
  const profile = loadTravelerProfileFromStorage()
  const markers = loadActivationMarkers()
  const savedPlans = loadSavedItineraryComparisons()
  const watchlist = loadSavedTripWatchlist()
  const outcomes = loadTripOutcomes()

  const steps: ActivationStep[] = [
    {
      key: 'completeProfile',
      label: activationStepLabels.completeProfile,
      completed: Boolean(onboarding.completedAt) || hasStoredTravelerProfile(profile),
      detail: profile.employeeAirline && profile.homeAirport ? `${profile.employeeAirline} · ${profile.travelerType} · ${profile.homeAirport}` : 'Add airline, priority, home airport, and destinations.',
      href: '/onboarding'
    },
    {
      key: 'runFirstTripPlan',
      label: activationStepLabels.runFirstTripPlan,
      completed: Boolean(markers.runFirstTripPlan) || savedPlans.length > 0,
      detail: savedPlans.length ? `${savedPlans.length} saved plan${savedPlans.length === 1 ? '' : 's'} available.` : 'Search or describe your first trip.',
      href: '/plan'
    },
    {
      key: 'saveFirstWatchlist',
      label: activationStepLabels.saveFirstWatchlist,
      completed: watchlist.length > 0,
      detail: watchlist.length ? `${watchlist.length} watched route${watchlist.length === 1 ? '' : 's'} saved.` : 'Save a route to monitor confidence and alerts.',
      href: '/watchlist'
    },
    {
      key: 'enableNotifications',
      label: activationStepLabels.enableNotifications,
      completed: hasExplicitNotificationPreference(),
      detail: hasExplicitNotificationPreference() ? 'Notification preferences saved locally.' : 'Confirm at least one notification channel.',
      href: '/notification-preferences'
    },
    {
      key: 'recordFirstOutcome',
      label: activationStepLabels.recordFirstOutcome,
      completed: outcomes.length > 0,
      detail: outcomes.length ? `${outcomes.length} outcome${outcomes.length === 1 ? '' : 's'} recorded.` : 'Log whether you got on after a trip.',
      href: '/outcomes'
    }
  ]

  const completedCount = steps.filter((step) => step.completed).length
  const totalCount = steps.length

  return {
    score: Math.round((completedCount / totalCount) * 100),
    completedCount,
    totalCount,
    steps,
    onboardingCompleted: Boolean(onboarding.completedAt),
    lastUpdated: new Date().toISOString()
  }
}

export function parsePreferredDestinations(value: string) {
  return parseAirportList(value)
}
