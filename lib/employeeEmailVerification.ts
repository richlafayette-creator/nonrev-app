import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  airlineEmployers,
  companyEmailDomainAllowed,
  findAirlineEmployer,
  getEmployeeVerification,
  hashWorkEmail,
  upsertEmployeeVerification,
  type EmployeeVerificationRecord,
  type EmployeeVerificationStoreResult
} from './employeeVerification'
import { getVerificationEmailProvider, type VerificationEmailProvider } from './verificationEmailProvider'

export type EmailVerificationChallengeStatus = 'pending' | 'consumed' | 'expired' | 'locked'

export type EmailVerificationChallenge = {
  id: string
  userId: string
  verificationRecordId: string
  airlineCode: string
  airlineName: string
  emailDomain: string
  workEmailHash: string
  magicTokenHash: string
  codeHmac: string
  status: EmailVerificationChallengeStatus
  attemptCount: number
  sendCount: number
  createdAt: string
  expiresAt: string
  consumedAt?: string
  lastSentAt: string
  updatedAt: string
}

export type EmailVerificationPublicChallenge = {
  challengeId: string
  airlineCode: string
  airlineName: string
  emailDomain: string
  expiresAt: string
  sendCount: number
}

type SupabaseConfig = {
  supabaseUrl: string
  serviceRoleKey: string
}

type ChallengeStoreResult<T> = EmployeeVerificationStoreResult<T>

const challengeTableName = 'nonrevy_employee_email_verification_challenge'
const localChallengeStorePath = process.env.NONREVY_EMPLOYEE_EMAIL_CHALLENGE_LOCAL_STORE || join('/tmp', 'nonrevy-employee-email-challenges.json')

export const emailVerificationCodeAttemptLimit = 5
export const emailVerificationSendLimitPerHour = 5
export const emailVerificationResendCooldownSeconds = 60
export const emailVerificationTtlMinutes = 15

function nowIso() {
  return new Date().toISOString()
}

function addMinutesIso(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

export function normalizeWorkEmail(value: string) {
  return value.trim().toLowerCase()
}

export function workEmailDomain(value: string) {
  const normalized = normalizeWorkEmail(value)
  const parts = normalized.split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return ''
  return parts[1].replace(/^@/, '').replace(/[.]+$/, '')
}

function emailChallengeSecret(env: Record<string, string | undefined> = process.env) {
  return (env.NONREVY_EMAIL_VERIFICATION_SECRET || '').trim()
}

function appUrl(env: Record<string, string | undefined> = process.env) {
  return (env.NONREVY_PUBLIC_APP_URL || 'http://localhost:3000').trim().replace(/\/$/, '')
}

export function emailVerificationSecretConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(emailChallengeSecret(env))
}

function codeHmac(input: {
  challengeId: string
  userId: string
  airlineCode: string
  emailDomain: string
  code: string
}, env: Record<string, string | undefined> = process.env) {
  const secret = emailChallengeSecret(env)
  if (!secret) return ''
  return createHmac('sha256', secret)
    .update(`${input.challengeId}:${input.userId}:${input.airlineCode}:${input.emailDomain}:${input.code}`)
    .digest('hex')
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function constantTimeEqual(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  } catch {
    return false
  }
}

export function generateSixDigitVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function generateMagicLinkToken() {
  return randomBytes(32).toString('base64url')
}

