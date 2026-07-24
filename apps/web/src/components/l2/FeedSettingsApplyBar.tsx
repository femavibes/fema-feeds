interface Props {
  applied: boolean
  busy?: boolean
  onApply: () => void
  hint?: string
  rescoreNote?: boolean
}

export function FeedSettingsApplyBar({ applied, busy, onApply, hint, rescoreNote }: Props) {
  return (
    <div className="feed-settings-apply-bar">
      {hint ? <p className="card-hint feed-settings-apply-hint">{hint}</p> : null}
      {rescoreNote && !applied ? (
        <p className="card-hint feed-settings-apply-hint">
          Existing candidates are rescored in the background. New posts use the new sort formula immediately.
          Match rules still require <strong>Update Live</strong> in the sidebar.
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={applied || busy}
        onClick={onApply}
      >
        {busy ? 'Applying…' : applied ? 'In use on this feed' : 'Use on this feed'}
      </button>
    </div>
  )
}
