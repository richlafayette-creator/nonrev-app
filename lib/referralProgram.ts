export const referralProgramStorageKey = 'nonrevy.referralProgram'

export type ReferralRewardKey = 'watchlist-upgrade' | 'premium-credits' | 'founding-member-perks'
export type ReferralInviteStatus = 'sent' | 'signed-up' | 'activated'

export type ReferralInvite = {
  id: string
  recipient: string
  channel: 'copy-link' | 'email' | 'sms-placeholder' | 'manual'
  status: ReferralInviteStatus
  sentAt: string
  signedUpAt?: string
  activatedAt?: string
}

export type ReferralReward = {
  key: ReferralRewardKey
  label: string
  description: string
  threshold: number
  metric: 'invites' | 'signups' | 'activated'
}

export type ReferralProgramState = {
  code: string
  createdAt: string
  updatedAt: string
  invites: ReferralInvite[]
}

export type ReferralProgress = {
  invitesSent: number
  signups: number
  activatedUsers: number
  rewards: Array<ReferralReward & { progress: number; unlocked: boolean; remaining: number }>
}

export const referralRewards: ReferralReward[] = [
  {
    key: 'watchlist-upgrade',
    label: 'Free watchlist upgrades',
    description: 'Unlock extra local watchlist capacity and monitoring room once provider billing exists.',
    threshold: 3,
    metric: 'activated'
  },
  {
    key: 'premium-credits',
    label: 'Future premium credits',
    description: 'Bank referral credit placeholders for paid intelligence or alerting features later.',
    threshold: 5,
    metric: 'signups'
  },
  {
    key: 'founding-member-perks',
    label: 'Founding member perks',
    description: 'Reserve early-member status for users who help bootstrap the nonrev network.',
    threshold: 10,
    metric: 'activated'
  }
]

function isBrowser() {
  return typeof window !== 'undefined'
}

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const randomValues = typeof crypto !== 'undefined' && 'getRandomValues' in crypto
    ? crypto.getRandomValues(new Uint8Array(6))
    : Array.from({ length: 6 }, () => Math.floor(Math.random() * 255))
  return `NRV-${Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('')}`
}

function normalizeInvite(invite: Partial<ReferralInvite>): ReferralInvite {
  const status = invite.status || 'sent'
  return {
    id: invite.id || `invite-${Date.now()}`,
    recipient: invite.recipient || 'Shared referral link',
    channel: invite.channel || 'manual',
    status,
    sentAt: invite.sentAt || new Date().toISOString(),
    signedUpAt: invite.signedUpAt || (status === 'signed-up' || status === 'activated' ? new Date().toISOString() : undefined),
    activatedAt: invite.activatedAt || (status === 'activated' ? new Date().toISOString() : undefined)
  }
}

function normalizeReferralState(value: Partial<ReferralProgramState> | null | undefined): ReferralProgramState {
  const now = new Date().toISOString()
  return {
    code: value?.code || randomCode(),
    createdAt: value?.createdAt || now,
    updatedAt: value?.updatedAt || now,
    invites: Array.isArray(value?.invites) ? value.invites.map(normalizeInvite) : []
  }
}

export function loadReferralProgramState(): ReferralProgramState {
  if (!isBrowser()) return normalizeReferralState(null)

  try {
    const stored = window.localStorage.getItem(referralProgramStorageKey)
    if (!stored) {
      const initial = normalizeReferralState(null)
      window.localStorage.setItem(referralProgramStorageKey, JSON.stringify(initial))
      return initial
    }
    return normalizeReferralState(JSON.parse(stored) as Partial<ReferralProgramState>)
  } catch {
    return normalizeReferralState(null)
  }
}

export function saveReferralProgramState(state: ReferralProgramState) {
  const normalized = normalizeReferralState({ ...state, updatedAt: new Date().toISOString() })
  if (!isBrowser()) return normalized
  window.localStorage.setItem(referralProgramStorageKey, JSON.stringify(normalized))
  window.dispatchEvent(new Event('nonrevy-referral-program-updated'))
  return normalized
}

export function referralLink(code: string) {
  const origin = isBrowser() ? window.location.origin : 'https://nonrevy.app'
  return `${origin}/?ref=${encodeURIComponent(code)}`
}

export function referralProgress(state: ReferralProgramState): ReferralProgress {
  const invitesSent = state.invites.length
  const signups = state.invites.filter((invite) => invite.status === 'signed-up' || invite.status === 'activated').length
  const activatedUsers = state.invites.filter((invite) => invite.status === 'activated').length
  const metricValues = { invites: invitesSent, signups, activated: activatedUsers }

  return {
    invitesSent,
    signups,
    activatedUsers,
    rewards: referralRewards.map((reward) => {
      const value = metricValues[reward.metric]
      return {
        ...reward,
        progress: Math.min(100, Math.round((value / reward.threshold) * 100)),
        unlocked: value >= reward.threshold,
        remaining: Math.max(0, reward.threshold - value)
      }
    })
  }
}

export function recordReferralInvite(recipient: string, channel: ReferralInvite['channel'], status: ReferralInviteStatus = 'sent') {
  const state = loadReferralProgramState()
  const now = new Date().toISOString()
  return saveReferralProgramState({
    ...state,
    invites: [
      {
        id: `${channel}-${Date.now()}`,
        recipient: recipient.trim() || 'Shared referral link',
        channel,
        status,
        sentAt: now,
        signedUpAt: status === 'signed-up' || status === 'activated' ? now : undefined,
        activatedAt: status === 'activated' ? now : undefined
      },
      ...state.invites
    ]
  })
}

export function updateReferralInviteStatus(inviteId: string, status: ReferralInviteStatus) {
  const state = loadReferralProgramState()
  const now = new Date().toISOString()
  return saveReferralProgramState({
    ...state,
    invites: state.invites.map((invite) => invite.id === inviteId
      ? {
        ...invite,
        status,
        signedUpAt: invite.signedUpAt || (status === 'signed-up' || status === 'activated' ? now : undefined),
        activatedAt: invite.activatedAt || (status === 'activated' ? now : undefined)
      }
      : invite
    )
  })
}