function domainMatchesAnotherMappedAirline(airlineCode: string, domain: string) {
  const selectedCode = airlineCode.trim().toUpperCase()
  const matches = airlineEmployers.filter((employer) => employer.domains.some((allowedDomain) => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`)))
  return matches.some((employer) => employer.code !== selectedCode)
}

export function authoritativeEmailDomainDecision(airlineCode: string, workEmail: string) {
  const allowed = companyEmailDomainAllowed(airlineCode, workEmail)
  if (!allowed.employer) return { ok: false as const, reason: 'unknown-airline' as const, domain: allowed.domain, employer: null }
  if (!allowed.allowed) return { ok: false as const, reason: allowed.reason, domain: allowed.domain, employer: allowed.employer }
  if (domainMatchesAnotherMappedAirline(allowed.employer.code, allowed.domain)) {
    return { ok: false as const, reason: 'ambiguous-domain' as const, domain: allowed.domain, employer: allowed.employer }
  }
  return { ok: true as const, domain: allowed.domain, employer: allowed.employer }
}

function supabaseConfig(): SupabaseConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceRoleKey) return null
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ''), serviceRoleKey }
}

function headers(config: SupabaseConfig, extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra
  }
}

function encodeFilterValue(value: string) {
  return encodeURIComponent(value)
}

async function readJsonSafely(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function supabaseFetch(config: SupabaseConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: headers(config, init.headers || {}),
    cache: 'no-store'
  })
  const data = await readJsonSafely(response)
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'message' in data ? String(data.message) : `Supabase returned ${response.status}`
    throw new Error(message)
  }
  return data
}

function localResult<T>(data: T, detail = 'Email verification challenge is stored in the server-local beta fallback because Supabase service-role persistence is unavailable.'): ChallengeStoreResult<T> {
  return { status: 'missing-config', storageMode: 'server-local-fallback', data, detail }
}

function readLocalChallenges(): EmailVerificationChallenge[] {
  try {
    if (!existsSync(localChallengeStorePath)) return []
    const parsed = JSON.parse(readFileSync(localChallengeStorePath, 'utf8')) as unknown
    return Array.isArray(parsed) ? parsed.filter((row): row is EmailVerificationChallenge => Boolean(row && typeof row === 'object' && 'id' in row)) : []
  } catch {
    return []
  }
}

function writeLocalChallenges(rows: EmailVerificationChallenge[]) {
  writeFileSync(localChallengeStorePath, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 })
}

function challengeToRow(challenge: EmailVerificationChallenge) {
  return {
    id: challenge.id,
    user_id: challenge.userId,
    verification_record_id: challenge.verificationRecordId,
    airline_code: challenge.airlineCode,
    airline_name: challenge.airlineName,
    email_domain: challenge.emailDomain,
    work_email_hash: challenge.workEmailHash,
    magic_token_hash: challenge.magicTokenHash,
    code_hmac: challenge.codeHmac,
    status: challenge.status,
    attempt_count: challenge.attemptCount,
    send_count: challenge.sendCount,
    created_at: challenge.createdAt,
    expires_at: challenge.expiresAt,
    consumed_at: challenge.consumedAt,
    last_sent_at: challenge.lastSentAt,
    updated_at: challenge.updatedAt
  }
}

function rowToChallenge(row: any): EmailVerificationChallenge | null {
  if (!row) return null
  return {
    id: String(row.id),
    userId: String(row.user_id || row.userId),
    verificationRecordId: String(row.verification_record_id || row.verificationRecordId),
    airlineCode: String(row.airline_code || row.airlineCode),
    airlineName: String(row.airline_name || row.airlineName),
    emailDomain: String(row.email_domain || row.emailDomain),
    workEmailHash: String(row.work_email_hash || row.workEmailHash),
    magicTokenHash: String(row.magic_token_hash || row.magicTokenHash),
    codeHmac: String(row.code_hmac || row.codeHmac),
    status: row.status,
    attemptCount: Number(row.attempt_count ?? row.attemptCount ?? 0),
    sendCount: Number(row.send_count ?? row.sendCount ?? 0),
    createdAt: String(row.created_at || row.createdAt || nowIso()),
    expiresAt: String(row.expires_at || row.expiresAt || nowIso()),
    ...(row.consumed_at || row.consumedAt ? { consumedAt: String(row.consumed_at || row.consumedAt) } : {}),
    lastSentAt: String(row.last_sent_at || row.lastSentAt || nowIso()),
    updatedAt: String(row.updated_at || row.updatedAt || nowIso())
  }
}

async function upsertChallenge(challenge: EmailVerificationChallenge): Promise<ChallengeStoreResult<EmailVerificationChallenge>> {
  const config = supabaseConfig()
  const nextChallenge = { ...challenge, updatedAt: nowIso() }
  if (!config) {
    const rows = readLocalChallenges().filter((row) => row.id !== nextChallenge.id)
    writeLocalChallenges([nextChallenge, ...rows])
    return localResult(nextChallenge)
  }
  try {
    const rows = await supabaseFetch(config, `${challengeTableName}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([challengeToRow(nextChallenge)])
    }) as any[]
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: rowToChallenge(rows[0]) || nextChallenge,
      detail: 'Email verification challenge persisted to Supabase.'
    }
  } catch {
    const rows = readLocalChallenges().filter((row) => row.id !== nextChallenge.id)
    writeLocalChallenges([nextChallenge, ...rows])
    return {
      status: 'unreachable',
      storageMode: 'server-local-fallback',
      data: nextChallenge,
      detail: 'Email verification challenge store is unavailable; using server-local beta fallback.'
    }
  }
}

