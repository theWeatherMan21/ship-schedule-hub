# -*- coding: utf-8 -*-
# PROBE 05 - engine chain on Windows inside the user's interactive session.
# Covers: window enumeration (must stay 0 new windows), engine run with the App's
# spawn env (TEMP -> engine\.tmp), tracking CLI, update mirror reachability.
$ErrorActionPreference = 'Continue'
$dir = 'C:\Users\Administrator\ssh_review'
$log = Join-Path $dir 'probe05.txt'
function W($s) { [string]$s | Out-File -FilePath $log -Append -Encoding UTF8 }
"=== PROBE05 $(Get-Date -Format 's') ===" | Out-File $log -Encoding UTF8
W ("user=" + $env:USERNAME + " interactive=" + [Environment]::UserInteractive)
W ("isAdmin(elevated)=" + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

Add-Type -TypeDefinition @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class WinEnum {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  public static List<string> List() {
    var res = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      var t = new StringBuilder(512); GetWindowText(h, t, 512);
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      RECT r; GetWindowRect(h, out r);
      long ex = (long)GetWindowLongPtr(h, -20);
      res.Add(h.ToInt64() + "|" + pid + "|" + (IsWindowVisible(h) ? 1 : 0) + "|" + ex.ToString("X") + "|" + c.ToString() + "|" + r.L + "," + r.T + "," + r.R + "," + r.B + "|" + t.ToString());
      return true;
    }, IntPtr.Zero);
    return res;
  }
}
'@

function Snap($label) {
  $all = [WinEnum]::List()
  $vis = @($all | Where-Object { ($_ -split '\|')[2] -eq '1' })
  W "--- $label : total=$($all.Count) visible=$($vis.Count)"
  foreach ($v in $vis) { $f = $v -split '\|'; W ("    hwnd=" + $f[0] + " pid=" + $f[1] + " ex=0x" + $f[3] + " class=" + $f[4] + " rect=" + $f[5] + " title=" + $f[6]) }
  return ,$vis
}

$baseline = Snap 'baseline windows (before any probe action)'
$baseCount = $baseline.Count

# ---------- 1. install dir writability / engine .tmp (what Rust create_dir_all targets) ----------
$tmpDir = 'C:\Program Files\ShipScheduleHub\engine\.tmp'
W ""
W "--- .tmp dir the Rust spawn sets TEMP/TMP/TMPDIR to ---"
W ("  exists=" + (Test-Path $tmpDir))
try { New-Item -ItemType Directory -Force -Path $tmpDir -ErrorAction Stop | Out-Null; W ("  create: OK -> exists=" + (Test-Path $tmpDir)) } catch { W ("  create FAILED: " + ($_.Exception.Message -replace '\s+',' ')) }
try { $f = Join-Path $tmpDir ('w-' + [guid]::NewGuid().ToString('N').Substring(0,6) + '.txt'); Set-Content -Path $f -Value 'x' -ErrorAction Stop; W "  write probe: OK"; Remove-Item $f -Force } catch { W ("  write probe FAILED: " + ($_.Exception.Message -replace '\s+',' ')) }
try { $f2 = 'C:\Program Files\ShipScheduleHub\.ssh-write-probe'; Set-Content -Path $f2 -Value 'x' -ErrorAction Stop; W "  exeDir write probe: OK"; Remove-Item $f2 -Force } catch { W ("  exeDir write probe FAILED: " + ($_.Exception.Message -replace '\s+',' ')) }

# ---------- 2. engine run replicating the App's spawn env ----------
$node = 'C:\Program Files\ShipScheduleHub\engine\node-bin\node.exe'
$engine = 'C:\Program Files\ShipScheduleHub\engine\query.mjs'
$engDir = 'C:\Program Files\ShipScheduleHub\engine'
$isoProfile = Join-Path $dir 'profile05'
$outFile = Join-Path $dir 'engine-out.ndjson'
$errFile = Join-Path $dir 'engine-err.txt'
Remove-Item $outFile, $errFile -Force -ErrorAction SilentlyContinue

