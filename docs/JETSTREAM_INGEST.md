# Jetstream ingest compile & eval

> **Status:** Active — reference this doc when changing pool / jetstream filter behavior.  
> **Code:** `packages/l1-compile`, `packages/l1-filters/src/ingest-gate.ts`, `apps/web` Filters panel.

---

## Purpose

Live feeds with **jetstream filter** (pool) on compile into a **project ingest gate** — one boolean expression per project, evaluated on every Jetstream post before it enters the shared project pool. L2 on individual feeds refines further.

**Source of truth:** feed graphs (canvas edges + nodes), same resolution as L2 eval (`resolveFeedMatch`).

---

## Product rules

| Pool toggle | Meaning |
|-------------|---------|
| **On** | Node participates in the **project ingest gate** at Jetstream. |
| **Off** | Node runs at **L2 only** (after the post is already in the pool). |

**Faithfulness rule:** The project gate must **never be stricter** than the combined feed graphs. If a feed allows `Spanish ∨ fafa`, ingest must not require `Spanish ∧ fafa`.

**Project-wide** does **not** mean “this node type always hoists.” It means: **this conjunct appears on every OR path** after compile (mandatory intersection).

---

## Pipeline (path-first)

```
Feed graphs (canvas)
  → resolveFeedMatch (per feed)
  → DNF path expansion (OR of AND paths, pool-on leaves only)
  → project OR-merge (all feeds’ paths)
  → mandatory conjunct extraction (intersection across all paths)
  → split mandatory: restricts / blocks / (discovery AND prefix)
  → remaining paths → discovery OR tree
  → optimize (dedupe, feed-scoped hoist, cheap-first ordering)
  → eval at Jetstream
```

### 1. Path expansion (per feed)

- Canvas: each `start → … → end` route is one **OR** branch.
- Serial nodes on a route are **AND**.
- Nested `any` / `all` groups expand to DNF (OR of ANDs).
- Only **pool-on** nodes become conjuncts; pool-off nodes are omitted (not failures).

### 2. Project merge

Concatenate all OR paths from all live feeds. Paths keep `sourceFeedId` / `sourceNodeId` provenance.

### 3. Mandatory conjuncts (true project-wide)

A leaf rule is **mandatory** iff it appears (semantically, same `semanticRuleKey`) on **every** OR path in the project.

Examples:

| Graph | Mandatory |
|-------|-----------|
| `ANY(Spanish, fafa)` | *none* — Spanish is not on the `fafa` path |
| `ANY(HAHAHA, Spanish)` | *none* |
| Spanish on every path of every feed | Spanish → project requirement |
| `SPAM` exclude on every path | project block |

**Every path, not every feed.** A rule on NEWFEED2 only applies project-wide if that same rule also appears on every other OR path (NEWFEED path 1, NEWFEED path 2, NEWFEED3 paths, etc.). Different feeds with different routes usually means path-local rules stay inside discovery paths.

Mandatory conjuncts are **removed** from individual paths and evaluated in fixed pre-OR phases (for fail-fast). Remaining paths are discovery **OR**.

### 4. Role labels (for UI & ordering, not placement)

| Leaf kind | Role | Mandatory phase |
|-----------|------|-----------------|
| Language, post kind, embed flags | **requirement** | AND — must pass |
| Keyword/hashtag/regex/labels **exclude**, author `not_in_list` | **block** | reject if matched |
| Keyword/hashtag/regex/labels **include**, author `in_list`, follow ring include | **discovery** | path AND / OR |

Path-local blocks are conjuncts on that path only (`evalPathConjunct`: exclude must **not** match).

### 5. Optimize (semantics-preserving)

- Dedupe identical OR paths.
- Hoist shared AND conjuncts **within one feed’s paths** (not across feeds unless already mandatory).
- Sort AND children and mandatory phases **cheap-first** (embed → language → hashtag → author → keyword).

### 6. Runtime order (performance)

1. **Authors only** (if on and discovery paths exist) — union of all `in_list` author branches; strangers fail early.  
   *Known limitation:* can be stricter than a path with no author node; see [Open questions](#open-questions).
2. **Project requirements** — mandatory restrict conjuncts.
3. **Project blocks** — mandatory exclude conjuncts (cheap-first).
4. **Discovery OR** — remaining paths; each path AND uses `evalPathConjunct` (includes path-local excludes).

---

## Stored shape (`CompiledIngestGate`)

```ts
{
  restrictBranches?: IngestGateBranch[]   // mandatory requirements
  excludeBranches: IngestGateBranch[]    // mandatory blocks
  includeBranches: IngestGateRule[]      // discovery OR (may be ALL(mandatoryDiscovery…, ANY(paths)))
}
```

---

## UI (Filters page)

Sections mirror eval order:

1. **Prefilter** tab — visual editor for always-on project ingest graph (ingest-eligible nodes only)
2. **Compiled** preview — check order, project requirements/blocks, pool entry paths
3. Feeds — L2 refinement only (no per-node jetstream toggle)

Empty prefilter = permissive pool (whole Jetstream).

Flow line: `Authors only → Project requirements → Project blocks → Pool entry paths`.

Legacy projects without `prefilter` keep feed-compiled `ingestGate` until the prefilter field is saved.

---

## Contrasts with older type-based compile

| Old (wrong for OR) | New (path-first) |
|--------------------|------------------|
| Language pool-on → always `restrictBranches` | Spanish only mandatory if on **every** path |
| `ANY(Spanish, fafa)` → `Spanish ∧ (…∨ fafa)` | `Spanish ∨ fafa` preserved |
| Excludes always global | Excludes global only if mandatory on all paths |

---

## Open questions

- **Authors only:** Should strangers be blocked only when **every** path implies author, or keep current “any feed toggled authors-only → project wall”?
- **Cross-feed mandatory:** Spanish on all paths of feed3 only — not mandatory project-wide (feed1’s `HAHAHA` path has no Spanish). Correct per faithfulness rule.
- **NONE / N-of groups:** Expanded via compiled subtree in path (not full DNF) until needed.

---

## Related docs

- [BUILD_INGEST_L1.md](./BUILD_INGEST_L1.md) — broader L1 slice
- [PLAN.md](./PLAN.md) — pool vs L2 architecture