export async function getEmailVerificationChallenge(challengeId: string): Promise<ChallengeStoreResult<EmailVerificationChallenge | null>> {
  const config = supabaseConfig()
  if (!config) return localResult(readLocalChallenges().find((row) => row.id === challengeId) || null)
  try {
    const rows = await supabaseFetch(config, `${challengeTableName}?select=*&id=eq.${encodeFilterValue(challengeId)}&limit=1`) as any[]
    return { status: 'ready', storageMode: 'supabase', data: rowToChallenge(rows[0]), detail: 'Email verification challenge loaded from Supabase.' }
  } catch {
    return {
      status: 'unreachable',
      storageMode: 'server-local-fallback',
      data: readLocalChallenges().find((row) => row.id === challengeId) || null,
      detail: 'Email verification challenge store is unavailable; using server-local beta fallback.'
    }
  }
}

async function consumeChallenge(challenge: EmailVerificationChallenge): Promise<ChallengeStoreResult<EmailVerificationChallenge | null>> {
  const now = nowIso()
  const consumed = { ...challenge, status: 'consumed' as const, consumedAt: now, updatedAt: now }
  const config = supabaseConfig()
  if (!config) {
    const rows = readLocalChallenges()
    const current = rows.find((row) => row.id === challenge.id)
    if (!current || current.status !== 'pending' || current.consumedAt) return localResult(null)
    writeLocalChallenges([consumed, ...rows.filter((row) => row.id !== challenge.id)])
    return localResult(consumed)
  }
  try {
    const rows = await supabaseFetch(config, `${challengeTableName}?id=eq.${encodeFilterValue(challenge.id)}&status=eq.pending&consumed_at=is.null`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'consumed',
        consumed_at: now,
        updated_at: now
      })
    }) as any[]
    return {
      status: 'ready',
      storageMode: 'supabase',
      data: rowToChallenge(rows[0]),
      detail: 'Email verification challenge consumed.'
    }
  } catch {
    const rows = readLocalChallenges()
    const current = rows.find((row) => row.id === challenge.id)
    if (!current || current.status !== 'pending' || current.consumedAt) {
      return { status: 'unreachable', storageMode: 'server-local-fallback', data: null, detail: 'Email verification challenge store is unavailable; using server-local beta fallback.' }
    }
    writeLocalChallenges([consumed, ...rows.filter((row) => row.id !== challenge.id)])
    return { status: 'unreachable', storageMode: 'server-local-fallback', data: consumed, detail: 'Email verification challenge store is unavailable; using server-local beta fallback.' }
  }
}

function publicChallenge(challenge: EmailVerificationChallenge): EmailVerificationPublicChallenge {
  return {
    challengeId: challenge.id,
    airlineCode: challenge.airlineCode,
    airlineName: challenge.airlineName,
    emailDomain: challenge.emailDomain,
    expiresAt: challenge.expiresAt,
    sendCount: challenge.sendCount
  }
}

