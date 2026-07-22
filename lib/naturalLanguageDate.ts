export type NaturalLanguageDateConfidence = 'high' | 'medium' | 'low' | 'none'

export type NaturalLanguageDateResult = {
  isoDate?: string
  matchedText?: string
  confidence: NaturalLanguageDateConfidence
  warnings: string[]
}

export type NaturalLanguageDateOptions = {
  now?: Date
  timezone?: string
  defaultYear?: number
}

const monthNumbers: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12
}

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function calendarParts(now: Date, timezone?: string) {
  if (!timezone) {
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate()
    }
  }

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now)
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value)
    const year = part('year')
    const month = part('month')
    const day = part('day')
    if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)) return { year, month, day }
  } catch {
    // Fall through to UTC parts if an unsupported timezone is supplied.
  }

  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate()
  }
}

function isoDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return `${year}-${pad(month)}-${pad(day)}`
}

function utcDateFromIso(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(baseIso: string, days: number) {
  const date = utcDateFromIso(baseIso)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) || baseIso
}

function todayIso(options: NaturalLanguageDateOptions) {
  const now = options.now || new Date()
  const parts = calendarParts(now, options.timezone)
  return isoDate(parts.year, parts.month, parts.day) || now.toISOString().slice(0, 10)
}

function parseYear(value: string | undefined, fallbackYear: number) {
  if (!value) return fallbackYear
  const year = Number(value)
  if (!Number.isInteger(year)) return fallbackYear
  return value.length === 2 ? 2000 + year : year
}

function nextMonthDay(month: number, day: number, explicitYear: string | undefined, options: NaturalLanguageDateOptions) {
  const today = todayIso(options)
  const currentYear = options.defaultYear || Number(today.slice(0, 4))
  const requestedYear = parseYear(explicitYear, currentYear)
  const candidate = isoDate(requestedYear, month, day)
  if (!candidate) return undefined
  if (explicitYear || candidate >= today) return candidate
  return isoDate(requestedYear + 1, month, day)
}

function nextWeekday(target: number, options: NaturalLanguageDateOptions, mode: 'same-or-next' | 'following-calendar-week') {
  const today = todayIso(options)
  const base = utcDateFromIso(today)
  const current = base.getUTCDay()
  if (mode === 'following-calendar-week') {
    const daysUntilNextSunday = (7 - current) % 7 || 7
    const nextWeekSunday = addDays(today, daysUntilNextSunday)
    return addDays(nextWeekSunday, target)
  }
  const diff = (target - current + 7) % 7
  return addDays(today, diff)
}

function high(isoDateValue: string, matchedText: string, warnings: string[] = []): NaturalLanguageDateResult {
  return { isoDate: isoDateValue, matchedText: matchedText.trim(), confidence: 'high', warnings }
}

function invalidDate(matchedText: string): NaturalLanguageDateResult {
  return {
    matchedText: matchedText.trim(),
    confidence: 'none',
    warnings: ['That date is not valid. Try July 27, 2026.']
  }
}

function ambiguousDate(matchedText: string): NaturalLanguageDateResult {
  return {
    matchedText: matchedText.trim(),
    confidence: 'none',
    warnings: ['Use month/day format, for example 7/27/26. Numeric slash dates are interpreted as US month/day.']
  }
}

function orderedMatch(input: string, candidates: Array<{ index: number; result: NaturalLanguageDateResult }>) {
  return candidates
    .filter((candidate) => candidate.index >= 0)
    .sort((first, second) => first.index - second.index)[0]?.result
}

export function resolveNaturalLanguageDate(input: string, options: NaturalLanguageDateOptions = {}): NaturalLanguageDateResult {
  const text = typeof input === 'string' ? input.trim() : ''
  if (!text) return { confidence: 'none', warnings: [] }

  const lower = text.toLowerCase()
  const today = todayIso(options)
  const candidates: Array<{ index: number; result: NaturalLanguageDateResult }> = []

  const relativePatterns: Array<{ pattern: RegExp; days: number; warning?: string }> = [
    { pattern: /\bday\s+after\s+tomorrow\b/i, days: 2 },
    { pattern: /\btomorrow\b/i, days: 1 },
    { pattern: /\btonight\b/i, days: 0, warning: '“Tonight” implies a daypart, but search currently stores only a calendar date.' },
    { pattern: /\btoday\b/i, days: 0 }
  ]

  for (const item of relativePatterns) {
    const match = text.match(item.pattern)
    if (match?.index !== undefined) candidates.push({
      index: match.index,
      result: high(addDays(today, item.days), match[0], item.warning ? [item.warning] : [])
    })
  }

  const nextWeekdayMatch = lower.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (nextWeekdayMatch?.index !== undefined) {
    candidates.push({
      index: nextWeekdayMatch.index,
      result: high(nextWeekday(weekdays.indexOf(nextWeekdayMatch[1]), options, 'following-calendar-week'), nextWeekdayMatch[0])
    })
  }

  const thisWeekdayMatch = lower.match(/\b(?:this|coming)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (thisWeekdayMatch?.index !== undefined) {
    candidates.push({
      index: thisWeekdayMatch.index,
      result: high(nextWeekday(weekdays.indexOf(thisWeekdayMatch[1]), options, 'same-or-next'), thisWeekdayMatch[0])
    })
  }

  const bareWeekdayMatch = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (bareWeekdayMatch?.index !== undefined && !/\b(?:next|this|coming)\s+$/.test(lower.slice(0, bareWeekdayMatch.index))) {
    candidates.push({
      index: bareWeekdayMatch.index,
      result: high(nextWeekday(weekdays.indexOf(bareWeekdayMatch[1]), options, 'same-or-next'), bareWeekdayMatch[0])
    })
  }

  const isoMatch = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (isoMatch?.index !== undefined) {
    const iso = isoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
    candidates.push({ index: isoMatch.index, result: iso ? high(iso, isoMatch[0]) : invalidDate(isoMatch[0]) })
  }

  const monthDayPattern = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2}|\d{4}))?\b/gi
  for (const match of text.matchAll(monthDayPattern)) {
    const month = monthNumbers[match[1].toLowerCase()]
    const iso = nextMonthDay(month, Number(match[2]), match[3], options)
    candidates.push({ index: match.index || 0, result: iso ? high(iso, match[0]) : invalidDate(match[0]) })
  }

  const dayMonthPattern = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\.?)(?:\s+(\d{2}|\d{4}))?\b/gi
  for (const match of text.matchAll(dayMonthPattern)) {
    const month = monthNumbers[match[2].toLowerCase()]
    const iso = nextMonthDay(month, Number(match[1]), match[3], options)
    candidates.push({ index: match.index || 0, result: iso ? high(iso, match[0]) : invalidDate(match[0]) })
  }

  const numericPattern = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g
  for (const match of text.matchAll(numericPattern)) {
    const month = Number(match[1])
    const day = Number(match[2])
    if (month > 12 && day <= 12) {
      candidates.push({ index: match.index || 0, result: ambiguousDate(match[0]) })
      continue
    }
    const iso = nextMonthDay(month, day, match[3], options)
    candidates.push({ index: match.index || 0, result: iso ? high(iso, match[0]) : invalidDate(match[0]) })
  }

  return orderedMatch(text, candidates) || { confidence: 'none', warnings: [] }
}
