# Windows-friendly wrapper — runs bash script via Git Bash/WSL if available, else minimal PowerShell path.
param(
  [string]$Slug = $env:CFB_DEPLOYMENT_SLUG,
  [string]$DnsBase = $(if ($env:CFB_DNS_BASE) { $env:CFB_DNS_BASE } else { 'feeds.fema.monster' })
)

$Root = Split-Path $PSScriptRoot -Parent
$Bash = Get-Command bash -ErrorAction SilentlyContinue

if ($Bash) {
  if ($Slug) { $env:CFB_DEPLOYMENT_SLUG = $Slug }
  if ($DnsBase) { $env:CFB_DNS_BASE = $DnsBase }
  & bash "$Root/scripts/provision-feed-url.sh"
  exit $LASTEXITCODE
}

# Minimal fallback: detect IP and print instructions (no DNS without bash + curl flow)
Write-Host 'bash not found — install Git Bash/WSL or run on your Linux VPS.' -ForegroundColor Yellow
try {
  $ip = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 8).Trim()
  Write-Host "Detected public IP: $ip"
} catch {
  Write-Host 'Could not detect public IP.'
  exit 1
}

if (-not $Slug) {
  $Slug = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
}
$host = "$Slug.$DnsBase"
Write-Host "Suggested URL: https://$host"
Write-Host 'Configure DNS A record manually or run this script on the VPS with bash.'
