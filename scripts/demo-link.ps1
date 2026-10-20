# UZ-Carbon MRV — namoyish havolasi.
# Serverni shu kompyuterda ishga tushiradi va unga global (internetdan ochiladigan) havola beradi.
#
# Ishga tushirish (PowerShell, loyiha papkasida):
#   powershell -ExecutionPolicy Bypass -File scripts\demo-link.ps1
#
# Havola ushbu oyna ochiq turgancha ishlaydi. To'xtatish: Ctrl+C yoki oynani yopish.
# Hech narsa o'rnatish shart emas: Windows tarkibidagi ssh ishlatiladi.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Test-Port($port) {
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect("127.0.0.1", $port); $c.Close(); return $true } catch { return $false }
}

Write-Host ""
Write-Host "UZ-Carbon MRV — namoyish havolasi" -ForegroundColor Cyan
Write-Host ("-" * 58)

# 1. Server
$started = $null
if (Test-Port 3000) {
  Write-Host "Server allaqachon ishlayapti (port 3000)." -ForegroundColor DarkGray
} else {
  if (-not (Test-Path "data\uzcarbon.db")) {
    Write-Host "Ma'lumotlar bazasi yo'q. Demo ma'lumotlar yaratilmoqda..." -ForegroundColor Yellow
    & node scripts\seed-demo.js --force | Out-Null
  }
  Write-Host "Server ishga tushirilmoqda..." -NoNewline
  $out = Join-Path $env:TEMP "uzcarbon-server.log"
  $started = Start-Process -FilePath node -ArgumentList "server.js" -WorkingDirectory $root `
    -RedirectStandardOutput $out -RedirectStandardError (Join-Path $env:TEMP "uzcarbon-server.err.log") `
    -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 400; if (Test-Port 3000) { break } }
  if (-not (Test-Port 3000)) { Write-Host " xato." -ForegroundColor Red; Get-Content $out -Tail 10; exit 1 }
  Write-Host " tayyor." -ForegroundColor Green
}

# 2. Global havola.
# Avval localhost.run (22-port), ishlamasa Pinggy (443-port — ko'pchilik korporativ tarmoqlarda ochiq).
$log = Join-Path $env:TEMP "uzcarbon-tunnel.log"
$errLog = Join-Path $env:TEMP "uzcarbon-tunnel.err.log"
$providers = @(
  @{ name = "localhost.run"; args = @("-o","StrictHostKeyChecking=accept-new","-o","ConnectTimeout=15","-o","ServerAliveInterval=30","-o","ExitOnForwardFailure=yes","-R","80:localhost:3000","nokey@localhost.run"); re = "(https://[a-z0-9\-]+\.lhr\.life)"; note = "" },
  @{ name = "pinggy.io";     args = @("-p","443","-o","StrictHostKeyChecking=accept-new","-o","ConnectTimeout=15","-o","ServerAliveInterval=30","-R","0:localhost:3000","a.pinggy.io"); re = "(https://[a-z0-9\-]+\.free\.pinggy\.net)"; note = "Birinchi kirishda Pinggy ogohlantirish sahifasi chiqadi — `"Enter site`" ni bosing. Bepul tunnel 60 daqiqada tugaydi." }
)
$url = $null; $ssh = $null; $note = ""
foreach ($pr in $providers) {
  Write-Host ("Global havola ochilmoqda ({0})..." -f $pr.name) -NoNewline
  Remove-Item $log, $errLog -ErrorAction SilentlyContinue
  $ssh = Start-Process -FilePath ssh -ArgumentList $pr.args -RedirectStandardOutput $log -RedirectStandardError $errLog -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if ($ssh.HasExited) { break }
    $txt = Get-Content $log -Raw -ErrorAction SilentlyContinue
    if ($txt -and $txt -match $pr.re) { $url = $Matches[1]; $note = $pr.note; break }
  }
  if ($url) { break }
  Write-Host " ishlamadi." -ForegroundColor DarkYellow
  if ($ssh -and -not $ssh.HasExited) { Stop-Process -Id $ssh.Id -Force -ErrorAction SilentlyContinue }
}
if (-not $url) {
  Write-Host " xato." -ForegroundColor Red
  Write-Host "Tunnel ochilmadi. Internet ulanishini tekshiring va qayta urinib ko'ring."
  Get-Content (Join-Path $env:TEMP "uzcarbon-tunnel.err.log") -Tail 6 -ErrorAction SilentlyContinue
  if ($started) { Stop-Process -Id $started.Id -Force -ErrorAction SilentlyContinue }
  exit 1
}
Write-Host " tayyor." -ForegroundColor Green

Write-Host ""
Write-Host "  HAVOLA (boshqa odamga shuni yuboring):" -ForegroundColor Cyan
Write-Host "  $url" -ForegroundColor White
Write-Host ""
if ($note) { Write-Host "  $note" -ForegroundColor Yellow; Write-Host "" }
Write-Host "  Demo loginlar, parol: Demo2026parol" -ForegroundColor DarkGray
Write-Host "    sement      eksportyor (korxona ko'rinishi)" -ForegroundColor DarkGray
Write-Host "    tahlilchi   davlat organi paneli" -ForegroundColor DarkGray
Write-Host "    importyor   Yevropa Ittifoqi importyori" -ForegroundColor DarkGray
Write-Host "    verifikator verifikator (birinchi kirishda 2FA sozlanadi)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Havola shu oyna ochiq turgancha ishlaydi. To'xtatish: Ctrl+C." -ForegroundColor DarkGray
Write-Host ("-" * 58)

try {
  while (-not $ssh.HasExited) { Start-Sleep -Seconds 2 }
  Write-Host "Tunnel uzildi. Skriptni qayta ishga tushiring (havola o'zgaradi)." -ForegroundColor Yellow
} finally {
  if (-not $ssh.HasExited) { Stop-Process -Id $ssh.Id -Force -ErrorAction SilentlyContinue }
  if ($started -and -not $started.HasExited) { Stop-Process -Id $started.Id -Force -ErrorAction SilentlyContinue }
  Write-Host "To'xtatildi."
}
