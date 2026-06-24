# Exposes feedgen on this PC via Tailscale Funnel (HTTPS *.ts.net, no port forwarding).
#
# Prerequisites:
#   - Tailscale installed and signed in on this machine
#   - Funnel enabled for your tailnet (Tailscale admin → Funnel)
#   - API listening on $ApiPort (default 3000)
#
# Usage: .\scripts\start-feedgen-tailscale.ps1
# Then paste the printed https://….ts.net URL into Settings → Tailscale Funnel.

param(
  [int]$ApiPort = 3000
)

$ErrorActionPreference = 'Stop'

$tsCmd = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $tsCmd) {
  Write-Error @"
tailscale CLI not found.

1. Install Tailscale: https://tailscale.com/download
2. Sign in and enable Funnel in the admin console
3. Re-run this script
"@
  exit 1
}

Write-Output "Starting Tailscale Funnel -> http://127.0.0.1:$ApiPort ..."
Write-Output "Copy the https://….ts.net URL into Settings → Home → Tailscale Funnel → Save & test."
Write-Output ""

& $tsCmd.Source funnel $ApiPort