export function magicLinkUrl(input: { challengeId: string; token: string }, env: Record<string, string | undefined> = process.env) {
  const url = new URL('/verify/email', appUrl(env))
  url.searchParams.set('challenge', input.challengeId)
  url.searchParams.set('token', input.token)
  return url.toString()
}

export async function startEmailVerificationChallenge(input: {
  userId: string
  airlineCode: string
  workEmail: string
  env?: Record<string, string | undefined>
  provider?: VerificationEmailProvider
}) {
  const env = input.env || process.env
  if (!emailVerificationSecretConfigured(env)) {
    return { ok: false as const, status: 503, reason: 'missing-secret' as const, error: 'Email verification is not configured yet. Request manual review instead.' }
  }
  const normalizedEmail = normalizeWorkEmail(input.workEmail)
  const domain = workEmailDomain(normalizedEmail)
  const decision = authoritativeEmailDomainDecision(input.airlineCode, normalizedEmail)
  if (!decision.ok) {
    if (decision.reason === 'no-approved-domain') {
      return { ok: false as const, status: 400, reason: decision.reason, error: 'Company email verification is not available for this airline yet. Request manual review instead.' }
    }
    return { ok: false as const, status: 400, reason: decision.reason, error: 'That work email cannot be verified automatically for the selected airline. Request manual review if your airline uses another system.' }
  }
  if (!domain) {
    return { ok: false as const, status: 400, reason: 'missing-domain' as const, error: 'Enter a valid work email address.' }
  }

  const now = nowIso()
  const verificationRecordId = `${input.userId}:employee-verification`
  const record: EmployeeVerificationRecord = {
    id: verificationRecordId,
    userId: input.userId,
    status: 'pending',
    airlineCode: decision.employer.code,
    airlineName: decision.employer.name,
    method: 'company_email',
    emailDomain: decision.domain,
    workEmailHash: hashWorkEmail(normalizedEmail, env),
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
    reviewSource: 'company-email-challenge-sent'
  }
  const verificationResult = await upsertEmployeeVerification(record)
  const code = generateSixDigitVerificationCode()
  const token = generateMagicLinkToken()
  const challengeId = randomUUID()
  const challenge: EmailVerificationChallenge = {
    id: challengeId,
    userId: input.userId,
    verificationRecordId,
    airlineCode: decision.employer.code,
    airlineName: decision.employer.name,
    emailDomain: decision.domain,
    workEmailHash: hashWorkEmail(normalizedEmail, env),
    magicTokenHash: tokenHash(token),
    codeHmac: codeHmac({ challengeId, userId: input.userId, airlineCode: decision.employer.code, emailDomain: decision.domain, code }, env),
    status: 'pending',
    attemptCount: 0,
    sendCount: 1,
    createdAt: now,
    expiresAt: addMinutesIso(emailVerificationTtlMinutes),
    lastSentAt: now,
    updatedAt: now
  }
  const challengeResult = await upsertChallenge(challenge)
  const provider = input.provider || getVerificationEmailProvider(env)
  const emailResult = await provider.sendVerificationEmail({
    to: normalizedEmail,
    airlineName: decision.employer.name,
    code,
    magicLinkUrl: magicLinkUrl({ challengeId, token }, env),
    expiresAt: challenge.expiresAt
  })
  if (!emailResult.ok) {
    return {
      ok: false as const,
      status: emailResult.reason === 'missing-config' ? 503 : 502,
      reason: emailResult.reason,
      error: emailResult.detail,
      verification: verificationResult.data,
      challenge: publicChallenge(challengeResult.data)
    }
  }
  return {
    ok: true as const,
    verification: verificationResult.data,
    challenge: publicChallenge(challengeResult.data),
    emailProvider: emailResult.provider
  }
}

