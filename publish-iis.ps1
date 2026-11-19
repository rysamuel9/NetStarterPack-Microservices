# ==============================================================================
# NetStarterPack Microservices — Selective & Full IIS Publisher (publish-iis.ps1)
# Contoh pemakaian:
#   1. Publish Semua (First-Time Deploy):  .\publish-iis.ps1 -Target All
#   2. Publish Order.Api saja:             .\publish-iis.ps1 -Target Order
#   3. Publish Catalog.Api saja:           .\publish-iis.ps1 -Target Catalog
#   4. Publish Identity.Api saja:          .\publish-iis.ps1 -Target Identity
#   5. Publish Workflow.Api saja:          .\publish-iis.ps1 -Target Workflow
#   6. Publish Gateway.Api saja:           .\publish-iis.ps1 -Target Gateway
#   7. Publish Frontend React saja:        .\publish-iis.ps1 -Target Frontend
# ==============================================================================
param(
    [ValidateSet("All", "Gateway", "Identity", "Catalog", "Order", "Workflow", "Frontend")]
    [string]$Target = "All",
    [string]$OutputRoot = "$PSScriptRoot\publish-iis"
)

$ErrorActionPreference = "Stop"
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  NetStarterPack Microservices — IIS Release Publisher          " -ForegroundColor Cyan
Write-Host "  Target: $Target  |  Output: $OutputRoot" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

function Publish-DotnetService($Name, $ProjectPath, $FolderName) {
    $dest = Join-Path $OutputRoot $FolderName
    Write-Host "`n[PUBLISH] Compiling $Name -> $dest ..." -ForegroundColor Yellow
    dotnet publish "$PSScriptRoot\$ProjectPath" -c Release -o $dest /p:UseAppHost=false
    Write-Host "[OK] $Name berhasil di-publish ke $dest" -ForegroundColor Green
}

function Publish-FrontendSpa() {
    $dest = Join-Path $OutputRoot "frontend-web"
    $feDir = Join-Path $PSScriptRoot "frontend"
    Write-Host "`n[PUBLISH] Building React 19 Frontend SPA -> $dest ..." -ForegroundColor Yellow
    Push-Location $feDir
    npm run build
    Pop-Location

    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item -Path "$feDir\dist\*" -Destination $dest -Recurse -Force

    # Buat web.config otomatis untuk IIS URL Rewrite (agar refresh halaman React Router tidak 404)
    $webConfigLines = @(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<configuration>',
        '  <system.webServer>',
        '    <rewrite>',
        '      <rules>',
        '        <rule name="ReactRouterRoutes" stopProcessing="true">',
        '          <match url=".*" />',
        '          <conditions logicalGrouping="MatchAll">',
        '            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />',
        '            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />',
        '            <add input="{REQUEST_URI}" pattern="^/(api)" negate="true" />',
        '          </conditions>',
        '          <action type="Rewrite" url="/index.html" />',
        '        </rule>',
        '      </rules>',
        '    </rewrite>',
        '  </system.webServer>',
        '</configuration>'
    )
    Set-Content -Path (Join-Path $dest "web.config") -Value ($webConfigLines -join "`r`n") -Encoding UTF8
    Write-Host "[OK] Frontend React + IIS web.config berhasil di-publish ke $dest" -ForegroundColor Green
}

if ($Target -eq "All" -or $Target -eq "Gateway") {
    Publish-DotnetService "Gateway.Api (:5080)" "src\ApiGateway\Gateway.Api\Gateway.Api.csproj" "gateway-api"
}
if ($Target -eq "All" -or $Target -eq "Identity") {
    Publish-DotnetService "Identity.Api (:5081)" "src\Services\Identity\Identity.Api\Identity.Api.csproj" "identity-api"
}
if ($Target -eq "All" -or $Target -eq "Catalog") {
    Publish-DotnetService "Catalog.Api (:5082)" "src\Services\Catalog\Catalog.Api\Catalog.Api.csproj" "catalog-api"
}
if ($Target -eq "All" -or $Target -eq "Order") {
    Publish-DotnetService "Order.Api (:5083)" "src\Services\Order\Order.Api\Order.Api.csproj" "order-api"
}
if ($Target -eq "All" -or $Target -eq "Workflow") {
    Publish-DotnetService "Workflow.Api (:5084)" "src\Services\Workflow\Workflow.Api\Workflow.Api.csproj" "workflow-api"
}
if ($Target -eq "All" -or $Target -eq "Frontend") {
    Publish-FrontendSpa
}

Write-Host "`n================================================================" -ForegroundColor Cyan
Write-Host "  Selesai! File siap di-copy ke C:\inetpub\ di Server IIS.      " -ForegroundColor Green
Write-Host "  Lihat panduan lengkap di docs/IIS_DEPLOYMENT_GUIDE.md         " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
