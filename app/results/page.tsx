'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ConversationalTripWorkspace from '../ConversationalTripWorkspace'
import { PlanPage } from '../plan/PlanPage'
import { isConversationalWorkspaceEnabled } from '../../lib/featureFlags'

export default function ResultsPage() {
  if (isConversationalWorkspaceEnabled()) {
    return (
      <Suspense fallback={<ConversationalTripWorkspace />}>
        <ConversationalResultsPage />
      </Suspense>
    )
  }

  return <PlanPage compactResultsMode />
}

function ConversationalResultsPage() {
  const params = useSearchParams()
  return <ConversationalTripWorkspace initialPrompt={params.get('aiTrip') || params.get('q') || ''} />
}