W ""
W "--- engine run (isolated profile, App-like TEMP) ---"
$env:TMPDIR = $tmpDir; $env:TMP = $tmpDir; $env:TEMP = $tmpDir
$env:SSH_PROFILE_DIR = $isoProfile
$env:SSH_DATA_DIR = (Join-Path $dir 'data05')
$env:TMPDIR = $env:TMPDIR   # keep
$argList = @($engine, '--origin', 'Shanghai', '--destination', 'Rotterdam', '--carriers', 'one,yangming,msc,evergreen', '--batch', '4', '--no-cache')
W ("  cmd: node " + ($argList -join ' '))
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath $node -ArgumentList $argList -WorkingDirectory $engDir -RedirectStandardOutput $outFile -RedirectStandardError $errFile -PassThru -WindowStyle Hidden
$seenChrome = @()
$maxVis = $baseCount
while (-not $p.HasExited -and $sw.Elapsed.TotalSeconds -lt 300) {
  Start-Sleep -Seconds 2
  $v = @([WinEnum]::List() | Where-Object { ($_ -split '\|')[2] -eq '1' })
  if ($v.Count -gt $maxVis) { $maxVis = $v.Count }
  foreach ($x in $v) { $f = $x -split '\|'; if ($f[4] -match 'Chrome_WidgetWin|MozillaWindowClass') { if ($seenChrome -notcontains $x) { $seenChrome += $x } } }
}
$p.WaitForExit(15000) | Out-Null
$sw.Stop()
W ("  exit=" + $p.ExitCode + " duration=" + [math]::Round($sw.Elapsed.TotalSeconds,1) + "s maxVisibleWindowsDuringRun=" + $maxVis)
W ("  browser windows seen during run: " + $seenChrome.Count)
foreach ($c in $seenChrome) { W ("    " + $c) }
W "  --- stderr (first 25 lines) ---"
if (Test-Path $errFile) { Get-Content $errFile -TotalCount 25 -ErrorAction SilentlyContinue | ForEach-Object { W ("    | " + $_) } }
W "  --- carrier events ---"
if (Test-Path $outFile) {
  foreach ($line in @(Get-Content $outFile -ErrorAction SilentlyContinue)) {
    if (-not ([string]$line).TrimStart().StartsWith('{')) { continue }
    $j = $null
    try { $j = $line | ConvertFrom-Json } catch { continue }
    $t = [string]$j.type
    $rows = 0
    if ($j.schedules) { $rows = @($j.schedules).Count }
    $m = [string]$j.msg
    if ($m.Length -gt 130) { $m = $m.Substring(0, 130) }
    if ($t -eq 'carrier-status') { W ("    [" + $j.carrier + "] status=" + $j.status + " level=" + $j.level + " http=" + $j.httpStatus + " ms=" + $j.ms + " rows=" + $rows + " msg=" + $m) }
    elseif ($t -eq 'summary') { W ("    SUMMARY total=" + $j.total + " prefilled=" + $j.prefilled + " failed=" + $j.failed + " opened=" + $j.opened) }
    elseif ($t -eq 'engine-started') { W ("    engine-started windowMode=" + $j.windowMode + " carriers=" + ($j.carriers -join ',')) }
    elseif ($t -eq 'engine-error') { W ("    ENGINE-ERROR " + $j.msg) }
  }
}
$env:SSH_PROFILE_DIR = $null; $env:SSH_DATA_DIR = $null
Remove-Item Env:\SSH_PROFILE_DIR -ErrorAction SilentlyContinue
Remove-Item Env:\SSH_DATA_DIR -ErrorAction SilentlyContinue
$env:TMPDIR = "$env:LOCALAPPDATA\Temp"; $env:TMP = "$env:LOCALAPPDATA\Temp"; $env:TEMP = "$env:LOCALAPPDATA\Temp"

