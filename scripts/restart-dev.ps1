# Restart dev servers after code changes (Windows).
# Usage: .\scripts\restart-dev.ps1 [-Target api|web|all]

param(
  [ValidateSet('api', 'web', 'all')]
  [string]$Target = 'all',
  [int]$DelaySec = 2
)

$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path $PSScriptRoot -Parent
$LogDir = Join-Path $Root 'logs'
$LogFile = Join-Path $LogDir 'dev-restart.log'

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}

function Write-RestartLog([string]$Message) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $line = "[$stamp] $Message"
  Write-Output $line
  Add-Content -Path $LogFile -Value $line
}

function Stop-ListenPort([int]$Port) {
  # netstat is much faster than Get-NetTCPConnection on Windows (which can hang 30s+).
  # Do NOT use $pid as the loop variable — $PID is a read-only PowerShell automatic.
  $pattern = ":$Port\s+.*LISTENING\s+(\d+)\s*$"
  $listenerPids = @()
  foreach ($line in (netstat -ano)) {
    if ($line -match $pattern) {
      $listenerPids += [int]$Matches[1]
    }
  }
  foreach ($listenerPid in ($listenerPids | Select-Object -Unique)) {
    if ($listenerPid -gt 0) {
      Write-RestartLog "Stopping PID $listenerPid on port $Port"
      Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-RestartLog "=== Restart requested: $Target ==="
Start-Sleep -Seconds $DelaySec

switch ($Target) {
  'api' {
    Stop-ListenPort 3000
  }
  'web' {
    Stop-ListenPort 5173
    Stop-ListenPort 5174
  }
  'all' {
    Stop-ListenPort 3000
    Stop-ListenPort 5173
    Stop-ListenPort 5174
  }
}

Start-Sleep -Seconds 1

$startApi = $Target -in @('api', 'all')
$startWeb = $Target -in @('web', 'all')

if ($startApi) {
  Push-Location $Root
  Write-RestartLog 'Building API and dependencies…'
  & pnpm --filter @cfb/api... build 2>&1 | ForEach-Object { Write-RestartLog $_ }
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-RestartLog 'API build FAILED'
    Write-Error 'API build failed — see logs/dev-restart.log'
    exit 1
  }
  Pop-Location
  $apiLog = Join-Path $LogDir 'api-dev.log'
  Write-RestartLog "Starting API (log: logs/api-dev.log)"
  Start-Process -FilePath 'powershell.exe' -WorkingDirectory $Root -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    "Set-Location '$Root'; pnpm api 2>&1 | Tee-Object -FilePath '$apiLog' -Append"
  ) | Out-Null
}

if ($startWeb) {
  $webLog = Join-Path $LogDir 'web-dev.log'
  Write-RestartLog "Starting web dev server (log: logs/web-dev.log)"
  Start-Process -FilePath 'powershell.exe' -WorkingDirectory $Root -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    "Set-Location '$Root'; pnpm web 2>&1 | Tee-Object -FilePath '$webLog' -Append"
  ) | Out-Null
}

Write-RestartLog "Restarted: $Target"
