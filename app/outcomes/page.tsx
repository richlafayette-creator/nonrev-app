'use client'

export default function OutcomesPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: '#020617',
      color: 'white',
      padding: 40,
      fontFamily: 'Arial'
    }}>
      <nav style={{ marginBottom: 24 }}>
        <a href="/" style={{ marginRight: 16, color: '#38bdf8' }}>Flights</a>
        <a href="/requests" style={{ marginRight: 16, color: '#c084fc' }}>Open Requests</a>
        <a href="/my-requests" style={{ marginRight: 16, color: '#facc15' }}>My Requests</a>
        <a href="/outcomes" style={{ color: '#22c55e' }}>Outcomes</a>
      </nav>

      <h1 style={{ fontSize: 40 }}>
        Outcomes
      </h1>

      <p>
        Historical success/failure tracking coming online.
      </p>
    </main>
  )
}
