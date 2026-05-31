export default function AppNavigation() {
  return (
    <aside className="app-menu" aria-label="Main navigation">
      <details className="app-menu__details">
        <summary className="app-menu__summary">
          <span>Menu</span>
        </summary>
        <nav className="app-menu__links">
          <a href="/">Home</a>
          <a href="/plan">Plan</a>
          <a href="/best-routes">Best Routes</a>
          <a href="/watchlist">Watchlist</a>
          <a href="/credits">Credits</a>
          <a href="/reputation">Trust</a>
          <a href="/notifications">Notifications</a>
          <a href="/agent">Agent</a>
          <a href="/requests">Open Requests</a>
          <a href="/my-requests">My Requests</a>
          <a href="/outcomes">Outcomes</a>
        </nav>
      </details>
    </aside>
  )
}
