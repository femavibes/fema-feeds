# @cfb/core-types

Shared types only. **No runtime dependencies.** Safe for any package to import.

## Exports

- `NormalizedPost` — canonical post shape after Jetstream normalization
- `ProjectL1Config` — per-project L1 settings (from JSON / DB later)
- `L1StepId`, `L1EvalTrace` — filter pipeline types

## Does NOT contain

- Jetstream client code
- Database types
- L2 rule tree types (separate package later)
