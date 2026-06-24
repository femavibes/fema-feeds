# Expose the local API as HTTPS on your DuckDNS hostname (required for Bluesky feedgen).
#
# Prerequisites:
#   1. API running on port 3000 (pnpm api or Restart API in Settings)
#   2. DuckDNS synced (Settings → Feed publishing → Sync DuckDNS)
#   3. Router port-forward TCP 80 and 443 → this PC's LAN IP
#   4. Caddy installed: winget install Caddy.Caddy
#
# Usage:
#   .\scripts\start-feedgen-https.ps1
#   .\scripts\start-feedgen-https.ps1 -HostName femafeeds.duckdns.org -ApiPort 3000

param(
  [string]$HostName = 'femafeeds.duckdns.org',
  [int]$ApiPort = 3000
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent

function Test-ApiUp([int]$Port) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-ApiUp $ApiPort)) {
  Write-Error "API is not responding on http://127.0.0.1:$ApiPort — start it first (pnpm api or Settings → Restart API)."
}

$caddy = Get-Command caddy -ErrorAction SilentlyContinue
if (-not $caddy) {
  Write-Host @"
Caddy is not installed. Bluesky requires HTTPS on port 443.

Install:
  winget install Caddy.Caddy

Then re-run:
  .\scripts\start-feedgen-https.ps1 -HostName $HostName
"@
  exit 1
}

$lanIp = (
  Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1 -ExpandProperty IPAddress
)

Write-Host "=== Feedgen HTTPS proxy ==="
Write-Host "Public host:  https://$HostName"
Write-Host "Backend:      http://127.0.0.1:$ApiPort"
if ($lanIp) {
  Write-Host "This PC LAN:  $lanIp  (forward router TCP 80+443 here)"
}
Write-Host ""
Write-Host "After Caddy starts, test from your phone (not Wi‑Fi):"
Write-Host "  https://$HostName/.well-known/did.json"
Write-Host "  https://$HostName/xrpc/app.bsky.feed.describeFeedGenerator"
Write-Host ""
Write-Host "Press Ctrl+C to stop Caddy."
Write-Host ""

$caddyDir = Join-Path $Root 'logs'
if (-not (Test-Path $caddyDir)) { New-Item -ItemType Directory -Path $caddyDir | Out-Null }

$caddyfile = @"
$HostName {
  reverse_proxy 127.0.0.1:$ApiPort
}
"@

$configPath = Join-Path $caddyDir 'Caddyfile.feedgen'
Set-Content -Path $configPath -Value $caddyfile -Encoding utf8

& caddy run --config $configPath
