export {
  tripOutcomeStorageKey,
  tripOutcomeStatuses,
  loadTripOutcomesFromRepository as loadTripOutcomes,
  saveTripOutcomeToRepository as saveTripOutcome,
  outcomeRepositoryDiagnostics,
  outcomesForCommunityProbability,
  type CreateTripOutcomeInput,
  type OutcomeRepository,
  type OutcomeRepositoryDiagnostics,
  type OutcomeSource,
  type TripOutcome,
  type TripOutcomeStatus,
  type TripOutcomeSubjectType
} from './outcomeRepository'

import { outcomesForCommunityProbability, type TripOutcome } from './outcomeRepository'

export function tripOutcomeStats(outcomes: TripOutcome[]) {
  const outcomeCount = outcomes.length
  const localOutcomeCount = outcomes.filter((outcome) => outcome.source !== 'Database').length
  const databaseOutcomeCount = outcomes.filter((outcome) => outcome.source === 'Database').length
  const cancelledCount = outcomes.filter((outcome) => outcome.cancelled || outcome.status === 'Cancelled trip').length
  const probabilityOutcomes = outcomesForCommunityProbability(outcomes)
  const probabilityOutcomeCount = probabilityOutcomes.length
  const successCount = probabilityOutcomes.filter((outcome) => outcome.success === true || outcome.status === 'Yes, got on').length
  const failureCount = probabilityOutcomes.filter((outcome) => outcome.success === false || outcome.status === 'No, did not get on').length
  const successRate = probabilityOutcomeCount ? Math.round((successCount / probabilityOutcomeCount) * 100) : 0

  return {
    outcomeCount,
    probabilityOutcomeCount,
    successCount,
    failureCount,
    cancelledCount,
    localOutcomeCount,
    databaseOutcomeCount,
    successRate
  }
}
