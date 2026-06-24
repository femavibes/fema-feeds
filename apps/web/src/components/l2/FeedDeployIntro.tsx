import { useState } from 'react'

const storageKey = (feedId: string) => `cfb_feed_deploy_intro_${feedId}`

interface Props {
  feedId: string
}

export function FeedDeployIntro({ feedId }: Props) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(storageKey(feedId)) === '1',
  )

  if (dismissed) return null

  return (
    <div className="feed-deploy-intro">
      <p className="card-hint feed-deploy-intro-text">
        <strong>Draft</strong> autosaves while you edit rules. <strong>Update live</strong> applies
        those rules and rebuilds candidates. <strong>Publish</strong> creates the Bluesky generator
        record so the feed appears on bsky.app.
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          localStorage.setItem(storageKey(feedId), '1')
          setDismissed(true)
        }}
      >
        Got it
      </button>
    </div>
  )
}
