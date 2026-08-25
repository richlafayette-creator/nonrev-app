export default function ReferralProgramCard({ compact = false }: { compact?: boolean }) {
  return (
    <section className="nonrevy-traveler-card nonrevy-referral-status-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: compact ? 18 : 22, background: '#0f172a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: '#2563eb', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Referrals</p>
          <h2 style={{ margin: '8px 0', fontSize: compact ? 24 : 30 }}>Not active in private beta</h2>
          <p style={{ color: '#4B5563', margin: 0 }}>
            Automated invite links and rewards are not live for the current private-beta cohort.
          </p>
        </div>
        <a href="/referrals" style={{ border: '1px solid #2563eb', borderRadius: 999, padding: '10px 14px', color: '#2563eb', textDecoration: 'none', fontWeight: 800 }}>
          Learn more
        </a>
      </div>
      <p style={{ color: '#4B5563', margin: '14px 0 0' }}>
        Use Beta Feedback when you want to share an invite suggestion with the team.
      </p>
    </section>
  )
}
