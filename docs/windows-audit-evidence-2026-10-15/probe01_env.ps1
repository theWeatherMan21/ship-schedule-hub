# -*- coding: utf-8 -*-
"""Probe 01 - environment recon on the Windows peer (SSH session 0, no GUI)."""
$ErrorActionPreference = 'Continue'
$out = @()
function W($s) { $script:out += $s }

W "=== PROBE 01 ENV RECON ==="
W ("time=" + (Get-Date).ToString('s'))
W ("host=" + $env:COMPUTERNAME + " user=" + $env:USERNAME)
W ("isAdmin=" + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

$os = Get-CimInstance Win32_OperatingSystem
W ("os=" + $os.Caption + " | version=" + $os.Version + " | build=" + $os.BuildNumber + " | arch=" + $os.OSArchitecture)
W ("lastBoot=" + $os.LastBootUpTime)
W ("interactiveSession=" + [Environment]::UserInteractive)

W ""
W "--- SYSTEM32 PRESENT ---"
$sys32 = "$env:SystemRoot\System32"
foreach ($n in @('cmd.exe','where.exe','taskkill.exe','net.exe','reg.exe','powershell.exe')) {
  $p = Join-Path $sys32 $n
  W ("$p exists=" + (Test-Path $p))
}
W ("PATH=" + $env:PATH)
W ("TEMP=" + $env:TEMP + " TMP=" + $env:TMP + " TMPDIR=" + $env:TMPDIR)
W ("NODE_PATH=" + $env:NODE_PATH + " | NODE_OPTIONS=" + $env:NODE_OPTIONS + " | PLAYWRIGHT_BROWSERS_PATH=" + $env:PLAYWRIGHT_BROWSERS_PATH)
W ("HTTP_PROXY=" + $env:HTTP_PROXY + " HTTPS_PROXY=" + $env:HTTPS_PROXY + " NO_PROXY=" + $env:NO_PROXY)
W ("LOCALAPPDATA=" + $env:LOCALAPPDATA)
W ("APPDATA=" + $env:APPDATA)
W ("ProgramFiles=" + $env:ProgramFiles + " | ProgramFiles(x86)=" + ${env:ProgramFiles(x86)})

W ""
W "--- WEBVIEW2 ---"
$wvCandidates = @(
  @{h='HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'; n='HKLM-WOW-x64-client'},
  @{h='HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'; n='HKLM-client'},
  @{h='HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'; n='HKCU-client'}
)
foreach ($c in $wvCandidates) {
  try { $v = (Get-ItemProperty -Path $c.h -ErrorAction Stop).pv; W ("WebView2[" + $c.n + "]=" + $v) } catch { W ("WebView2[" + $c.n + "]=<absent>") }
}
$wvDirs = @("${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application", "$env:ProgramFiles\Microsoft\EdgeWebView\Application")
foreach ($d in $wvDirs) { if (Test-Path $d) { W ("WebView2 dir " + $d + " -> " + ((Get-ChildItem $d -Directory | Select-Object -ExpandProperty Name) -join ',')) } else { W ("WebView2 dir " + $d + " -> absent") } }

W ""
W "--- BROWSERS ---"
$bpaths = @(
  @{n='Chrome-PF'; p="${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"},
  @{n='Chrome-PFx86'; p="${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"},
  @{n='Chrome-LocalAppData'; p="$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"},
  @{n='Edge-PFx86'; p="${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"},
  @{n='Edge-PF'; p="${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"}
)
foreach ($b in $bpaths) {
  if (Test-Path $b.p) {
    $ver = (Get-Item $b.p).VersionInfo.ProductVersion
    W ("browser[" + $b.n + "]=" + $b.p + " version=" + $ver)
  } else { W ("browser[" + $b.n + "]=absent") }
}
try { $w = & "$env:SystemRoot\System32\where.exe" node 2>$null; W ("where node -> " + ($w -join ';')) } catch { W "where node -> (failed)" }
$nodeCands = @("$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe", "$env:APPDATA\nvm\node.exe", "$env:USERPROFILE\scoop\apps\nodejs\current\node.exe")
foreach ($p in $nodeCands) { if (Test-Path $p) { W ("node[" + $p + "] version=" + (& $p --version)) } }

W ""
W "--- SHIPSCHEDULEHUB INSTALLATIONS ---"
$roots = @("$env:ProgramFiles", "${env:ProgramFiles(x86)}", "$env:LOCALAPPDATA\Programs", "$env:LOCALAPPDATA", "$env:APPDATA", "D:\", "C:\", "$env:ProgramData")
foreach ($r in $roots) {
  if (Test-Path $r) {
    try {
      $hits = Get-ChildItem -Path $r -Filter '*hip*chedule*' -ErrorAction SilentlyContinue -Depth 1
      foreach ($h in $hits) { W ("install-candidate: " + $h.FullName) }
    } catch {}
  }
}
$unins = @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')
foreach ($k in $unins) {
  try {
    Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'hip|Schedule' } | ForEach-Object {
      W ("uninstall-entry: name=" + $_.DisplayName + " ver=" + $_.DisplayVersion + " loc=" + $_.InstallLocation + " unins=" + $_.UninstallString)
    }
  } catch {}
}

W ""
W "--- APP DATA DIRS ---"
$adirs = @("$env:LOCALAPPDATA\com.shipschedulehub.app", "$env:LOCALAPPDATA\ShipScheduleHub", "$env:APPDATA\com.shipschedulehub.app", "$env:APPDATA\ShipScheduleHub", "$env:LOCALAPPDATA\com.shipschedule.desktop")
foreach ($d in $adirs) { if (Test-Path $d) { W ("appdata-dir EXISTS: " + $d); W ("  children: " + ((Get-ChildItem $d -Force | Select-Object -First 20 -ExpandProperty Name) -join ', ')) } else { W ("appdata-dir absent: " + $d) } }

W ""
W "--- RUNNING PROCESSES OF INTEREST ---"
try {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'shipschedule|node|chrome|msedge' } |
    Select-Object -First 40 |
    ForEach-Object { W ("proc: pid=" + $_.ProcessId + " name=" + $_.Name + " cmd=" + $_.CommandLine) }
} catch { W "proc enum failed" }

W ""
W "--- DISK ---"
Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { W ("disk " + $_.DeviceID + " freeGB=" + [math]::Round($_.FreeSpace/1GB,1) + " totalGB=" + [math]::Round($_.Size/1GB,1)) }

W ""
W "--- TAILSCALE / SSH ---"
try { W ("tailscale: " + (& "$env:ProgramFiles\Tailscale\tailscale.exe" status 2>&1 | Out-String)) } catch { W "tailscale query failed" }

W ""
W "--- LOGGED ON SESSIONS ---"
try { (query user 2>&1 | Out-String).Split("`n") | ForEach-Object { if ($_.Trim()) { W ("queryuser: " + $_.Trim()) } } } catch { W "query user failed" }

$out | Out-File -FilePath 'C:\Users\Administrator\ssh_review\probe01.txt' -Encoding UTF8
Write-Output "PROBE01 DONE lines=$($out.Count)"
