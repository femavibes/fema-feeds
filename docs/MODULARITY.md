# Modularity & Code Principles

> Every package should be swappable. Direction changes should not require rewrites.

---

## 1. Package boundaries

```
                    ┌─────────────────┐
                    │  apps/ingest    │  wires things together (thin)
                    └────────┬────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
┌─────────────┐      ┌─────────────┐         ┌─────────────┐
│ ingest-     │      │ l1-eval     │         │ storage-*   │  (later)
│ jetstream   │      │ l1-compile  │         │             │
└──────┬──────┘      └──────┬──────┘         └─────────────┘
       │                    │
       └────────┬───────────┘
                ▼
         ┌─────────────┐
         │ post-       │  shared contract — no DB, no WS
         │ normalize   │
         └──────┬──────┘
                ▼
         ┌─────────────┐
         │ core-types  │  types only, zero runtime deps
         └─────────────┘
```

**Rule:** dependencies point **inward**. `core-types` depends on nothing. `l1-filters` depends on `core-types` + `l1-registry` only — never on Postgres, never on Jetstream.

---

## 2. One file, one job

| Package | File pattern | Example |
|---------|--------------|---------|
| `l1-filters` | one filter per file | `language.ts`, `has-video.ts` |
| `l1-registry` | registry + step order | `registry.ts`, `step-order.ts` |
| `post-normalize` | one extractor per concern | `embed-flags.ts`, `langs.ts` |

Max ~150 lines per file. Split when a file grows past that.

---

## 3. Interfaces over implementations

All cross-package contracts are **TypeScript interfaces** in `core-types` or `l1-registry`:

```ts
// Consumers depend on this, not on concrete classes
interface L1FilterStep {
  readonly id: L1StepId
  evaluate(ctx: L1EvalContext, config: ProjectL1Config): L1StepResult
}
```

Swap implementations by changing wiring in `apps/ingest`, not internals.

---

## 4. Compile vs runtime

| Phase | When | Output |
|-------|------|--------|
| **Compile** | Project L1 config saved | `CompiledL1` blob — no JSON walking at stream time |
| **Runtime** | Each Jetstream post | `L1EvalTrace` — which steps pass/fail per project |

`l1-compile` and `l1-eval` are separate packages so we can test eval without Jetstream.

---

## 5. Storage is a plugin (later)

Ingest pipeline emits events:

```ts
type IngestSink = (event: IngestEvent) => Promise<void>
```

v1 sinks: `ConsoleSink`, `MemorySink`  
v2 sink: `PostgresSink`

L1 engine does not know Postgres exists.

---

## 6. Documentation requirement

Every package **must** have:

- `README.md` — purpose, public API, what it does NOT do
- JSDoc on exported types and functions
- `docs/packages/<name>.md` for non-obvious design (optional but encouraged)

Every L1 filter file documents:
- Cost tier
- Config shape it reads
- Bypass behavior with author fast-path

---

## 7. Testing strategy

| Package | Test without |
|---------|--------------|
| `l1-filters` | Jetstream, DB — pure unit tests with fixture posts |
| `l1-eval` | Jetstream — mock `NormalizedPost[]` |
| `post-normalize` | Jetstream — fixture JSON from `_ref/` |
| `ingest-jetstream` | Integration only — optional, behind env flag |

---

## 8. What we are NOT doing

- One giant `engine.ts` that imports everything
- Shared mutable global state (except explicit caches with TTL + docs)
- L2 logic inside L1 packages
- Python + TypeScript dual evaluators (feed-gen mistake)

---

## 9. Adding a new L1 filter (checklist)

1. Add `L1StepId` to `core-types`
2. Add position in `l1-registry/step-order.ts`
3. Create `l1-filters/<name>.ts`
4. Register in `l1-filters/index.ts`
5. Add config type to `ProjectL1Config`
6. Add unit tests in `l1-filters/<name>.test.ts`
7. Document in `l1-filters/README.md`

No changes to Jetstream or storage required.
