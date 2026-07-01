export type FeedSourceMode = 'native' | 'subscribed'

interface Props {
  value: FeedSourceMode
  onChange: (mode: FeedSourceMode) => void
  label?: string
}

export function FeedSourceToggle({ value, onChange, label = 'Source' }: Props) {
  return (
    <div className="feed-source-toggle-wrap">
      <span className="feed-source-toggle-label">{label}</span>
      <div className="feed-source-toggle" role="group" aria-label={label}>
        <button
          type="button"
          className={`feed-source-toggle-btn${value === 'native' ? ' is-active' : ''}`}
          aria-pressed={value === 'native'}
          onClick={() => onChange('native')}
        >
          Native
        </button>
        <button
          type="button"
          className={`feed-source-toggle-btn${value === 'subscribed' ? ' is-active' : ''}`}
          aria-pressed={value === 'subscribed'}
          onClick={() => onChange('subscribed')}
        >
          Subscribed
        </button>
      </div>
    </div>
  )
}
