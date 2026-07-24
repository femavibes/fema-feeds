import type { ReactNode } from 'react'

interface Props {
  applied: boolean
  busy?: boolean
  onApply: () => void
  hint?: string
  rescoreNote?: boolean
  serveNote?: boolean
  layout?: 'stack' | 'toolbar'
  /** Shown beside the apply button (e.g. signal reference toggle). */
  trailing?: ReactNode
}

export function FeedSettingsApplyBar({
  applied,
  busy,
  onApply,
  hint,
  rescoreNote,
  serveNote,
  layout = 'stack',
  trailing,
}: Props) {
  const button = (
    <button
      type="button"
      className="btn btn-primary btn-sm feed-settings-apply-btn"
      disabled={applied || busy}
      onClick={onApply}
    >
      {busy ? 'Applying…' : applied ? 'In use on this feed' : 'Use on this feed'}
    </button>
  )

  if (layout === 'toolbar') {
    const note =
      hint || (rescoreNote && !applied) || (serveNote && !applied) ? (
        <div className="feed-settings-apply-note">
          {hint ? <p className="card-hint feed-settings-apply-hint">{hint}</p> : null}
          {rescoreNote && !applied ? (
            <p className="card-hint feed-settings-apply-hint">
              Existing candidates are rescored in the background. New posts use the new sort formula immediately.
              Match rules still require <strong>Update Live</strong> in the sidebar.
            </p>
          ) : null}
          {serveNote && !applied ? (
            <p className="card-hint feed-settings-apply-hint">
              Applies at serve time for each viewer as soon as you confirm — no pool rebuild needed.
              Match rules still require <strong>Update Live</strong> in the sidebar.
            </p>
          ) : null}
        </div>
      ) : null

    return (
      <div className="feed-settings-apply-bar feed-settings-apply-bar-toolbar">
        <div className="feed-settings-apply-toolbar">
          {note}
          <div className="feed-settings-apply-actions">
            {trailing}
            {button}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="feed-settings-apply-bar">
      {hint ? <p className="card-hint feed-settings-apply-hint">{hint}</p> : null}
      {rescoreNote && !applied ? (
        <p className="card-hint feed-settings-apply-hint">
          Existing candidates are rescored in the background. New posts use the new sort formula immediately.
          Match rules still require <strong>Update Live</strong> in the sidebar.
        </p>
      ) : null}
      {serveNote && !applied ? (
        <p className="card-hint feed-settings-apply-hint">
          Applies at serve time for each viewer as soon as you confirm — no pool rebuild needed.
          Match rules still require <strong>Update Live</strong> in the sidebar.
        </p>
      ) : null}
      {button}
    </div>
  )
}
