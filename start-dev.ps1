# ==============================================================================
# NetStarterPack Microservices — One-Click Development Launcher
# Menjalankan Gateway.Api (:5080), Identity.Api (:5081), Catalog.Api (:5082), & React (:5173)
# ==============================================================================

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  NetStarterPack Microservices (.NET 10 + Compact Onion + YARP) " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$root = $PSScriptRoot
$frontendDir = Join-Path $root "frontend"

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "[1/2] Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
    Push-Location $frontendDir
    npm install
    Pop-Location
}

Write-Host "[2/2] Starting Gateway.Api Orchestrator on http://localhost:5080 ..." -ForegroundColor Green
Write-Host "      (Otomatis menyalakan Identity.Api :5081, Catalog.Api :5082, dan React :5173)" -ForegroundColor Gray
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; dotnet run --project src/ApiGateway/Gateway.Api"

Write-Host ""
Write-Host "YARP API Gateway   : http://localhost:5080" -ForegroundColor Cyan
Write-Host "Unified Swagger UI : http://localhost:5080/swagger" -ForegroundColor Cyan
Write-Host "Unified Scalar UI  : http://localhost:5080/scalar/v1" -ForegroundColor Cyan
Write-Host "Identity Service   : http://localhost:5081/swagger" -ForegroundColor Cyan
Write-Host "Catalog Service    : http://localhost:5082/swagger" -ForegroundColor Cyan
Write-Host "Frontend React App : http://localhost:5173" -ForegroundColor Cyan
