export type SupportedCarrierValue = 'all' | 'united' | 'delta' | 'alaska-group'

export const alaskaGroupAirlines = ['Alaska Airlines', 'Hawaiian Airlines']

export const supportedCarrierOptions: { value: SupportedCarrierValue; label: string }[] = [
  { value: 'all', label: 'All Supported Carriers' },
  { value: 'united', label: 'United' },
  { value: 'delta', label: 'Delta' },
  { value: 'alaska-group', label: 'Alaska Group (Alaska Airlines + Hawaiian Airlines)' }
]

export const carrierFamilyLabels: Record<SupportedCarrierValue, string> = {
  all: 'All Supported Carriers',
  united: 'United',
  delta: 'Delta',
  'alaska-group': 'Alaska Group'
}

export const carrierFamilyMembers: Record<SupportedCarrierValue, string[]> = {
  all: ['United', 'Delta', 'Alaska Airlines', 'Hawaiian Airlines'],
  united: ['United'],
  delta: ['Delta'],
  'alaska-group': alaskaGroupAirlines
}

export function normalizeCarrierFamily(value: string): SupportedCarrierValue {
  if (value === 'united' || value === 'delta' || value === 'alaska-group') return value
  return 'all'
}

export function getCarrierFamilySummary(value: string) {
  const carrier = normalizeCarrierFamily(value)
  return {
    value: carrier,
    label: carrierFamilyLabels[carrier],
    members: carrierFamilyMembers[carrier]
  }
}

export function getCarrierScoringScaffold(value: string) {
  const carrier = normalizeCarrierFamily(value)
  const family = getCarrierFamilySummary(carrier)

  return {
    carrier,
    familyLabel: family.label,
    members: family.members,
    breakdown: [
      { label: 'Overall Score', value: '82', note: `Placeholder composite score for ${family.label}` },
      { label: 'Hub Strength', value: '8/10', note: `Hub signal scaffold treats ${family.members.join(' + ')} as ${family.label}` },
      { label: 'Route Complexity', value: 'Moderate', note: 'Connection and fallback complexity placeholder' },
      { label: 'Seasonal Demand', value: 'Medium', note: 'Holiday and peak-travel demand scaffold' },
      { label: 'Historical Performance', value: 'Good', note: 'Future outcome history signal placeholder' }
    ]
  }
}
