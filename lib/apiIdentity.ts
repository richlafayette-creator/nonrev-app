function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  if (typeof Buffer !== 'undefined') return Buffer.from(padded, 'base64').toString('utf8')
  return atob(padded)
}

function jwtSubject(token: string) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return ''
    const parsed = JSON.parse(decodeBase64Url(payload)) as { sub?: string }
    return parsed.sub || ''
  } catch {
    return ''
  }
}

function safeIdentity(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 160)
}

export function persistentUserId(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1] || ''
  const subject = token ? jwtSubject(token) : ''
  if (subject) return `user:${safeIdentity(subject)}`

  const deviceId = request.headers.get('x-nonrevy-device-id') || ''
  if (deviceId) return `device:${safeIdentity(deviceId)}`

  return 'anonymous:local-fallback'
}
