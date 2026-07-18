# L2 visual editor — node colors

Canonical palette for the match-graph canvas. Tokens live on `.l2-visual-canvas` in `apps/web/src/styles/app.css`.

## Axes

Color encodes **role**, not node subtype among natives:

1. **Native leaf** — green for every built-in condition (keyword, regex, engagement math, score, scout, substitute, …).
2. **Logic frame** — group chrome by operator (AND / OR / N-of / NONE).
3. **Provenance** — overrides leaf chrome when the node came from collection, a subscription, or custom code.

Score keeps a dedicated React Flow node type for the `+N` layout, but uses the same green condition chrome as other natives. Do not give score (or engagement math) a special hue.

## Tokens

| Token | Hex | Used for |
|-------|-----|----------|
| `--l2-condition` | `#22c55e` | Native condition leaves (incl. score, engagement math) |
| `--l2-and` | `#3b82f6` | AND group frames |
| `--l2-or` | `#f97316` | OR group frames |
| `--l2-nof` | `#a855f7` | N-of group frames |
| `--l2-provenance-collection` | `#14b8a6` | My collection blocks |
| `--l2-provenance-subscription` | `#f43f5e` | Subscribed logic blocks (rose) |
| `--l2-provenance-custom` | `#f59e0b` | Custom CODE nodes |
| (danger) | `var(--danger)` | NONE / NOT group frames |

## Provenance badges

Collection and subscription leaves also show a corner badge (★ / `Sub`). Custom code shows `{ }`. Badges sit **top-right** so titles stay left-aligned.

| Provenance | Badge | Class |
|------------|-------|-------|
| `collection` | ★ | `.l2-flow-condition-source-badge` |
| `subscription` | Sub | `.l2-flow-condition-source-badge` |
| `custom_code` | `{ }` | `.l2-flow-condition-code-badge` |
| `native` | — | default green |

Stored on the draft as `visualLayout.nodeSources[id]`.

## Expand / collapse

Leaf detail is **collapsed by default** (type + op chrome). Expanded bodies (e.g. keyword terms) are opt-in via `visualLayout.expandedNodeIds`.

| Control | Behavior |
|---------|----------|
| Leaf chevron | Toggle that leaf in `expandedNodeIds` |
| Group **collapse all** | Remove every descendant leaf id (any depth) from `expandedNodeIds` |
| Group **expand all** | Add every descendant leaf id to `expandedNodeIds` |

Group frames themselves are not collapsed — only their leaf contents. Nested layout remeasures automatically; root positions are not auto-reflowed (user can drag if expand overlaps a neighbor).

See also: keyword expanded body = one term per line, truncated; full list in properties.

## CSS entry points

- Tokens: `.l2-visual-canvas { --l2-… }`
- Leaves: `.l2-flow-condition`, `.l2-flow-condition.l2-flow-provenance-*`
- Score layout: `.l2-flow-score` / `.l2-flow-score-points` (color inherits condition / provenance)
- Frames: `.l2-group-frame.logic-all` / `.logic-any` / `.logic-nof` / `.logic-none`
- Expand: `.l2-flow-condition-expand`, `.l2-flow-condition-body`, `.l2-group-frame-collapse-btns`

## Rules of thumb

- Prefer tokens over hard-coded hex in new styles.
- Provenance hues must stay distinct from each other **and** from AND / OR / N-of.
- Native subtype (scoring vs text vs engagement) is shown by title / expanded body, not by a second color lane.
