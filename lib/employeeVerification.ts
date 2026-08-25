import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type EmployeeVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired' | 'reverify_required'
export type EmployeeVerificationMethod = 'company_email' | 'manual_review' | 'operator_verified'

export type AirlineEmployer = {
  code: string
  name: string
  domains: string[]
  manualReviewAvailable?: boolean
}

export type EmployeeVerificationRecord = {
  id: string
  userId: string
  status: EmployeeVerificationStatus
  airlineCode: string
  airlineName: string
  method: EmployeeVerificationMethod
  emailDomain?: string
  workEmailHash?: string
  submittedAt: string
  verifiedAt?: string
  expiresAt?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewSource?: string
  reasonCategory?: string
  createdAt: string
  updatedAt: string
}

export type EmployeeVerificationStoreResult<T> = {
  status: 'ready' | 'missing-config' | 'unreachable'
  storageMode: 'supabase' | 'server-local-fallback'
  data: T
  detail: string
}

type SupabaseConfig = {
  supabaseUrl: string
  serviceRoleKey: string
}

const verificationTableName = 'nonrevy_employee_verification'
const localStorePath = process.env.NONREVY_EMPLOYEE_VERIFICATION_LOCAL_STORE || join('/tmp', 'nonrevy-employee-verification.json')

export const airlineEmployers: AirlineEmployer[] = [
  { code: 'AA', name: 'American Airlines', domains: ['aa.com', 'americanairlines.com'] },
  { code: 'AC', name: 'Air Canada', domains: ['aircanada.ca', 'aircanada.com'] },
  { code: 'AF', name: 'Air France', domains: ['airfrance.fr', 'airfrance.com'] },
  { code: 'AS', name: 'Alaska Airlines', domains: ['alaskaair.com'] },
  { code: 'BA', name: 'British Airways', domains: ['ba.com', 'britishairways.com'] },
  { code: 'B6', name: 'JetBlue', domains: ['jetblue.com'] },
  { code: 'DL', name: 'Delta Air Lines', domains: ['delta.com'] },
  { code: 'EK', name: 'Emirates', domains: ['emirates.com'] },
  { code: 'F9', name: 'Frontier Airlines', domains: ['flyfrontier.com'] },
  { code: 'HA', name: 'Hawaiian Airlines', domains: ['hawaiianair.com'] },
  { code: 'JL', name: 'Japan Airlines', domains: ['jal.com'] },
  { code: 'KL', name: 'KLM Royal Dutch Airlines', domains: ['klm.com'] },
  { code: 'LH', name: 'Lufthansa', domains: ['dlh.de', 'lufthansa.com'] },
  { code: 'NH', name: 'All Nippon Airways', domains: ['ana.co.jp'] },
  { code: 'NK', name: 'Spirit Airlines', domains: ['spirit.com'] },
  { code: 'QF', name: 'Qantas', domains: ['qantas.com.au', 'qantas.com'] },
  { code: 'QR', name: 'Qatar Airways', domains: ['qatarairways.com.qa', 'qatarairways.com'] },
  { code: 'UA', name: 'United Airlines', domains: ['united.com', 'unitedairlines.com'] },
  { code: 'WN', name: 'Southwest Airlines', domains: ['wnco.com', 'southwest.com'] }
]

function nowIso() {
  return new Date().toISOString()
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
}

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^@/, '').replace(/[.]+$/, '')
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function emailDomain(email: string) {
  const normalized = normalizeEmail(email)
  const domain = normalized.split('@')[1] || ''
  return normalizeDomain(domain)
}

export function findAirlineEmployer(value: string) {
  const normalizedCode = normalizeCode(value)
  const normalizedName = value.trim().toLowerCase()
  return airlineEmployers.find((employer) => (
    employer.code === normalizedCode ||
    employer.name.toLowerCase() === normalizedName ||
    employer.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedName.replace(/[^a-z0-9]/g, '')
  )) || null
}

export function airlineOptionsForSelect() {
  return airlineEmployers.map((employer) => ({ code: employer.code, name: employer.name }))
}

