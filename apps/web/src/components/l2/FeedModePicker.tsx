import { ToggleRow } from '../ToggleRow'

export interface FeedModeOption {
  id: string
  label: string
  hint: string
}

interface Props {
  options: FeedModeOption[]
  value: string
  onChange: (id: string) => void
  ariaLabel: string
  className?: string
}

export function FeedModePicker({ options, value, onChange, ariaLabel, className }: Props) {
  return (
    <div
      className={`option-toggle-list feed-mode-picker${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <ToggleRow
          key={opt.id}
          label={opt.label}
          hint={opt.hint}
          checked={value === opt.id}
          onChange={(on) => { if (on) onChange(opt.id) }}
          ariaLabel={opt.label}
        />
      ))}
    </div>
  )
}