export async function resendEmailVerificationChallenge(input: {
  userId: string
  challengeId: string
  workEmail: string
  env?: Record<string, string | undefined>
  provider?: VerificationEmailProvider
}) {
  const env = input.env || process.env
  if (!emailVerificationSecretConfigured(env)) {
    return { ok: false as const, status: 503, error: 'Email verification is not configured yet. Request manual review instead.' }
  }
  const loaded = await getEmailVerificationChallenge(input.challengeId)
  const challenge = loaded.data
  if (!challenge || challenge.userId !== input.userId || challenge.status !== 'pending' || challenge.consumedAt) {
    return { ok: false as const, status: 400, error: 'Verification challenge is no longer available. Send a new verification email.' }
  }
  const normalizedEmail = normalizeWorkEmail(input.workEmail)
  if (workEmailDomain(normalizedEmail) !== challenge.emailDomain || hashWorkEmail(normalizedEmail, env) !== challenge.workEmailHash) {
    return { ok: false as const, status: 400, error: 'Enter the same work email address used for this verification challenge.' }
  }
  if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
    await upsertChallenge({ ...challenge, status: 'expired' })
    return { ok: false as const, status: 400, error: 'Verification challenge expired. Send a new verification email.' }
  }
  if (Date.now() - new Date(challenge.lastSentAt).getTime() < emailVerificationResendCooldownSeconds * 1000) {
    return { ok: false as const, status: 429, error: 'Please wait before resending the verification email.' }
  }
  if (challenge.sendCount >= emailVerificationSendLimitPerHour) {
    return { ok: false as const, status: 429, error: 'Too many verification emails were requested. Try again later or request manual review.' }
  }
  const record = (await getEmployeeVerification(input.userId)).data
  if (!record || record.id !== challenge.verificationRecordId || record.status === 'verified') {
    return { ok: false as const, status: 400, error: 'Verification challenge is no longer available. Send a new verification email.' }
  }
  const decision = authoritativeEmailDomainDecision(challenge.airlineCode, `user@${challenge.emailDomain}`)
  if (!decision.ok) {
    return { ok: false as const, status: 400, error: 'This airline now requires manual review.' }
  }
  const code = generateSixDigitVerificationCode()
  const token = generateMagicLinkToken()
  const updated = {
    ...challenge,
    magicTokenHash: tokenHash(token),
    codeHmac: codeHmac({ challengeId: challenge.id, userId: challenge.userId, airlineCode: challenge.airlineCode, emailDomain: challenge.emailDomain, code }, env),
    sendCount: challenge.sendCount + 1,
    attemptCount: 0,
    lastSentAt: nowIso(),
    expiresAt: addMinutesIso(emailVerificationTtlMinutes),
    updatedAt: nowIso()
  }
  const saved = await upsertChallenge(updated)
  const provider = input.provider || getVerificationEmailProvider(env)
  const emailResult = await provider.sendVerificationEmail({
    to: normalizedEmail,
    airlineName: challenge.airlineName,
    code,
    magicLinkUrl: magicLinkUrl({ challengeId: challenge.id, token }, env),
    expiresAt: updated.expiresAt
  })
  if (!emailResult.ok) {
    return { ok: false as const, status: emailResult.reason === 'missing-config' ? 503 : 502, error: emailResult.detail, challenge: publicChallenge(saved.data) }
  }
  return { ok: true as const, challenge: publicChallenge(saved.data), emailProvider: emailResult.provider }
}

async function markVerifiedFromEmailChallenge(challenge: EmailVerificationChallenge) {
  const existing = (await getEmployeeVerification(challenge.userId)).data
  if (!existing || existing.id !== challenge.verificationRecordId || existing.status === 'verified') return existing
  const now = nowIso()
  const record: EmployeeVerificationRecord = {
    ...existing,
    status: 'verified',
    method: 'company_email',
    airlineCode: challenge.airlineCode,
    airlineName: challenge.airlineName,
    emailDomain: challenge.emailDomain,
    workEmailHash: challenge.workEmailHash,
    verifiedAt: now,
    reviewedAt: now,
    reviewedBy: 'system:email-challenge',
    reviewSource: 'company_email_challenge',
    reasonCategory: 'automated-company-email',
    updatedAt: now
  }
  return (await upsertEmployeeVerification(record)).data
}

