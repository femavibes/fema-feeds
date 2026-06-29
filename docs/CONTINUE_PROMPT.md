# Continue Session — WaffleIndex (Custom Feed Builder)

## First Steps
1. Read `docs/SESSION_CONTINUE.md` for full context on what was done and what's next
2. Read `docs/CUSTOM_CODE_EXTENSIONS.md` for the full marketplace/plugin/enricher design
3. Read `docs/MARKETPLACE_ARCHITECTURE.md` for backend implementation status

## Project Location
`D:\Custom Feed Builder` on Windows 11

## What Was Done This Session

### 1. Project Pool Tab ✓
- New "Pool" tab on project right sidebar (Save | Pool | Test)
- `GET /api/projects/:id/pool` endpoint with cursor pagination
- `ProjectPoolPanel` component reusing `PoolMatchSampleRow`
- `listProjectPoolPosts` in `@cfb/l2-worker` with author/media enrichment

### 2. Rename Rankers → Personalization ✓
- All user-facing labels changed across marketplace, developer guide, feed sections
- Internal type names (`'ranker'`, `PluginKind`) unchanged (API contract)

### 3. Sort Pack Toggle UX ✓
- Sort pack is now a proper 4th toggle (last position) in sort mode radio group
- When active: shows marketplace pack selector at top, read-only dials below in two-column grid
- Active pack highlighted in list with accent border
- Sort pack list removed from other mode views
- Copy button on raw expression (with "Copied!" feedback)

### 4. Marketplace Sidebar Redesign ✓
- "Plugins" → "Packages" rename
- Removed "Custom code" subtitle/grouping
- Flat list: Featured, Logic blocks, Sort packs, Injectors, Personalization
- Each category page will have All/Native/Custom Code filter (not yet built)

### 5. Expanded L2Expr Operators ✓
- New types: `unary` (log, sqrt, abs, floor, ceil, neg), `clamp`, `cond`, `ratio`
- Extended binary ops: `**` (power), `min`, `max`
- Evaluator updated in `packages/l2-eval/src/expr.ts`
- All 37 existing tests pass

### 6. Formula Builder (Sort Mode) ✓
- New "Formula builder" sort mode (5th toggle: Chronological | Engagement | Custom formula | Formula builder | Sort pack)
- Formula text editor — users write math formulas directly
- Parser: `apps/web/src/lib/formula-parser.ts` — text → L2Expr compiler
- Decompiler: L2Expr → human-readable text
- Click-to-insert field/function chips
- 10 template presets (Engagement, Log engagement, Engagement rate, Sqrt fairness, etc.)
- Real-time validation (valid ✓ / error with position)
- Compiled JSON output with Copy button

### 7. Sort Formula Compiler ✓
- `apps/web/src/lib/sort-formula.ts` — SortFormula config type + compiler
- Per-signal transforms, derived signals, conditionals, decay, limits
- `compileSortFormula()` → L2Expr
- (Used internally by builder, may be useful for future programmatic formula building)

### 8. Enrichment Storage ✓
- `post_enrichments` table (post_uri + enricher_id → JSONB data)
- Migration: `database/migrations/033_post_enrichments.sql` (applied)
- Storage module: `packages/storage-postgres/src/post-enrichments.ts`
- Functions: get, getBatch, upsert, upsertBatch, delete, countUnenriched, listUnenriched

### 9. Custom Code Extensions Design Doc ✓
- `docs/CUSTOM_CODE_EXTENSIONS.md` — comprehensive design for:
  - 6 package categories (Logic Blocks, Sort Packs, Enrichers, Personalization, Injectors, Sources)
  - Bundles + dependencies
  - Custom code logic blocks + sort packs
  - Modifier stacking (add/multiply on sort)
  - Native personalization config
  - Injectors with viewer context
  - Sources (custom inputs to visual editor)
  - Sorting vs Personalization distinction
  - Implementation phases

## Immediate TODO (Next Session)

### 1. Visual Blocks for Formula Builder — NEXT UP
The formula text editor works but needs a complementary visual block view:
- Each "term" in the formula is a draggable block
- Click to edit, drag to reorder, × to delete
- Synced with text editor (edit either, both update)
- Block picker to add new terms

### 2. Per-category tier filter in marketplace
Each browse page needs [All] [Native] [Custom Code] filter bar at top.

### 3. Enricher package type
- Add `'enricher'` to `PluginKind` in core-types
- Enricher manifest (trigger mode, target scope)
- Background sweep worker skeleton

### 4. Live preview for formula builder
- Show real posts from pool scored by current formula
- Updates as you type/edit

### 5. Native personalization config + UI tab
- Feed workspace: add Personalization tab
- Built-in toggles: boost followed, boost mutuals, suppress seen, author diversity

## Architecture Context

### Feed Workspace Tabs (planned)
```
Visual Editor | Sorting | Personalization | Injectors | Sources | Settings
```

### Sort Modes
```
Chronological | Engagement | Custom Formula | Formula Builder | Sort Pack
```

### Marketplace Structure
```
Marketplace
Packages
├─ Browse (flat list, each with All/Native/Custom Code filter)
│   ├─ Featured
│   ├─ Logic Blocks
│   ├─ Sort Packs
│   ├─ Enrichers (future)
│   ├─ Personalization
│   ├─ Injectors
│   ├─ Sources (future)
│   └─ Bundles (future)
├─ Subscriptions
└─ Collection

### Pipeline
```
Ingest → Pool → Enrichers → L2 eval (logic blocks + sort + modifiers) → candidates
                                                                          ↓
                              getFeedSkeleton → Personalization → Injectors → skeleton
```

### Key New Files
| File | Purpose |
|------|---------|
| `packages/l2-worker/src/list-project-pool.ts` | Pool posts listing with enrichment |
| `apps/web/src/components/ProjectPoolPanel.tsx` | Pool tab UI |
| `apps/web/src/lib/formula-parser.ts` | Formula text → L2Expr parser + decompiler |
| `apps/web/src/lib/sort-formula.ts` | SortFormula config type + compiler |
| `apps/web/src/components/l2/SortFormulaBuilder.tsx` | Formula text editor UI |
| `packages/storage-postgres/src/post-enrichments.ts` | Enrichment storage module |
| `database/migrations/033_post_enrichments.sql` | Enrichment table schema |
| `docs/CUSTOM_CODE_EXTENSIONS.md` | Full extension system design |
| `docs/MARKETPLACE_ARCHITECTURE.md` | Backend implementation status |

### Important Technical Notes (carried over + new)
- CSS file has mixed line endings — PowerShell scripts work better than fsReplace for multi-line edits
- `L2Expr` now has 7 node types: literal, field, binary (+,-,*,/,**,min,max), unary (log,sqrt,abs,floor,ceil,neg), clamp, cond, ratio
- Formula parser handles: fields, numbers, +,-,*,/,**, parens, function calls, if(cond, then, else)
- `post_enrichments` table exists — keyed by (post_uri, enricher_id), JSONB data column
- Sort mode `'builder'` uses the formula text editor; `'custom'` uses the existing dial system
- Marketplace sidebar is now flat (no Custom code grouping), label says "Packages"
