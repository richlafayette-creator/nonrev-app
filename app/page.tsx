'use client'

import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import ConversationalTripWorkspace from './ConversationalTripWorkspace'
import { isConversationalWorkspaceEnabled } from '../lib/featureFlags'
import { markActivationStep } from '../lib/onboardingActivation'

export default function Home() {
  const conversationalWorkspaceEnabled = isConversationalWorkspaceEnabled()
  const [search, setSearch] = useState('')
  const [travelDate, setTravelDate] = useState('')
  const [passengers, setPassengers] = useState('1')
  const [airlinePreferences, setAirlinePreferences] = useState('')
  const [maximumStops, setMaximumStops] = useState('')
  const [cabin, setCabin] = useState('')
  const [message, setMessage] = useState('')

  if (conversationalWorkspaceEnabled) {
    return <ConversationalTripWorkspace />
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = search.trim()
    if (!normalized) {
      setMessage('Enter a route or trip request to search.')
      return
    }

    markActivationStep('runFirstTripPlan')
    const params = new URLSearchParams({ aiTrip: normalized })
    if (travelDate) params.set('date', travelDate)
    if (passengers && passengers !== '1') params.set('passengers', passengers)
    if (airlinePreferences.trim()) params.set('airlines', airlinePreferences.trim())
    if (maximumStops) params.set('maxStops', maximumStops)
    if (cabin) params.set('cabin', cabin)
    window.location.href = `/results?${params.toString()}`
  }

  return (
    <main className={`app-shell nonrevy-home${conversationalWorkspaceEnabled ? ' nonrevy-home--conversational-enabled' : ''}`}>
      <Link className="nonrevy-home__profile" href="/profile" aria-label="Open profile and settings">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm0 2c-4.02 0-7.25 2.07-7.25 4.64 0 .75.61 1.36 1.36 1.36h11.78c.75 0 1.36-.61 1.36-1.36 0-2.57-3.23-4.64-7.25-4.64Z" />
        </svg>
      </Link>

      <section className="nonrevy-home__hero nonrevy-home__hero--simple">
        <div className="nonrevy-home__content nonrevy-home__content--simple">
          <header className="nonrevy-home__masthead" aria-label="NONREVY">
            <h1 className="nonrevy-home__logo nonrevy-logo">NONREVY</h1>
            <div className="nonrevy-home__subtitle" aria-label="Fly Smarter">
              <span />
              <p>Private Beta</p>
              <span />
            </div>
            <p className="nonrevy-home__intro">
              Find the non-rev route most likely to get you there.
            </p>
            <p className="nonrevy-home__intro">
              Nonrevy compares flights, ZED access, load signals and backup routes so you can make a smarter decision before you go.
            </p>
          </header>

          <form onSubmit={submitSearch} className="nonrevy-home__search-card nonrevy-home__search-card--simple" aria-label="Search itineraries">
            <div className="nonrevy-home__search-main">
              <div className="nonrevy-home__field nonrevy-home__field--route">
                <label htmlFor="homepage-ai-search" className="nonrevy-home__search-label">
                  Search
                </label>
                <input
                  id="homepage-ai-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="LAX to HND tomorrow"
                  autoComplete="off"
                  className="nonrevy-home__input nonrevy-home__input--simple"
                />
              </div>

              <button type="submit" className="nonrevy-home__primary">Search</button>
            </div>

            <details className="nonrevy-home__filters">
              <summary>More options</summary>
              <div className="nonrevy-home__filters-panel">
                <div className="nonrevy-home__field">
                  <label htmlFor="homepage-date" className="nonrevy-home__search-label">Date</label>
                  <input
                    id="homepage-date"
                    type="date"
                    value={travelDate}
                    onChange={(event) => setTravelDate(event.target.value)}
                    className="nonrevy-home__input nonrevy-home__date-input"
                  />
                </div>

                <div className="nonrevy-home__field">
                  <label htmlFor="homepage-passengers" className="nonrevy-home__search-label">Passengers</label>
                  <select
                    id="homepage-passengers"
                    value={passengers}
                    onChange={(event) => setPassengers(event.target.value)}
                    className="nonrevy-home__input"
                  >
                    <option value="1">1 passenger</option>
                    <option value="2">2 passengers</option>
                    <option value="3">3 passengers</option>
                    <option value="4">4 passengers</option>
                    <option value="5">5 passengers</option>
                    <option value="6">6 passengers</option>
                  </select>
                </div>

                <div className="nonrevy-home__field nonrevy-home__field--wide">
                  <label htmlFor="homepage-airlines" className="nonrevy-home__search-label">Airline preferences</label>
                  <input
                    id="homepage-airlines"
                    value={airlinePreferences}
                    onChange={(event) => setAirlinePreferences(event.target.value)}
                    placeholder="United, ANA, avoid LCCs"
                    autoComplete="off"
                    className="nonrevy-home__input"
                  />
                </div>

                <div className="nonrevy-home__field">
                  <label htmlFor="homepage-max-stops" className="nonrevy-home__search-label">Maximum stops</label>
                  <select
                    id="homepage-max-stops"
                    value={maximumStops}
                    onChange={(event) => setMaximumStops(event.target.value)}
                    className="nonrevy-home__input"
                  >
                    <option value="">Any</option>
                    <option value="0">Nonstop only</option>
                    <option value="1">Up to 1 stop</option>
                    <option value="2">Up to 2 stops</option>
                    <option value="3">Up to 3 stops</option>
                  </select>
                </div>

                <div className="nonrevy-home__field">
                  <label htmlFor="homepage-cabin" className="nonrevy-home__search-label">Cabin</label>
                  <select
                    id="homepage-cabin"
                    value={cabin}
                    onChange={(event) => setCabin(event.target.value)}
                    className="nonrevy-home__input"
                  >
                    <option value="">Any cabin</option>
                    <option value="economy">Economy</option>
                    <option value="premium-economy">Premium economy</option>
                    <option value="business">Business</option>
                    <option value="first">First</option>
                  </select>
                </div>
              </div>
            </details>

            {message ? <p className="nonrevy-home__message">{message}</p> : null}
          </form>
          <div className="nonrevy-home__examples" aria-label="Example searches">
            {['LAX to HND tomorrow', 'Get me to Europe Friday', 'SFO to NRT next week'].map((example) => (
              <button key={example} type="button" onClick={() => setSearch(example)}>{example}</button>
            ))}
          </div>
          <div className="nonrevy-home__steps" aria-label="How Nonrevy helps">
            <span>Search your trip</span>
            <span>Compare your chances</span>
            <span>Know your backups</span>
          </div>
          <p className="nonrevy-home__expectation">
            Public schedule preview is available first. Verify airline eligibility to unlock ZED compatibility, load intelligence, personalized scoring and member tools.
          </p>
        </div>
      </section>
    </main>
  )
}
