$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$user = Read-Host "Naver SMTP email, e.g. kst104@naver.com"
$securePass = Read-Host "Naver SMTP password or app password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)

try {
  $env:NAVER_SMTP_USER = $user
  $env:NAVER_SMTP_PASS = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  $env:MONITOR_EMAIL_TO = "promokorea@gmail.com"

  $stdout = Join-Path $workspace "monitor.out.log"
  $stderr = Join-Path $workspace "monitor.err.log"
  $process = Start-Process node.exe `
    -ArgumentList @("monitor.js") `
    -WorkingDirectory $workspace `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

  $process.Id | Set-Content -Encoding ASCII (Join-Path $workspace "monitor.pid")
  Write-Host "Monitor started. PID: $($process.Id)"
  Write-Host "Logs: $stdout / $stderr"
} finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}
