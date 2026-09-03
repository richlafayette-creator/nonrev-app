export const metadata = {
  title: 'Privacy Notice | Nonrevy'
}

const sectionStyle = { marginTop: 28 }

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f6f8fc', padding: '32px 16px' }}>
      <article style={{ maxWidth: 820, margin: '0 auto', background: '#ffffff', padding: 32, borderRadius: 18, color: '#111827', lineHeight: 1.65 }}>
        <a href="/verify" style={{ color: '#2563eb' }}>Back to verification</a>
        <h1>Nonrevy Privacy Notice</h1>
        <p><strong>Effective September 2, 2026</strong></p>
        <p>Nonrevy is an independent service and is not affiliated with or endorsed by any airline. This notice explains how Nonrevy handles information used for airline-affiliation verification.</p>

        <section style={sectionStyle}>
          <h2>Information we handle</h2>
          <p>We handle account identifiers, your selected airline, the domain of your work email, a one-way hash of the work email, verification status, security timestamps, and limited technical logs such as IP address and device information. The raw work address is used to deliver the requested message but is not stored in the application verification record.</p>
          <p>If you request manual review, we may temporarily handle the least-sensitive evidence reasonably needed to confirm eligibility.</p>
        </section>

        <section style={sectionStyle}>
          <h2>How we use it</h2>
          <p>We use this information only to verify eligibility, secure accounts, prevent fraud and abuse, provide support, comply with law, and maintain the service. Verification messages are transactional and are not marketing emails.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Verification security</h2>
          <p>Verification codes and links expire after 15 minutes and can be used once. Nonrevy stores protected hashes rather than the code, magic-link token, or raw work email in its verification records. Repeated sends and failed attempts are limited.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Service providers and disclosure</h2>
          <p>We use service providers, including Supabase for application data and Resend for email delivery. They receive information only as needed to perform those services. We do not sell personal information or use verification data for cross-context behavioral advertising. We may disclose information when legally required or necessary to protect users and the service.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Retention</h2>
          <p>We retain verification records and security logs only as long as reasonably necessary for eligibility, fraud prevention, legal compliance, and support. Temporary manual-review evidence should be deleted after the review and any necessary appeal or security period.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Your choices and rights</h2>
          <p>You may request access, correction, or deletion of personal information, subject to legal and security exceptions. You may also choose manual review instead of work-email verification where available.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Contact</h2>
          <p>For privacy requests or an unexpected verification email, contact <a href="mailto:support@nonrevy.com">support@nonrevy.com</a>.</p>
        </section>
      </article>
    </main>
  )
}