async function validateChallengeForConsumption(input: {
  userId: string
  challengeId: string
}) {
  const loaded = await getEmailVerificationChallenge(input.challengeId)
  const challenge = loaded.data
  if (!challenge || challenge.userId !== input.userId || challenge.status !== 'pending' || challenge.consumedAt) {
    return { ok: false as const, status: 400, error: 'Verification challenge is no longer valid.' }
  }
  if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
    await upsertChallenge({ ...challenge, status: 'expired' })
    return { ok: false as const, status: 400, error: 'Verification challenge expired. Send a new verification email.' }
  }
  const decision = authoritativeEmailDomainDecision(challenge.airlineCode, `user@${challenge.emailDomain}`)
  if (!decision.ok) {
    return { ok: false as const, status: 400, error: 'This airline now requires manual review.' }
  }
  return { ok: true as const, challenge }
}

export async function verifyEmailChallengeCode(input: {
  userId: string
  challengeId: string
  code: string
  env?: Record<string, string | undefined>
}) {
  const env = input.env || process.env
  if (!emailVerificationSecretConfigured(env)) {
    return { ok: false as const, status: 503, error: 'Email verification is not configured yet. Request manual review instead.' }
  }
  const validation = await validateChallengeForConsumption(input)
  if (!validation.ok) return validation
  const challenge = validation.challenge
  const normalizedCode = input.code.trim()
  if (!/^\d{6}$/.test(normalizedCode)) {
    return { ok: false as const, status: 400, error: 'Enter the six-digit verification code.' }
  }
  const expected = codeHmac({ challengeId: challenge.id, userId: challenge.userId, airlineCode: challenge.airlineCode, emailDomain: challenge.emailDomain, code: normalizedCode }, env)
  if (!expected || !constantTimeEqual(expected, challenge.codeHmac)) {
    const attempts = challenge.attemptCount + 1
    const nextStatus = attempts >= emailVerificationCodeAttemptLimit ? 'locked' : challenge.status
    await upsertChallenge({ ...challenge, attemptCount: attempts, status: nextStatus })
    return { ok: false as const, status: attempts >= emailVerificationCodeAttemptLimit ? 429 : 400, error: attempts >= emailVerificationCodeAttemptLimit ? 'Too many failed attempts. Send a new verification email or request manual review.' : 'Verification code was not accepted.' }
  }
  const consumed = await consumeChallenge(challenge)
  if (!consumed.data) return { ok: false as const, status: 400, error: 'Verification challenge is no longer valid.' }
  const record = await markVerifiedFromEmailChallenge(challenge)
  return { ok: true as const, verification: record }
}

export async function verifyEmailMagicLink(input: {
  userId: string
  challengeId: string
  token: string
  env?: Record<string, string | undefined>
}) {
  const env = input.env || process.env
  if (!emailVerificationSecretConfigured(env)) {
    return { ok: false as const, status: 503, error: 'Email verification is not configured yet. Request manual review instead.' }
  }
  const validation = await validateChallengeForConsumption(input)
  if (!validation.ok) return validation
  const challenge = validation.challenge
  if (!input.token || !constantTimeEqual(tokenHash(input.token), challenge.magicTokenHash)) {
    return { ok: false as const, status: 400, error: 'Verification link could not be used.' }
  }
  const consumed = await consumeChallenge(challenge)
  if (!consumed.data) return { ok: false as const, status: 400, error: 'Verification challenge is no longer valid.' }
  const record = await markVerifiedFromEmailChallenge(challenge)
  return { ok: true as const, verification: record }
}
