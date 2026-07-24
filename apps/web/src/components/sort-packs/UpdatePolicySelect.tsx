import type { SortPackUpdatePolicy } from '@cfb/core-types'

const OPTIONS: { value: SortPackUpdatePolicy; label: string }[] = [
  { value: 'notify', label: 'Notify — alert when a newer version exists' },
  { value: 'auto_minor', label: 'Auto minor — apply patch releases automatically' },
  { value: 'pinned', label: 'Quiet — stay on this version, no upgrade alerts' },
]

interface Props {
  value: SortPackUpdatePolicy
  onChange: (policy: SortPackUpdatePolicy) => void
  disabled?: boolean
  className?: string
}

export function UpdatePolicySelect({ value, onChange, disabled, className }: Props) {
  return (
    <label className={`l2-inspector-field${className ? ` ${className}` : ''}`}>
      Update policy
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as SortPackUpdatePolicy)}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  )
}

export function updatePolicyHint(policy: SortPackUpdatePolicy, patchUpgrade: boolean): string {
  if (policy === 'auto_minor' && patchUpgrade) return 'Auto minor — pin should sync automatically.'
  if (policy === 'notify') return 'Notify — upgrade when you are ready.'
  return 'Quiet — no alerts for this formula.'
}
