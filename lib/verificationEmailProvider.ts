export type VerificationEmailMessage = {
  to: string
  airlineName: string
  code: string
  magicLinkUrl: string
  expiresAt: string
}

export type VerificationEmailResult =
  | { ok: true; provider: string; messageId?: string }
  | { ok: false; provider: string; reason: 'missing-config' | 'unsupported-provider' | 'provider-error'; detail: string }

export type VerificationEmailProvider = {
  name: string
  sendVerificationEmail(message: VerificationEmailMessage): Promise<VerificationEmailResult>
}

function configuredProvider(env: Record<string, string | undefined>) {
  return (env.NONREVY_EMAIL_PROVIDER || '').trim().toLowerCase() || 'resend'
}

function fromAddress(env: Record<string, string | undefined>) {
  return (env.NONREVY_VERIFICATION_FROM_EMAIL || '').trim()
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function verificationEmailHtml(message: VerificationEmailMessage) {
  const airlineName = htmlEscape(message.airlineName)
  const code = htmlEscape(message.code)
  const magicLinkUrl = htmlEscape(message.magicLinkUrl)
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h1 style="font-size: 22px; margin: 0 0 12px;">Your Nonrevy verification code</h1>
      <p>You requested this code to verify your airline affiliation with <strong>${airlineName}</strong>.</p>
      <p>Your verification code is:</p>
      <p style="font-size: 28px; letter-spacing: 6px; font-weight: 800;">${code}</p>
      <p>
        <a href="${magicLinkUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 16px; border-radius: 999px; font-weight: 700;">
          Verify Email
        </a>
      </p>
      <p>This code and link expire in 15 minutes and can be used once. If you did not request it, ignore this email and contact support@nonrevy.com.</p>
      <p style="color: #475569; font-size: 13px;">Nonrevy is an independent service and is not affiliated with or endorsed by ${airlineName} or any airline.</p>
    </div>
  `
}

function verificationEmailText(message: VerificationEmailMessage) {
  return [
    'Your Nonrevy verification code',
    '',
    `You requested this code to verify your airline affiliation with ${message.airlineName}.`,
    `Verification code: ${message.code}`,
    `Magic link: ${message.magicLinkUrl}`,
    '',
    'This code and link expire in 15 minutes and can be used once.',
    'Nonrevy is an independent service and is not affiliated with or endorsed by ${message.airlineName} or any airline.',
    'If you did not request this, ignore it and contact support@nonrevy.com.'
  ].join('\n')
}

export function getVerificationEmailProvider(env: Record<string, string | undefined> = process.env): VerificationEmailProvider {
  const providerName = configuredProvider(env)
  if (providerName !== 'resend') {
    return {
      name: providerName || 'unknown',
      async sendVerificationEmail() {
        return {
          ok: false,
          provider: providerName || 'unknown',
          reason: 'unsupported-provider',
          detail: 'Email verification is not configured for this beta environment.'
        }
      }
    }
  }

  return {
    name: 'resend',
    async sendVerificationEmail(message) {
      const apiKey = (env.RESEND_API_KEY || '').trim()
      const from = fromAddress(env)
      if (!apiKey || !from) {
        return {
          ok: false,
          provider: 'resend',
          reason: 'missing-config',
          detail: 'Email verification is not configured yet. Request manual review instead.'
        }
      }

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from,
            to: message.to,
            subject: 'Your Nonrevy verification code',
            html: verificationEmailHtml(message),
            text: verificationEmailText(message)
          })
        })
        const data = await response.json().catch(() => null) as { id?: string } | null
        if (!response.ok) {
          return {
            ok: false,
            provider: 'resend',
            reason: 'provider-error',
            detail: 'Verification email could not be sent. Request manual review if the problem continues.'
          }
        }
        return { ok: true, provider: 'resend', messageId: data?.id }
      } catch {
        return {
          ok: false,
          provider: 'resend',
          reason: 'provider-error',
          detail: 'Verification email could not be sent. Request manual review if the problem continues.'
        }
      }
    }
  }
}
