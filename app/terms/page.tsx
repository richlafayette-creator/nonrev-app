export const metadata = {
  title: 'Terms of Use | Nonrevy'
}

const sectionStyle = { marginTop: 28 }

export default function TermsPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f6f8fc', padding: '32px 16px' }}>
      <article style={{ maxWidth: 820, margin: '0 auto', background: '#ffffff', padding: 32, borderRadius: 18, color: '#111827', lineHeight: 1.65 }}>
        <a href="/verify" style={{ color: '#2563eb' }}>Back to verification</a>
        <h1>Nonrevy Terms of Use</h1>
        <p><strong>Effective September 2, 2026</strong></p>
        <p>These terms govern use of Nonrevy. By creating an account or using the service, you agree to them.</p>

        <section style={sectionStyle}>
          <h2>Independent service</h2>
          <p>Nonrevy is independent and is not affiliated with, sponsored by, or endorsed by any airline. Airline names and marks identify travel providers only. Nonrevy cannot grant travel benefits or change an airline&apos;s rules.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Eligibility and account accuracy</h2>
          <p>You must provide accurate information, control the account and work address you submit, and remain eligible for any employee or dependent access you claim. You may not share an account, impersonate another person, or misrepresent airline affiliation or travel privileges.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Work-email verification</h2>
          <p>When you request verification, you authorize Nonrevy to send a transactional, one-time message to the work address you provide. You are responsible for complying with your employer&apos;s acceptable-use and email policies. Verification does not make an airline responsible for Nonrevy.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Confidential and airline information</h2>
          <p>Do not submit information that you are not authorized to disclose. You may not scrape, sell, republish, or distribute restricted load, employee, passenger, security, operational, or proprietary airline information. Follow all airline, airport, immigration, and travel-benefit rules.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Acceptable use</h2>
          <p>You may not bypass verification or rate limits, probe or disrupt the service, upload malware, harass others, automate unauthorized collection, or use Nonrevy for unlawful activity. We may investigate abuse and restrict or terminate access.</p>
        </section>

        <section style={sectionStyle}>
          <h2>No travel guarantee</h2>
          <p>Schedules, seat availability, eligibility, fees, and travel conditions can change without notice. Nonrevy provides planning information, not a promise of boarding, accuracy, availability, or a particular outcome. Confirm important information with the airline or other provider.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Disclaimers and responsibility</h2>
          <p>To the maximum extent permitted by law, Nonrevy is provided &quot;as is&quot; and &quot;as available.&quot; Nonrevy is not responsible for denied boarding, missed travel, airline action, employment consequences, lost data, or indirect or consequential loss. Nothing in these terms limits liability that cannot legally be limited.</p>
        </section>

        <section style={sectionStyle}>
          <h2>Changes and contact</h2>
          <p>We may update the service or these terms. Material changes will be identified by a new effective date or an in-service notice. Questions may be sent to <a href="mailto:support@nonrevy.com">support@nonrevy.com</a>. See the <a href="/privacy">Privacy Notice</a> for data practices.</p>
        </section>
      </article>
    </main>
  )
}
