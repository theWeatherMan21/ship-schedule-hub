param([Parameter(Mandatory=$true)][string]$Name, [Parameter(Mandatory=$true)][string]$Script)
$ErrorActionPreference = 'Stop'
$exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$act = New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ' + $Script)
$pr = New-ScheduledTaskPrincipal -UserId ($env:COMPUTERNAME + '\administrator') -LogonType Interactive -RunLevel Limited
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $Name -Action $act -Principal $pr -Settings $set -Force | Out-Null
Start-ScheduledTask -TaskName $Name
Write-Output ('STARTED ' + $Name + ' -> ' + $Script)
