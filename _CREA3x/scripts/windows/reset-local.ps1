\
# Reset local Docker services (WARNING: removes volumes)
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location ../..

Write-Host "Stopping services and removing volumes..." -ForegroundColor Yellow
docker compose down -v

Write-Host ""
Write-Host "Done." -ForegroundColor Green
