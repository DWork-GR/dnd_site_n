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
$masterPassword = Read-EnvValue "MASTER_PASSWORD"
if ([string]::IsNullOrWhiteSpace($masterPassword) -or $masterPassword -in @("master", "change_this_password")) {
  throw "Set a strong MASTER_PASSWORD in .env before publishing."
}

try {
  Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3 | Out-Null
} catch {
  throw "Start the site first with npm.cmd start, then run npm.cmd run publish in a second window."
}

$ssh = Get-Command ssh.exe -ErrorAction SilentlyContinue
if (-not $ssh) {
  throw "Windows OpenSSH is unavailable. Install the Windows OpenSSH Client optional feature."
}

Write-Host ""
Write-Host "Creating a public HTTPS link..." -ForegroundColor Cyan
Write-Host "Send players the printed URL with /player.html at the end." -ForegroundColor Green
Write-Host "Keep this window open. Press Ctrl+C to stop publishing." -ForegroundColor Yellow
Write-Host ""

& $ssh.Source -T -p 443 -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -R "0:127.0.0.1:$port" free.pinggy.io
