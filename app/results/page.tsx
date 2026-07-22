import { Suspense } from 'react'
import SearchResultsClient from './SearchResultsClient'

export default function ResultsPage() {
  return (
    <Suspense fallback={<main className="app-shell nonrevy-results-page"><section className="nonrevy-results-page__shell"><h1>Loading beta search results</h1></section></main>}>
      <SearchResultsClient />
    </Suspense>
  )
}
