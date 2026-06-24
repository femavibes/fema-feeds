# Idempotent Postgres setup for native Windows install.
# Usage:
#   $env:POSTGRES_PASSWORD = 'your-installer-password'
#   .\database\setup-windows.ps1

param(
  [string]$PostgresPassword = $env:POSTGRES_PASSWORD,
  [string]$AppPassword = 'cfb_dev',
  [string]$DbName = 'custom_feed_builder',
  [string]$AppUser = 'cfb'
)

$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$initSql = Join-Path $PSScriptRoot 'init.sql'

if (-not (Test-Path $psql)) {
  throw "psql not found at $psql - install PostgreSQL 17 first (see database/README.md)"
}

if (-not $PostgresPassword) {
  throw @"
Set the postgres superuser password from the installer, then re-run:

  `$env:POSTGRES_PASSWORD = 'your-password'
  .\database\setup-windows.ps1
"@
}

$env:PGPASSWORD = $PostgresPassword

Write-Host "Checking postgres connection..."
& $psql -U postgres -h localhost -tAc 'SELECT 1' | Out-Null

$userExists = & $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$AppUser'"
if ($userExists -ne '1') {
  Write-Host "Creating user $AppUser..."
  & $psql -U postgres -h localhost -c "CREATE USER $AppUser WITH PASSWORD '$AppPassword';"
} else {
  Write-Host "User $AppUser already exists - resetting password for dev..."
  & $psql -U postgres -h localhost -c "ALTER USER $AppUser WITH PASSWORD '$AppPassword';"
}

$dbExists = & $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname = '$DbName'"
if ($dbExists -ne '1') {
  Write-Host "Creating database $DbName..."
  & $psql -U postgres -h localhost -c "CREATE DATABASE $DbName OWNER $AppUser;"
} else {
  Write-Host "Database $DbName already exists."
}

Write-Host "Applying schema from init.sql..."
& $psql -U postgres -h localhost -d $DbName -f $initSql

Write-Host "Granting table access to $AppUser..."
& $psql -U postgres -h localhost -d $DbName -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $AppUser;"
& $psql -U postgres -h localhost -d $DbName -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $AppUser;"
& $psql -U postgres -h localhost -d $DbName -c "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $AppUser;"
& $psql -U postgres -h localhost -d $DbName -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $AppUser;"

Write-Host "Transferring table ownership to $AppUser (native migrations)..."
& $psql -U postgres -h localhost -d $DbName -f (Join-Path $PSScriptRoot 'migrations\002_ownership.sql')

$env:PGPASSWORD = $AppPassword
$tables = & $psql -U $AppUser -h localhost -d $DbName -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
Write-Host "Done. public tables: $tables"
Write-Host ""
Write-Host "DATABASE_URL=postgresql://${AppUser}:${AppPassword}@localhost:5432/${DbName}"
