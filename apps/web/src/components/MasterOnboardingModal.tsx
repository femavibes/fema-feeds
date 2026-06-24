import { WhitelistEditor } from './WhitelistEditor'

interface Props {
  onDismiss: () => void
  onOpenAccessSettings: () => void
  onWhitelistSaved: () => void
}

export function MasterOnboardingModal({ onDismiss, onOpenAccessSettings, onWhitelistSaved }: Props) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onDismiss}>
      <div
        className="modal-card master-onboarding-modal"
        role="dialog"
        aria-labelledby="master-onboarding-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="master-onboarding-head">
          <h2 id="master-onboarding-title">You&apos;re the deployment master</h2>
          <p className="card-hint">
            You&apos;re the first account on this server. Add friends by Bluesky handle before you
            share the URL — only whitelisted accounts can sign in and build feeds.
          </p>
        </header>

        <WhitelistEditor
          compact
          onSaved={(access) => {
            if (access.allowedDids.length > 0) {
              onWhitelistSaved()
            }
          }}
        />

        <footer className="master-onboarding-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenAccessSettings}>
            Open full access settings
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onDismiss}>
            I&apos;ll do this later
          </button>
        </footer>
      </div>
    </div>
  )
}
