# Run as Administrator (right-click → Run with PowerShell as admin).
# Dev-only: temporarily trusts localhost, creates cfb DB, sets postgres password to cfb_dev.
$ErrorActionPreference = 'Stop'

$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$pgCtl = 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe'
$dataDir = 'C:\Program Files\PostgreSQL\17\data'
$hba = Join-Path $dataDir 'pg_hba.conf'
$initSql = Join-Path $PSScriptRoot 'init.sql'
$backup = "$hba.bak-cfb-setup"

if (-not (Test-Path $psql)) { throw "PostgreSQL 17 not found" }

Copy-Item $hba $backup -Force
$content = Get-Content $hba -Raw
$content = $content -replace '127\.0\.0\.1/32\s+scram-sha-256', '127.0.0.1/32            trust'
$content = $content -replace '::1/128\s+scram-sha-256', '::1/128                 trust'
Set-Content $hba $content -NoNewline

& $pgCtl reload -D $dataDir
Start-Sleep -Seconds 2

Write-Host 'Setting postgres superuser password to cfb_dev (dev only)...'
& $psql -U postgres -h localhost -c "ALTER USER postgres PASSWORD 'cfb_dev';"

$env:POSTGRES_PASSWORD = 'cfb_dev'
& (Join-Path $PSScriptRoot 'setup-windows.ps1')

Copy-Item $backup $hba -Force
& $pgCtl reload -D $dataDir
Remove-Item $backup -Force -ErrorAction SilentlyContinue

Write-Host 'Postgres ready. postgres and cfb users both use password: cfb_dev'
