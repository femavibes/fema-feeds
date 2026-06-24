# One-command Docker deploy for Custom Feed Builder.
#
# Home PC (no port forwarding):  .\scripts\docker-up.ps1 -Profile home
# VPS / cloud server (DuckDNS):  .\scripts\docker-up.ps1 -Profile vps

param(
  [ValidateSet('home', 'vps')]
  [string]$Profile = 'home'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'Docker not found. Install Docker Desktop, then re-run this script.'
  exit 1
}

if ($Profile -eq 'home') {
  Write-Output 'Starting home profile (Cloudflare Tunnel — no router setup)...'
  Write-Output 'Set CLOUDFLARE_TUNNEL_TOKEN and FEEDGEN_PUBLIC_URL in .env before first run.'
  docker compose -f docker-compose.yml -f docker-compose.home.yml up -d --build
} else {
  Write-Output 'Starting VPS profile (DuckDNS + Caddy HTTPS on 443)...'
  Write-Output 'Set DUCKDNS_SUBDOMAIN and DUCKDNS_TOKEN in .env before first run.'
  docker compose -f docker-compose.yml -f docker-compose.ez.yml up -d --build
}

Write-Output ''
Write-Output 'Stack is up. Open the app and go to Settings → Feed publishing to finish setup.'
