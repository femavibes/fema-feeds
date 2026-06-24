# CFB example plugin — reverse ranker

Reverses the organic candidate list at skeleton serve time. Use it to verify your WASM upload pipeline.

## Build (Rust + Extism PDK)

```powershell
# From repo root (requires rustup + wasm32-wasi target)
rustup target add wasm32-wasip1
cd examples/cfb-plugin-reverse-rank
cargo build --release --target wasm32-wasip1
# Output: target/wasm32-wasip1/release/cfb_plugin_reverse_rank.wasm
```

Or run:

```powershell
.\examples\cfb-plugin-reverse-rank\build.ps1
```

## Upload in CFB

1. Verified publisher → **New custom code** → kind **Ranker**, runtime **WASM**
2. Collection → package detail → upload `cfb_plugin_reverse_rank.wasm`
3. Publish → subscribe → apply on a feed **Sorting** tab
4. Preview skeleton — order should be reversed vs pool sort

## Contract

See in-app **Plugin developer guide** or `docs/WASM_PLUGINS.md`.
