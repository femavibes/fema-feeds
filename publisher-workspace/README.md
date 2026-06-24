# Publisher workspace

Source code for **marketplace plugins you publish** (e.g. under fema.monster). This is **not** where CFB stores installed plugin artifacts at runtime — those live in Postgres (`plugin_packages.wasm_artifact`) and optional future on-disk cache paths managed by the deployment.

| Path | Purpose |
|------|---------|
| `publisher-workspace/` | Dev + build source (you and the agent edit here) |
| `plugin_packages` (DB) | Published WASM bytes per version |
| `apps/web/public/plugin-examples/` | Demo downloads only |

Each subfolder is a publishable package: TypeScript reference engine, WASM build, manifest, and README.
