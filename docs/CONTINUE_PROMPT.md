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

## What Was Also Done (continued)

### Phase 1 Complete ✓
- Enrichment storage: `post_enrichments` table + full CRUD module
- Enricher package type: `PluginKind: 'enricher'`, `EnricherManifest`, marketplace browse page
- Enricher sweep worker: `ingest-runner/src/enricher-sweep.ts` — finds un-enriched posts, batches, calls remote/WASM
- Enrichment field access: `enrichment_field` L2Expr node type, evaluator resolves from context
- Expanded L2Expr: log, sqrt, abs, floor, ceil, pow, min, max, clamp, cond, ratio
- Formula Builder: text editor + visual blocks + condition editor + multi-select + fn dropdown

### Phase 2 Complete ✓
- Custom code logic blocks: `evalCustomLogicBlock` hook in L2EvalInput — tries custom eval when native resolver returns null
- Sort modifier type: `SortModifier` with `mode: 'add' | 'multiply'`, `weight` multiplier
- Modifier stacking: `evalSortModifier` hook in evaluate.ts — base + addTotal × mulTotal pipeline

## Immediate TODO (Next Session)

### Phase 3: Personalization & Injectors
1. Native personalization config + UI tab (Personalization tab in feed workspace)
2. Viewer context pipeline (impression tracking, follow graph loading)
3. Native injectors (pinned posts, rotating posts) with viewer-aware impression caps
4. Custom injectors with viewer context

### Phase 4: Sources
5. Sources tab UI
6. Source nodes in visual editor (auto-appear when enabled)
7. Native sources (other project pool, static URI list)
8. Custom code sources

### Other UI
- Per-category tier filter in marketplace (All / Native / Custom Code)
- Feed workspace tabs (add Personalization, Injectors, Sources)
- Visual blocks formula builder refinements (live preview, better drag, undo)
