$ErrorActionPreference = "Stop"

$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
if (-not (Test-Path -LiteralPath $psql)) {
  throw "PostgreSQL 16 не найдена по адресу: $psql"
}

Write-Host "Настройка локальной базы D&D Archive" -ForegroundColor DarkYellow
$securePassword = Read-Host "Введите пароль пользователя postgres" -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential("postgres", $securePassword)
$env:PGPASSWORD = $credential.GetNetworkCredential().Password
$secureMasterPassword = Read-Host "Придумайте пароль для входа мастера на сайт" -AsSecureString
$masterCredential = New-Object System.Management.Automation.PSCredential("master", $secureMasterPassword)
$masterPassword = $masterCredential.GetNetworkCredential().Password
if ([string]::IsNullOrWhiteSpace($masterPassword)) {
  throw "Пароль мастера не может быть пустым."
}

try {
  & $psql -w -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -tAc "SELECT 1" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Не удалось войти в PostgreSQL. Проверьте пароль пользователя postgres и повторите команду."
  }

  & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dnd_app') THEN
    CREATE ROLE dnd_app LOGIN PASSWORD 'dnd_local_only';
  ELSE
    ALTER ROLE dnd_app WITH LOGIN PASSWORD 'dnd_local_only';
  END IF;
END
`$`$;
"@
  if ($LASTEXITCODE -ne 0) {
    throw "Не удалось создать пользователя dnd_app."
  }

  $databaseExists = & $psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'dnd_archive'"
  if ($LASTEXITCODE -ne 0) {
    throw "Не удалось проверить существование базы dnd_archive."
  }

  if ([string]::IsNullOrWhiteSpace(($databaseExists -join "")) -or ($databaseExists -join "").Trim() -ne "1") {
    & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE dnd_archive OWNER dnd_app"
    if ($LASTEXITCODE -ne 0) {
      throw "Не удалось создать базу dnd_archive."
    }
  }

  & $psql -h localhost -U postgres -d dnd_archive -v ON_ERROR_STOP=1 -c "GRANT ALL ON SCHEMA public TO dnd_app"
  if ($LASTEXITCODE -ne 0) {
    throw "Не удалось выдать права пользователю dnd_app."
  }

  @"
DATABASE_URL=postgresql://dnd_app:dnd_local_only@localhost:5432/dnd_archive
PORT=3000
HOST=0.0.0.0
MASTER_PASSWORD=$masterPassword
DB_RETRY_ATTEMPTS=8
DB_RETRY_DELAY_MS=750
DB_STARTUP_ATTEMPTS=40
"@ | Set-Content -LiteralPath ".env" -Encoding utf8

  Write-Host ""
  Write-Host "База готова. Запустите сайт командой: npm start" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
