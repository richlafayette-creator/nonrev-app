'use client'

import { type FormEvent, useState } from 'react'
import { markActivationStep } from '../lib/onboardingActivation'

export default function Home() {
  const [search, setSearch] = useState('')
  const [travelDate, setTravelDate] = useState('')
  const [message, setMessage] = useState('')

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
    window.location.href = `/results?${params.toString()}`
  }

  return (
    <main className="app-shell nonrevy-home" style={{ minHeight: '100vh', color: 'white' }}>
      <section className="nonrevy-home__hero nonrevy-home__hero--simple">
        <div className="nonrevy-home__content nonrevy-home__content--simple">
          <form onSubmit={submitSearch} className="nonrevy-home__search-card nonrevy-home__search-card--simple" aria-label="Search itineraries">
            <label htmlFor="homepage-ai-search" className="nonrevy-home__search-label">
              Search
            </label>
            <div className="nonrevy-home__search-row">
              <input
                id="homepage-ai-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="LAX to HND"
                autoComplete="off"
                className="nonrevy-home__input nonrevy-home__input--simple"
              />
            </div>

            <label htmlFor="homepage-date" className="nonrevy-home__search-label nonrevy-home__date-label">
              Date
            </label>
            <input
              id="homepage-date"
              type="date"
              value={travelDate}
              onChange={(event) => setTravelDate(event.target.value)}
              className="nonrevy-home__input nonrevy-home__date-input"
            />

            <div className="nonrevy-home__actions" aria-label="Search actions">
              <button type="submit" className="nonrevy-home__primary">Search</button>
            </div>

            {message ? <p className="nonrevy-home__message">{message}</p> : null}
          </form>
        </div>
      </section>
    </main>
  )
}