export function companyEmailDomainAllowed(airlineCode: string, workEmail: string) {
  const employer = findAirlineEmployer(airlineCode)
  const domain = emailDomain(workEmail)
  if (!employer || !domain) return { allowed: false, domain, employer }
  return {
    allowed: employer.domains.some((allowedDomain) => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`)),
    domain,
    employer
  }
}

export function hashWorkEmail(workEmail: string, env: Record<string, string | undefined> = process.env) {
  const salt = env.NONREVY_VERIFICATION_HASH_SALT || env.NONREVY_OPERATOR_ACCESS_TOKEN || env.SUPABASE_SERVICE_ROLE_KEY || 'nonrevy-beta-verification'
  return createHash('sha256').update(`${normalizeEmail(workEmail)}:${salt}`).digest('hex')
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

function emptyLocalRows(): EmployeeVerificationRecord[] {
  return []
}

function readLocalRows(): EmployeeVerificationRecord[] {
  try {
    if (!existsSync(localStorePath)) return emptyLocalRows()
    const parsed = JSON.parse(readFileSync(localStorePath, 'utf8')) as unknown
    return Array.isArray(parsed) ? parsed.filter((row): row is EmployeeVerificationRecord => Boolean(row && typeof row === 'object' && 'userId' in row)) : emptyLocalRows()
  } catch {
    return emptyLocalRows()
  }
}

function writeLocalRows(rows: EmployeeVerificationRecord[]) {
  writeFileSync(localStorePath, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 })
}

function newestRecord(records: EmployeeVerificationRecord[]) {
  return [...records].sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0] || null
}

function localResult<T>(data: T, detail = 'Verification is stored in the server-local beta fallback because Supabase service-role persistence is unavailable.'): EmployeeVerificationStoreResult<T> {
  return { status: 'missing-config', storageMode: 'server-local-fallback', data, detail }
}

export async function getEmployeeVerification(userId: string): Promise<EmployeeVerificationStoreResult<EmployeeVerificationRecord | null>> {
  const config = supabaseConfig()
  if (!config) return localResult(newestRecord(readLocalRows().filter((row) => row.userId === userId)))
  try {
    const rows = await supabaseFetch(config, `${verificationTableName}?select=*&user_id=eq.${encodeFilterValue(userId)}&order=updated_at.desc&limit=1`) as any[]
    return { status: 'ready', storageMode: 'supabase', data: rowToRecord(rows[0]) || null, detail: 'Verification loaded from Supabase.' }
  } catch {
    return { status: 'unreachable', storageMode: 'server-local-fallback', data: newestRecord(readLocalRows().filter((row) => row.userId === userId)), detail: 'Verification account store is unavailable; using server-local beta fallback.' }
  }
}

export async function listPendingEmployeeVerifications(limit = 100): Promise<EmployeeVerificationStoreResult<EmployeeVerificationRecord[]>> {
  const boundedLimit = Math.max(1, Math.min(200, Math.round(limit)))
  const config = supabaseConfig()
  if (!config) return localResult(readLocalRows().filter((row) => row.status === 'pending').slice(0, boundedLimit))
  try {
    const rows = await supabaseFetch(config, `${verificationTableName}?select=*&status=eq.pending&order=submitted_at.asc&limit=${boundedLimit}`) as any[]
    return { status: 'ready', storageMode: 'supabase', data: rows.map(rowToRecord).filter((row): row is EmployeeVerificationRecord => Boolean(row)), detail: 'Pending verifications loaded from Supabase.' }
  } catch {
    return { status: 'unreachable', storageMode: 'server-local-fallback', data: readLocalRows().filter((row) => row.status === 'pending').slice(0, boundedLimit), detail: 'Verification account store is unavailable; using server-local beta fallback.' }
  }
}

export async function upsertEmployeeVerification(record: EmployeeVerificationRecord): Promise<EmployeeVerificationStoreResult<EmployeeVerificationRecord>> {
  const config = supabaseConfig()
  const nextRecord = { ...record, updatedAt: nowIso() }
  if (!config) {
    const rows = readLocalRows().filter((row) => row.id !== nextRecord.id)
    writeLocalRows([nextRecord, ...rows])
    return localResult(nextRecord)
  }
  try {
    const rows = await supabaseFetch(config, `${verificationTableName}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([{
        id: nextRecord.id,
        user_id: nextRecord.userId,
        status: nextRecord.status,
        airline_code: nextRecord.airlineCode,
        airline_name: nextRecord.airlineName,
        method: nextRecord.method,
        email_domain: nextRecord.emailDomain,
        work_email_hash: nextRecord.workEmailHash,
        submitted_at: nextRecord.submittedAt,
        verified_at: nextRecord.verifiedAt,
        expires_at: nextRecord.expiresAt,
        reviewed_at: nextRecord.reviewedAt,
        reviewed_by: nextRecord.reviewedBy,
        review_source: nextRecord.reviewSource,
        reason_category: nextRecord.reasonCategory,
        created_at: nextRecord.createdAt,
        updated_at: nextRecord.updatedAt
      }])
    }) as any[]
    const saved = rows[0]
    return { status: 'ready', storageMode: 'supabase', data: rowToRecord(saved) || nextRecord, detail: 'Verification persisted to Supabase.' }
  } catch {
    const rows = readLocalRows().filter((row) => row.id !== nextRecord.id)
    writeLocalRows([nextRecord, ...rows])
    return { status: 'unreachable', storageMode: 'server-local-fallback', data: nextRecord, detail: 'Verification account store is unavailable; using server-local beta fallback.' }
  }
}

