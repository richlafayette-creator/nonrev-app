'use client'

import ConversationalTripWorkspace from '../ConversationalTripWorkspace'
import { PlanPage } from '../plan/PlanPage'
import { isConversationalWorkspaceEnabled } from '../../lib/featureFlags'

export default function ResultsPage() {
  if (isConversationalWorkspaceEnabled()) {
    const params = new URLSearchParams(window.location.search)
    return <ConversationalTripWorkspace initialPrompt={params.get('aiTrip') || params.get('q') || ''} />
  }

  return <PlanPage compactResultsMode />
}