# ---------- 3. tracking CLI ----------
W ""
W "--- tracking cli.mjs --number 276759780 (Maersk) ---"
$trOut = Join-Path $dir 'track-out.ndjson'; $trErr = Join-Path $dir 'track-err.txt'
Remove-Item $trOut, $trErr -Force -ErrorAction SilentlyContinue
$env:SSH_PROFILE_DIR = $isoProfile
$sw2 = [System.Diagnostics.Stopwatch]::StartNew()
$p2 = Start-Process -FilePath $node -ArgumentList @((Join-Path $engDir 'tracking\cli.mjs'), '--number', '276759780') -WorkingDirectory $engDir -RedirectStandardOutput $trOut -RedirectStandardError $trErr -PassThru -WindowStyle Hidden
$maxVis2 = $baseCount
while (-not $p2.HasExited -and $sw2.Elapsed.TotalSeconds -lt 180) { Start-Sleep -Seconds 2; $v2 = @([WinEnum]::List() | Where-Object { ($_ -split '\|')[2] -eq '1' }); if ($v2.Count -gt $maxVis2) { $maxVis2 = $v2.Count } }
$p2.WaitForExit(15000) | Out-Null; $sw2.Stop()
W ("  exit=" + $p2.ExitCode + " duration=" + [math]::Round($sw2.Elapsed.TotalSeconds,1) + "s maxVisibleWindows=" + $maxVis2)
if (Test-Path $trOut) { Get-Content $trOut -TotalCount 12 -ErrorAction SilentlyContinue | ForEach-Object { W ("    | " + $_.Substring(0, [Math]::Min(240, $_.Length))) } }
if (Test-Path $trErr) { Get-Content $trErr -TotalCount 8 -ErrorAction SilentlyContinue | ForEach-Object { W ("    ERR| " + $_) } }
Remove-Item Env:\SSH_PROFILE_DIR -ErrorAction SilentlyContinue

# ---------- 4. update mirrors from this machine ----------
W ""
W "--- update endpoints (Range 0-1023) ---"
$curl = "$env:SystemRoot\System32\curl.exe"
$base = 'https://github.com/theWeatherMan21/ship-schedule-hub/releases/download/v1.5.1/ShipScheduleHub_1.5.1_x64-setup.exe'
$urls = @(
  @{ n = 'latest-ghfast'; u = 'https://ghfast.top/https://github.com/theWeatherMan21/ship-schedule-hub/releases/latest/download/latest-ghfast.json' },
  @{ n = 'latest-ghproxy'; u = 'https://ghproxy.net/https://github.com/theWeatherMan21/ship-schedule-hub/releases/latest/download/latest-ghproxy.json' },
  @{ n = 'latest-github'; u = 'https://github.com/theWeatherMan21/ship-schedule-hub/releases/latest/download/latest.json' },
  @{ n = 'exe-ghfast'; u = ('https://ghfast.top/' + $base) },
  @{ n = 'exe-ghproxy'; u = ('https://ghproxy.net/' + $base) },
  @{ n = 'exe-github'; u = $base }
)
foreach ($x in $urls) {
  $code = 'ERR'
  try { $code = & $curl -sS -o NUL -w "%{http_code} %{time_total}s %{size_download}B" -r 0-1023 --max-time 30 $x.u 2>&1 } catch { $code = 'ERR ' + $_.Exception.Message }
  W ("  " + $x.n.PadRight(16) + " " + $code)
}
W ""
W "--- api.github.com rate limit from this machine ---"
try { $rl = & $curl -sS --max-time 20 'https://api.github.com/rate_limit' 2>&1; W ("  " + ($rl -replace '\s+', ' ').Substring(0, [Math]::Min(300, ($rl -replace '\s+',' ').Length))) } catch { W "  rate_limit query failed" }

# ---------- 5. cleanup + final snap ----------
W ""
W "--- leftover chrome with our profile ---"
$left = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*profile05*' -or $_.CommandLine -like '*ShipScheduleHub*' })
W ("  count=" + $left.Count)
foreach ($l in $left) { W ("    pid=" + $l.ProcessId + " " + ($l.CommandLine -replace '\s+',' ').Substring(0,[Math]::Min(140,($l.CommandLine -replace '\s+',' ').Length))) ; Stop-Process -Id $l.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 2
Snap 'final windows (after cleanup)'
$psWin = @(Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle })
W ("SELF-PROOF: powershell processes with a visible window title = " + $psWin.Count)
W "=== PROBE05 DONE ==="
Write-Output ('PROBE05 DONE exit_engine=' + $p.ExitCode + ' exit_track=' + $p2.ExitCode)
