# ==============================================================================
# NetStarterPack Mobile — One-Click Development Launcher
# Menjalankan Gateway.Api (LAN :5080) + Expo Go Dev Server (QR Code)
# Pemakaian (WAJIB jalankan di Terminal interaktif PowerShell / double-click run-mobile.bat):
#   .\start-mobile-dev.ps1              -> Mode Wi-Fi LAN (paling cepat)
#   .\start-mobile-dev.ps1 -Tunnel      -> Mode Tunnel (jika Wi-Fi blokir antar-device)
#   .\start-mobile-dev.ps1 -SkipBackend -> Jika Gateway.Api sudah jalan
# ==============================================================================

param(
    [switch]$Tunnel,
    [switch]$SkipBackend,
    [switch]$ClearCache
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  NetStarterPack Mobile (Expo Go + Gateway.Api LAN :5080)       " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$root = $PSScriptRoot
$mobileDir = Join-Path $root "mobile"

# 1. Deteksi otomatis IPv4 LAN aktif (anti salah pilih adapter WSL/Hyper-V/Docker)
function Get-LocalLanIp {
    # Cara 1 (Paling akurat): tanya routing table OS lewat UDP socket (tidak mengirim paket ke internet)
    try {
        $socket = New-Object System.Net.Sockets.Socket(
            [System.Net.Sockets.AddressFamily]::InterNetwork,
            [System.Net.Sockets.SocketType]::Dgram,
            [System.Net.Sockets.ProtocolType]::Udp
        )
        $socket.Connect("8.8.8.8", 65530)
        $localIp = ([System.Net.IPEndPoint]$socket.LocalEndPoint).Address.IPAddressToString
        $socket.Close()
        if ($localIp -and $localIp -ne "127.0.0.1" -and $localIp -notlike "169.254.*") {
            return $localIp
        }
    } catch {
        # Lanjut ke fallback offline
    }

    # Cara 2 (Fallback jika offline total): baca NetworkInterface aktif milik Windows
    try {
        $nics = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
            Where-Object {
                $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up -and
                $_.NetworkInterfaceType -ne [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback -and
                $_.Name -notmatch "vEthernet|WSL|Hyper-V|VirtualBox|VMware|Tailscale|ZeroTier" -and
                $_.Description -notmatch "Virtual|Hyper-V|Loopback"
            }

        foreach ($nic in $nics) {
            $ipv4 = $nic.GetIPProperties().UnicastAddresses |
                Where-Object {
                    $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                    $_.Address.IPAddressToString -notlike "169.254.*"
                } |
                Select-Object -First 1

            if ($ipv4) {
                return $ipv4.Address.IPAddressToString
            }
        }
    } catch {}

    return "localhost"
}

$lanIp = Get-LocalLanIp
$gatewayLanUrl = "http://${lanIp}:5080"
$expoUrl = "exp://${lanIp}:8081"

# 2. Tulis otomatis ke mobile/.env (gitignored) supaya aplikasi HP langsung mengarah ke IP LAN PC
$envPath = Join-Path $mobileDir ".env"
Set-Content -Path $envPath -Value "EXPO_PUBLIC_API_URL=$gatewayLanUrl" -Encoding UTF8

# Paksa Metro/Expo menggunakan IP Wi-Fi/LAN asli (mencegah Expo memilih IP virtual WSL/Docker)
if ($lanIp -ne "localhost") {
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $lanIp
}

Write-Host ""
Write-Host "IP LAN PC terdeteksi : $lanIp" -ForegroundColor Green
Write-Host "API Gateway URL      : $gatewayLanUrl (diset otomatis ke mobile/.env)" -ForegroundColor Green
Write-Host "Expo Go Manual URL   : $expoUrl" -ForegroundColor Yellow
Write-Host ""

# 3. Pastikan node_modules di mobile/ terpasang
if (-not (Test-Path (Join-Path $mobileDir "node_modules"))) {
    Write-Host "[1/3] Installing mobile dependencies (npm install)..." -ForegroundColor Yellow
    Push-Location $mobileDir
    npm install
    Pop-Location
}

# 4. Cek apakah port 5080 sudah aktif; jika belum, jalankan Gateway.Api dengan profile LAN
function Test-PortOpen {
    param([int]$Port)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $wait = $async.AsyncWaitHandle.WaitOne(400, $false)
        if ($wait -and $client.Connected) {
            $client.EndConnect($async)
            $client.Close()
            return $true
        }
        $client.Close()
    } catch {}
    return $false
}

if (-not $SkipBackend) {
    if (Test-PortOpen -Port 5080) {
        Write-Host "[2/3] Port 5080 sudah aktif (Gateway.Api sudah berjalan)." -ForegroundColor Yellow
        Write-Host "      Pastikan Gateway.Api berjalan di 0.0.0.0:5080 agar bisa diakses dari HP." -ForegroundColor Gray
    } else {
        Write-Host "[2/3] Menyalakan Gateway.Api mode LAN (http://0.0.0.0:5080) di jendela baru..." -ForegroundColor Green
        Write-Host "      (Jika muncul popup Windows Firewall, klik Allow / Izinkan)" -ForegroundColor Gray
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; dotnet run --project src/ApiGateway/Gateway.Api --launch-profile 'Start All Microservices + Mobile LAN Access (:5080)' -- --urls http://0.0.0.0:5080"
    }
}

# 5. Jalankan Expo Go Dev Server (QR Code muncul otomatis di Terminal interaktif)
Write-Host ""
if ($Tunnel) {
    Write-Host "[3/3] Menyalakan Expo Dev Server (Mode Tunnel)..." -ForegroundColor Cyan
} else {
    Write-Host "[3/3] Menyalakan Expo Dev Server (Mode Wi-Fi LAN: $expoUrl)..." -ForegroundColor Cyan
}
Write-Host "      Scan QR Code di bawah pakai Expo Go, atau ketik manual URL: $expoUrl" -ForegroundColor Gray
Write-Host ""

Push-Location $mobileDir
try {
    $expoArgs = @("expo", "start")
    if ($Tunnel) {
        $expoArgs += "--tunnel"
    } else {
        $expoArgs += @("--host", "lan")
    }
    if ($ClearCache) {
        $expoArgs += "--clear"
    }
    npx @expoArgs
} finally {
    Pop-Location
}
