$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $workspace "monitor.pid"

if (!(Test-Path $pidFile)) {
  Write-Host "monitor.pid not found."
  exit 0
}

$monitorPid = [int](Get-Content $pidFile)
$process = Get-Process -Id $monitorPid -ErrorAction SilentlyContinue

if ($process) {
  Stop-Process -Id $monitorPid
  Write-Host "Monitor stopped. PID: $monitorPid"
} else {
  Write-Host "Monitor process is not running. PID: $monitorPid"
}

Remove-Item $pidFile -ErrorAction SilentlyContinue
