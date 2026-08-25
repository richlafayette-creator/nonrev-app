export default function BillingStatusCard({ compact = false }: { compact?: boolean }) {
  return (
    <section className="nonrevy-traveler-card nonrevy-current-access-card" style={{ border: '1px solid #334155', borderRadius: 22, padding: compact ? 18 : 22, background: '#0f172a' }}>
      <p style={{ color: '#2563eb', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginTop: 0 }}>Current access</p>
      <h2 style={{ margin: '6px 0' }}>Private Beta</h2>
      <p style={{ color: '#4B5563' }}>Private beta access is currently complimentary. Paid memberships are not active yet.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 14 }}>
        {[
          ['Status', 'Active'],
          ['Price', 'Complimentary'],
          ['Payment details', 'Not requested'],
          ['Paid billing', 'Not active']
        ].map(([label, value]) => (
          <article key={label} style={{ border: '1px solid #d1d5db', borderRadius: 14, padding: 12, background: '#ffffff' }}>
            <small style={{ color: '#6b7280' }}>{label}</small>
            <strong style={{ display: 'block', color: '#111827', marginTop: 4 }}>{value}</strong>
          </article>
        ))}
      </div>
      {!compact && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <a href="/membership" style={{ border: '1px solid #2563eb', borderRadius: 999, padding: '10px 14px', color: '#2563eb', fontWeight: 800, textDecoration: 'none' }}>View Membership</a>
          <a href="/credits" style={{ border: '1px solid #d1d5db', borderRadius: 999, padding: '10px 14px', color: '#111827', fontWeight: 800, textDecoration: 'none' }}>AI Credits</a>
        </div>
      )}
    </section>
  )
}
