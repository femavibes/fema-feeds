# Starts a free Cloudflare quick tunnel so Bluesky OAuth gets a valid HTTPS hostname.
# Writes the URL to config/dev-public-url.txt for the API to use as OAUTH client_id.
#
# Usage: .\scripts\start-oauth-tunnel.ps1
# Requires: cloudflared (winget install Cloudflare.cloudflared)

param(
  [int]$WebPort = 5173,
  [int]$TimeoutSec = 60
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$UrlFile = Join-Path $Root 'config\dev-public-url.txt'
$LogFile = Join-Path $Root 'config\oauth-tunnel.log'

New-Item -ItemType Directory -Force -Path (Split-Path $UrlFile) | Out-Null

function Stop-CloudflaredQuick {
  Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'tunnel\s+--url' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Get-TunnelUrlFromText([string]$Text) {
  if (-not $Text) { return $null }
  if ($text -match '(https://[a-z0-9-]+\.trycloudflare\.com)') {
    return $Matches[1]
  }
  return $null
}

$cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
$cf = if ($cfCmd) { $cfCmd.Source } else { $null }
if (-not $cf) {
  Write-Error @"
cloudflared not found. Bluesky OAuth requires HTTPS (not http://127.0.0.1).

Install cloudflared, then re-run restart-dev.ps1:
  winget install Cloudflare.cloudflared
"@
  exit 1
}

Stop-CloudflaredQuick
if (Test-Path $LogFile) { Remove-Item $LogFile -Force }

Write-Output "Starting Cloudflare quick tunnel -> http://127.0.0.1:$WebPort ..."

$proc = Start-Process -FilePath $cf -ArgumentList @(
  'tunnel', '--url', "http://127.0.0.1:$WebPort", '--no-autoupdate'
) -PassThru -WindowStyle Hidden -RedirectStandardError $LogFile

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$url = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 1000
  if (Test-Path $LogFile) {
    $url = Get-TunnelUrlFromText (Get-Content $LogFile -Raw -ErrorAction SilentlyContinue)
    if ($url) { break }
  }
  if ($proc.HasExited) {
    $log = if (Test-Path $LogFile) { Get-Content $LogFile -Raw } else { '(no log)' }
    Write-Error "cloudflared exited early. Log:`n$log"
    exit 1
  }
}

if (-not $url) {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  $log = if (Test-Path $LogFile) { Get-Content $LogFile -Raw } else { '(no log)' }
  Write-Error "Timed out waiting for tunnel URL. Log:`n$log"
  exit 1
}

Set-Content -Path $UrlFile -Value $url -Encoding utf8 -NoNewline
Write-Output ""
Write-Output "OAuth public URL: $url"
Write-Output "Open the app at that URL (not localhost) so Bluesky login works."
Write-Output ""