function rowToRecord(row: any): EmployeeVerificationRecord | null {
  if (!row) return null
  return {
    id: String(row.id),
    userId: String(row.user_id || row.userId),
    status: row.status,
    airlineCode: String(row.airline_code || row.airlineCode),
    airlineName: String(row.airline_name || row.airlineName),
    method: row.method,
    ...(row.email_domain || row.emailDomain ? { emailDomain: String(row.email_domain || row.emailDomain) } : {}),
    ...(row.work_email_hash || row.workEmailHash ? { workEmailHash: String(row.work_email_hash || row.workEmailHash) } : {}),
    submittedAt: String(row.submitted_at || row.submittedAt || nowIso()),
    ...(row.verified_at || row.verifiedAt ? { verifiedAt: String(row.verified_at || row.verifiedAt) } : {}),
    ...(row.expires_at || row.expiresAt ? { expiresAt: String(row.expires_at || row.expiresAt) } : {}),
    ...(row.reviewed_at || row.reviewedAt ? { reviewedAt: String(row.reviewed_at || row.reviewedAt) } : {}),
    ...(row.reviewed_by || row.reviewedBy ? { reviewedBy: String(row.reviewed_by || row.reviewedBy) } : {}),
    ...(row.review_source || row.reviewSource ? { reviewSource: String(row.review_source || row.reviewSource) } : {}),
    ...(row.reason_category || row.reasonCategory ? { reasonCategory: String(row.reason_category || row.reasonCategory) } : {}),
    createdAt: String(row.created_at || row.createdAt || nowIso()),
    updatedAt: String(row.updated_at || row.updatedAt || nowIso())
  }
}

export function createPendingCompanyEmailVerification(input: { userId: string; airlineCode: string; workEmail: string }) {
  const allowed = companyEmailDomainAllowed(input.airlineCode, input.workEmail)
  if (!allowed.employer) return { ok: false as const, error: 'Choose a supported airline or request manual review.' }
  if (!allowed.allowed) return { ok: false as const, error: 'That work email domain is not approved for the selected airline. Request manual review if your airline uses another system.' }
  const now = nowIso()
  const record: EmployeeVerificationRecord = {
    id: `${input.userId}:employee-verification`,
    userId: input.userId,
    status: 'pending',
    airlineCode: allowed.employer.code,
    airlineName: allowed.employer.name,
    method: 'company_email',
    emailDomain: allowed.domain,
    workEmailHash: hashWorkEmail(input.workEmail),
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
    reviewSource: 'company-email-domain-validated'
  }
  return { ok: true as const, record }
}

export function createPendingManualVerification(input: { userId: string; airlineCode: string; reasonCategory?: string }) {
  const employer = findAirlineEmployer(input.airlineCode)
  if (!employer) return { ok: false as const, error: 'Choose a supported airline before requesting review.' }
  const now = nowIso()
  const record: EmployeeVerificationRecord = {
    id: `${input.userId}:employee-verification`,
    userId: input.userId,
    status: 'pending',
    airlineCode: employer.code,
    airlineName: employer.name,
    method: 'manual_review',
    reasonCategory: input.reasonCategory || 'manual-review-requested',
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
    reviewSource: 'manual-review-request'
  }
  return { ok: true as const, record }
}

export function reviewEmployeeVerification(input: {
  existing: EmployeeVerificationRecord | null
  targetUserId: string
  airlineCode?: string
  status: Extract<EmployeeVerificationStatus, 'verified' | 'rejected' | 'reverify_required'>
  reviewerId: string
  reasonCategory?: string
}) {
  const employer = findAirlineEmployer(input.airlineCode || input.existing?.airlineCode || '')
  if (!input.existing && !employer) return { ok: false as const, error: 'A supported airline is required for manual verification.' }
  const now = nowIso()
  const base: EmployeeVerificationRecord = input.existing || {
    id: `${input.targetUserId}:employee-verification`,
    userId: input.targetUserId,
    status: 'pending',
    airlineCode: employer!.code,
    airlineName: employer!.name,
    method: 'operator_verified',
    submittedAt: now,
    createdAt: now,
    updatedAt: now
  }
  const record: EmployeeVerificationRecord = {
    ...base,
    status: input.status,
    airlineCode: employer?.code || base.airlineCode,
    airlineName: employer?.name || base.airlineName,
    method: input.status === 'verified' && base.method === 'manual_review' ? 'manual_review' : base.method,
    reviewedAt: now,
    reviewedBy: input.reviewerId,
    reviewSource: 'operator-review',
    reasonCategory: input.reasonCategory || (input.status === 'verified' ? 'approved' : input.status),
    ...(input.status === 'verified' ? { verifiedAt: now } : {}),
    updatedAt: now
  }
  return { ok: true as const, record }
}
