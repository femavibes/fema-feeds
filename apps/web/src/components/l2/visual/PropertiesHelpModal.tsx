import { createPortal } from 'react-dom'
import type { L2RuleNode } from '@cfb/core-types'

/** Size-based audit + manual refresh policy (mirrors @cfb/list-sources). */
export const BLUESKY_LIST_SYNC_POLICY_ROWS = [
  { size: '< 500', audit: 'every 6 hours', refreshCooldown: '1 minute' },
  { size: '500 – 5k', audit: 'every 24 hours', refreshCooldown: '5 minutes' },
  { size: '5k – 20k', audit: 'every 3 days', refreshCooldown: '30 minutes' },
  { size: '20k+', audit: 'every 7 days', refreshCooldown: '2 hours' },
] as const

export type PropertiesHelpContext = {
  selected?: L2RuleNode | null
  selectedEdgeId?: string | null
  prefilterMode?: boolean
}

function helpForNode(ctx: PropertiesHelpContext): {
  title: string
  body: string[]
  showListPolicy?: boolean
} {
  const node = ctx.selected
  if (!node) {
    if (ctx.selectedEdgeId) {
      return {
        title: 'Connection',
        body: [
          'Edges define how posts flow between nodes. Select a node for settings that change matching behavior.',
        ],
      }
    }
    return {
      title: 'Properties',
      body: [
        'Select a node on the canvas to edit its settings here.',
        'Use this help button anytime — content follows whatever is selected.',
      ],
    }
  }

  switch (node.type) {
    case 'author':
      return {
        title: 'Author list',
        body: [
          'Match posts by author DID. Attach a Bluesky curation list, moderation list, or starter pack — they all resolve to the same backing list membership.',
          'Manual “extra authors” live on this node and are unioned at eval time; they are not stored in the shared list cache.',
          'Membership sync: Jetstream listitem events update the cache in realtime. Size-based audit polls reconcile drift. Manual Refresh is global per list (any user) and uses a separate cooldown from the audit schedule.',
          ctx.prefilterMode
            ? 'In prefilter mode, “Authors only” can block strangers from entering the ingestion pool.'
            : 'Role (Discover vs Filter) controls whether this node contributes authors to the feed’s discover set or only filters.',
        ].filter(Boolean) as string[],
        showListPolicy: true,
      }
    case 'keyword':
      return {
        title: 'Keyword',
        body: [
          'Match post text against keywords or phrases. Combine with groups to build AND/OR logic.',
        ],
      }
    case 'labels':
      return {
        title: 'Label',
        body: [
          'Match moderation or community labels on the post or author. Requires label enrichment where configured.',
        ],
      }
    case 'regex':
      return {
        title: 'Regex',
        body: ['Match post text with a regular expression. Prefer keywords when a simple phrase works.'],
      }
    case 'group':
      return {
        title: 'Group',
        body: [
          'A group combines child nodes with AND / OR / NOT logic. Nest groups for complex trees.',
        ],
      }
    case 'follow_ring':
      return {
        title: 'Follow ring',
        body: [
          'Expand from seed accounts through follows. Same direction as author lists: shared cache, periodic refresh — realtime follow sync is future work.',
        ],
      }
    case 'logic_block_ref':
      return {
        title: 'Logic block',
        body: [
          'A reusable packaged subtree. Open the inner preview to inspect the published logic; pin versions when you need stability.',
        ],
      }
    default:
      return {
        title: 'Node',
        body: ['Settings for the selected node appear in this panel.'],
      }
  }
}

export function PropertiesHelpModal({
  open,
  onClose,
  context,
}: {
  open: boolean
  onClose: () => void
  context: PropertiesHelpContext
}) {
  if (!open) return null
  const help = helpForNode(context)

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog l2-properties-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="l2-properties-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="l2-properties-help-head">
          <h3 id="l2-properties-help-title">{help.title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="l2-properties-help-body">
          {help.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {help.showListPolicy ? (
            <>
              <h4>List sync policy</h4>
              <p>
                Jetstream is primary. Audit polls and refresh cooldowns scale with list size
                (cooldown is global per list, independent of audit).
              </p>
              <table className="l2-properties-help-table">
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Audit poll</th>
                    <th>Refresh cooldown</th>
                  </tr>
                </thead>
                <tbody>
                  {BLUESKY_LIST_SYNC_POLICY_ROWS.map((row) => (
                    <tr key={row.size}>
                      <td>{row.size}</td>
                      <td>{row.audit}</td>
                      <td>{row.refreshCooldown}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
