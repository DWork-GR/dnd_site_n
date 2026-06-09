$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $root ".env"

function Read-EnvValue([string]$name, [string]$fallback = "") {
  if (-not (Test-Path $envPath)) { return $fallback }
  $line = Get-Content $envPath | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -Last 1
  if (-not $line) { return $fallback }
  return ($line -split "=", 2)[1].Trim()
}

$port = Read-EnvValue "PORT" "3000"
try {
  Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3 | Out-Null
} catch {
  throw "Start the site first with npm.cmd start."
}

$ssh = Get-Command ssh.exe -ErrorAction SilentlyContinue
if (-not $ssh) { throw "Windows OpenSSH is unavailable." }

Write-Host "Creating a backup localhost.run link..." -ForegroundColor Cyan
& $ssh.Source -T -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -R "80:127.0.0.1:$port" nokey@localhost.run
