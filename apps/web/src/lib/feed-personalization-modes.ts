export const PERSONALIZATION_MODE_OPTIONS = [
  {
    id: 'presets',
    label: 'Presets',
    hint: 'Simple on/off switches for common personalization behaviors.',
  },
  {
    id: 'formula',
    label: 'Formula builder',
    hint: 'Write a math formula using viewer signals (base_score, is_followed, affinity, etc.).',
  },
] as const

export type PersonalizationModeId = (typeof PERSONALIZATION_MODE_OPTIONS)[number]['id']
