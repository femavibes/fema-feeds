# Build the reverse-rank example WASM plugin.
$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Proj = $PSScriptRoot

$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  Write-Error 'cargo not found. Install Rust: https://rustup.rs'
}

Write-Host 'Adding wasm32-wasip1 target…'
rustup target add wasm32-wasip1 | Out-Null

Push-Location $Proj
try {
  Write-Host 'Building release WASM…'
  cargo build --release --target wasm32-wasip1
  $wasm = Join-Path $Proj 'target\wasm32-wasip1\release\cfb_plugin_reverse_rank.wasm'
  $dist = Join-Path $Proj 'dist'
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  Copy-Item $wasm (Join-Path $dist 'reverse-rank.wasm') -Force
  Write-Host "Built: $dist\reverse-rank.wasm"
} finally {
  Pop-Location
}
