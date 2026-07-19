import {
  type NodeRoleBadge,
  nodeRoleBadgeLabel,
  nodeRoleBadgeTitle,
} from '../../lib/l2-ingest-badge'

/** Compact Discover / Filter / Personalization icon used on canvas nodes + mini previews. */
export function NodeRoleIcon({ role }: { role: NodeRoleBadge }) {
  const title =
    role === 'personalize'
      ? nodeRoleBadgeTitle(role)
      : role === 'discover'
        ? 'Discover — can pull matching posts into the project pool'
        : 'Filter — does not discover new posts'
  return (
    <span
      className={`l2-flow-condition-ingest-icon-btn l2-flow-condition-ingest-icon-btn--${role}`}
      title={title}
      aria-label={nodeRoleBadgeLabel(role)}
    >
      {role === 'discover' ? (
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
          <circle cx="8" cy="8" r="1.6" fill="currentColor" />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            d="M8 3.2a4.8 4.8 0 0 1 4.8 4.8M8 1.5a6.5 6.5 0 0 1 6.5 6.5M8 3.2a4.8 4.8 0 0 0-4.8 4.8M8 1.5A6.5 6.5 0 0 0 1.5 8"
          />
        </svg>
      ) : role === 'personalize' ? (
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
          <circle cx="8" cy="5.2" r="2.35" fill="currentColor" />
          <path
            fill="currentColor"
            d="M3.2 13.2c0-2.45 2.05-4.2 4.8-4.2s4.8 1.75 4.8 4.2v0.3H3.2v-0.3z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
          <path
            fill="currentColor"
            d="M2.2 2.5h11.6l-4.2 5.2v4.3L6.4 13V7.7L2.2 2.5z"
          />
        </svg>
      )}
    </span>
  )
}
