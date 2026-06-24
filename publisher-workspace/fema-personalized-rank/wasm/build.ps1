# Build fema-personalized-rank WASM for CFB upload.
$ErrorActionPreference = 'Stop'
$Proj = $PSScriptRoot
$Dist = Join-Path (Split-Path $Proj -Parent) 'dist'

$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:CARGO_TARGET_DIR = Join-Path $Proj 'target'

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  Write-Error 'cargo not found. Install Rust: https://rustup.rs'
}

rustup target add wasm32-wasip1 | Out-Null

Push-Location $Proj
try {
  cargo +stable-x86_64-pc-windows-gnu build --release --target wasm32-wasip1
  $wasm = Join-Path $Proj 'target\wasm32-wasip1\release\fema_personalized_rank.wasm'
  New-Item -ItemType Directory -Force -Path $Dist | Out-Null
  Copy-Item $wasm (Join-Path $Dist 'personalized-rank.wasm') -Force
  $public = Join-Path (Split-Path (Split-Path $Proj -Parent) -Parent) 'apps\web\public\plugin-examples'
  New-Item -ItemType Directory -Force -Path $public | Out-Null
  Copy-Item $wasm (Join-Path $public 'personalized-rank.wasm') -Force
  Write-Host "Built: $Dist\personalized-rank.wasm"
} finally {
  Pop-Location
}
