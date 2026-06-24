# Runs a named Cloudflare Tunnel so Bluesky can reach feedgen on this machine.
# Use with a stable hostname from Cloudflare Zero Trust (not trycloudflare.com).
#
# Prerequisites:
#   winget install Cloudflare.cloudflared
#   CLOUDFLARE_TUNNEL_TOKEN in .env (tunnel service URL → http://127.0.0.1:3000)
#   FEEDGEN_PUBLIC_URL=https://your-tunnel-hostname
#
# Usage: .\scripts\start-feedgen-cloudflare.ps1

param(
  [int]$ApiPort = 3000
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $Root '.env'

function Read-DotEnvValue([string]$Path, [string]$Key) {
  if (-not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content $Path) {
    if ($line -match "^\s*#") { continue }
    if ($line -match "^\s*$Key\s*=\s*(.+)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

$token = $env:CLOUDFLARE_TUNNEL_TOKEN
if (-not $token) { $token = Read-DotEnvValue $EnvFile 'CLOUDFLARE_TUNNEL_TOKEN' }
$publicUrl = $env:FEEDGEN_PUBLIC_URL
if (-not $publicUrl) { $publicUrl = Read-DotEnvValue $EnvFile 'FEEDGEN_PUBLIC_URL' }

if (-not $token) {
  Write-Error @"
CLOUDFLARE_TUNNEL_TOKEN not set.

1. Cloudflare Zero Trust → Networks → Tunnels → Create tunnel
2. Public Hostname → http://127.0.0.1:$ApiPort
3. Add to .env:
   CLOUDFLARE_TUNNEL_TOKEN=your-token
   FEEDGEN_PUBLIC_URL=https://feeds.yourdomain.com
"@
  exit 1
}

$cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cfCmd) {
  Write-Error 'cloudflared not found. Install: winget install Cloudflare.cloudflared'
  exit 1
}

Write-Output "Starting Cloudflare tunnel (feedgen -> http://127.0.0.1:$ApiPort)..."
if ($publicUrl) {
  Write-Output "Public URL: $publicUrl"
  Write-Output "After tunnel connects, verify: $publicUrl/.well-known/did.json"
}

$env:TUNNEL_TOKEN = $token
& $cfCmd.Source tunnel --no-autoupdate run
