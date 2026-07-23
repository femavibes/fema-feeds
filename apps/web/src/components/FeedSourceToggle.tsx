export type FeedSourceMode = 'native' | 'subscribed'

interface Props {
  value: FeedSourceMode
  onChange: (mode: FeedSourceMode) => void
  label?: string
  nativeLabel?: string
  subscribedLabel?: string
}

export function FeedSourceToggle({
  value,
  onChange,
  label = 'Source',
  nativeLabel = 'Native',
  subscribedLabel = 'Subscribed',
}: Props) {
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
          {nativeLabel}
        </button>
        <button
          type="button"
          className={`feed-source-toggle-btn feed-source-toggle-btn-wide${value === 'subscribed' ? ' is-active' : ''}`}
          aria-pressed={value === 'subscribed'}
          onClick={() => onChange('subscribed')}
        >
          {subscribedLabel}
        </button>
      </div>
    </div>
  )
}
