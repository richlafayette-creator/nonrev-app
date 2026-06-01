import type { SupportedCarrierValue } from './carrierScope'

export type TravelerProfileScaffold = {
  employeeAirline: string
  travelerType: string
  companionStatus: string
  preferredAirports: string[]
  supportedCarrierEligibility: Record<Exclude<SupportedCarrierValue, 'all'>, string>
}

export const defaultTravelerProfile: TravelerProfileScaffold = {
  employeeAirline: 'United',
  travelerType: 'Employee standby',
  companionStatus: 'One companion eligible',
  preferredAirports: ['LAX', 'SFO', 'DEN'],
  supportedCarrierEligibility: {
    united: 'Primary employee eligibility',
    delta: 'Interline eligibility placeholder',
    'alaska-group': 'Partner eligibility placeholder'
  }
}

export function travelerProfileAssumptions(profile: TravelerProfileScaffold) {
  return [
    `Employee airline: ${profile.employeeAirline}`,
    `Traveler type: ${profile.travelerType}`,
    `Companion status: ${profile.companionStatus}`,
    `Preferred airports: ${profile.preferredAirports.join(', ')}`,
    `Supported carrier eligibility: United - ${profile.supportedCarrierEligibility.united}; Delta - ${profile.supportedCarrierEligibility.delta}; Alaska Group - ${profile.supportedCarrierEligibility['alaska-group']}`
  ]
}
