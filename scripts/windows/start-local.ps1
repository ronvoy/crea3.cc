\
# Start Keycloak + Mailpit (and Postgres) for CREA local dev
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location ../..

if (-not (Test-Path ".\.env")) {
  Write-Host "No .env found. Copying .env.example -> .env" -ForegroundColor Yellow
  Copy-Item ".\.env.example" ".\.env"
}

Write-Host "Starting Docker services (db, keycloak, keycloak-init, mailpit)..." -ForegroundColor Yellow
docker compose up -d

Write-Host ""
Write-Host "Services:" -ForegroundColor Cyan
docker compose ps

Write-Host ""
Write-Host "Key URLs:" -ForegroundColor Cyan
Write-Host "  Keycloak Admin: http://localhost:8080/admin (admin/admin)"
Write-Host "  Mailpit Inbox:  http://localhost:8025"
Write-Host ""
Write-Host "If Keycloak is not Up yet, check logs:" -ForegroundColor Yellow
Write-Host "  docker compose logs -f keycloak"
Write-Host ""
Write-Host "If you change SMTP_* in .env, re-apply to Keycloak:" -ForegroundColor Yellow
Write-Host "  docker compose up -d keycloak-init"
