# PROBE 07 - Windows runtime battery: UA source, live browser carrier, TEMP edge case, tracking CLI.
$ErrorActionPreference = 'Continue'
$dir = 'C:\Users\Administrator\ssh_review'
$log = Join-Path $dir 'probe07.txt'
function W($s) { [string]$s | Out-File -FilePath $log -Append -Encoding UTF8 }
function Wf($s) { [string]$s | Out-File -FilePath $log -Append -Encoding UTF8 }
"=== PROBE07 $(Get-Date -Format 's') ===" | Out-File $log -Encoding UTF8

Add-Type -TypeDefinition @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class WinEnum7 {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  public static List<string> Visible() {
    var res = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      var t = new StringBuilder(512); GetWindowText(h, t, 512);
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      RECT r; GetWindowRect(h, out r);
      res.Add(h.ToInt64() + "|" + pid + "|" + c.ToString() + "|" + r.L + "," + r.T + "," + r.R + "," + r.B + "|" + t.ToString());
      return true;
    }, IntPtr.Zero);
    return res;
  }
}
'@

$engDir = 'C:\Program Files\ShipScheduleHub\engine'
$node = Join-Path $engDir 'node-bin\node.exe'
$projRoot = 'C:\Program Files\ShipScheduleHub'
$appTmp = Join-Path $projRoot 'engine\.tmp'
$nxTmp = Join-Path $dir 'nx-tmp-not-created'

$baseVisible = @([WinEnum7]::Visible())
W ("baseline visible windows=" + $baseVisible.Count)
W ("node exists=" + (Test-Path $node) + "  appTmp exists=" + (Test-Path $appTmp))
W ("nxTmp exists (should be False)=" + (Test-Path $nxTmp))

function ChromePids {
  $pids = @()
  foreach ($p in (Get-CimInstance Win32_Process -Filter 'Name = "chrome.exe"' -ErrorAction SilentlyContinue)) {
    if ($p.CommandLine -like '*ShipScheduleHub*') { $pids += $p.ProcessId }
  }
  return ,$pids
}
function ChromeVisibleWindows($pids) {
  $n = 0
  foreach ($v in @([WinEnum7]::Visible())) {
    $f = $v -split '\|'
    if ($pids -contains [int]$f[1]) { $n++ }
  }
  return $n
}
function RunNodeHelp([string]$argline, [string]$tag, [string]$tempDir, [string]$profile) {
  $out = Join-Path $dir ("$tag-out.ndjson")
  $err = Join-Path $dir ("$tag-err.txt")
  Remove-Item $out, $err -Force -ErrorAction SilentlyContinue
  $env:TMPDIR = $tempDir; $env:TMP = $tempDir; $env:TEMP = $tempDir
  if ($profile) { $env:SSH_PROFILE_DIR = $profile } else { Remove-Item Env:\SSH_PROFILE_DIR -ErrorAction SilentlyContinue }
  W ""
  W ("--- [$tag] node " + $argline)
  W ("    TEMP=" + $tempDir + " (exists=" + (Test-Path $tempDir) + ")  PROFILE=" + $profile)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process -FilePath $node -ArgumentList $argline -WorkingDirectory $engDir -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
  $maxVis = $baseVisible.Count; $chromeWin = 0
  while (-not $p.HasExited -and $sw.Elapsed.TotalSeconds -lt 270) {
    Start-Sleep -Seconds 3
    $v = @([WinEnum7]::Visible())
    if ($v.Count -gt $maxVis) { $maxVis = $v.Count }
    $cp = ChromePids
    if ($cp.Count -gt 0) { $cw = ChromeVisibleWindows $cp; if ($cw -gt $chromeWin) { $chromeWin = $cw } }
  }
  if (-not $p.HasExited) { W "    (timed out, killing)"; & "$env:SystemRoot\System32\taskkill.exe" /T /F /PID $p.Id | Out-Null }
  $p.WaitForExit(20000) | Out-Null
  $sw.Stop()
  W ("    exit=" + $p.ExitCode + " duration=" + [math]::Round($sw.Elapsed.TotalSeconds,1) + "s maxVisibleWindows=" + $maxVis + " chromeVisibleWindows=" + $chromeWin)
  $env:TMPDIR = $null; $env:TMP = $null; $env:TEMP = $null
  # summarize stdout events
  if (Test-Path $out) {
    foreach ($line in @(Get-Content $out -ErrorAction SilentlyContinue)) {
      if (-not ([string]$line).TrimStart().StartsWith('{')) { continue }
      $j = $null; try { $j = $line | ConvertFrom-Json } catch { continue }
      $rows = 0; if ($j.schedules) { $rows = @($j.schedules).Count }
      $m = [string]$j.msg; if ($m.Length -gt 150) { $m = $m.Substring(0,150) }
      W ("    EV " + $j.type + " " + $(if ($j.carrier) { "[" + $j.carrier + "] " } else { "" }) + $(if ($j.status) { "status=" + $j.status + " " } else { "" }) + $(if ($j.windowMode) { "windowMode=" + $j.windowMode + " " } else { "" }) + "rows=" + $rows + " " + $m)
    }
  }
  if (Test-Path $err) {
    $now = @(Get-Content $err -ErrorAction SilentlyContinue)
    W ("    stderr lines=" + $now.Count)
    $now | Select-Object -First 20 | ForEach-Object { W ("      | " + $_) }
  }
  return $p.ExitCode
}

# ---------- 1. UA source on Windows ----------
W ""
W "--- [UA] what UA does the engine actually use on this machine? ---"
$uaOut = Join-Path $dir 'ua-out.txt'; $uaErr = Join-Path $dir 'ua-err.txt'
$uaScript = "import('file:///" + ($engDir -replace '\\','/') + "/lib/ua.mjs').then(m => { console.log('UA=' + m.realChromeUA()); console.log('FALLBACK=' + m.UA_FALLBACK); })"
Start-Process -FilePath $node -ArgumentList @('-e', "`"$uaScript`"") -WorkingDirectory $engDir -RedirectStandardOutput $uaOut -RedirectStandardError $uaErr -Wait -WindowStyle Hidden
if (Test-Path $uaOut) { Get-Content $uaOut | ForEach-Object { W ("    " + $_) } }
if (Test-Path $uaErr) { Get-Content $uaErr | ForEach-Object { W ("    UA-stderr| " + $_) } }

# ---------- 2. live browser carrier (no cache), normal app TEMP ----------
$r2 = RunNodeHelp "query.mjs --origin Shanghai --destination Rotterdam --carriers msc --batch 1 --no-cache --window minimized" 'p7-msc' $appTmp (Join-Path $dir 'profile07a')

# ---------- 3. same carrier, TEMP points at a non-existent dir (non-elevated App simulation) ----------
$r3 = RunNodeHelp "query.mjs --origin Shanghai --destination Rotterdam --carriers msc --batch 1 --no-cache --window minimized" 'p7-msc-nx' $nxTmp (Join-Path $dir 'profile07b')

# ---------- 4. second browser carrier live ----------
$r4 = RunNodeHelp "query.mjs --origin Shanghai --destination Rotterdam --carriers yangming --batch 1 --no-cache --window minimized" 'p7-yangming' $appTmp (Join-Path $dir 'profile07c')

# ---------- 5. tracking CLI live ----------
$r5 = RunNodeHelp "tracking\cli.mjs --number 276759780 --carrier maersk" 'p7-track' $appTmp (Join-Path $dir 'profile07d')

# ---------- 6. leftovers / cleanup ----------
W ""
W "--- leftovers ---"
foreach ($p in (Get-CimInstance Win32_Process -Filter 'Name = "chrome.exe"' -ErrorAction SilentlyContinue)) {
  if ($p.CommandLine -like '*ShipScheduleHub*' -or $p.CommandLine -like '*ssh_review*') { W ("  chrome pid=" + $p.ProcessId + " start=" + $p.CreationDate) }
}
foreach ($p in (Get-CimInstance Win32_Process -Filter 'Name = "node.exe"' -ErrorAction SilentlyContinue)) {
  if ($p.CommandLine -like '*query.mjs*' -or $p.CommandLine -like '*cli.mjs*') { W ("  node pid=" + $p.ProcessId + " " + $p.CommandLine) }
}
W ""
W "--- appTmp content after runs ---"
Get-ChildItem $appTmp -Force -ErrorAction SilentlyContinue | Select-Object -First 15 | ForEach-Object { W ("  " + $_.Name + " " + $_.Length) }
W ""
W "--- evidence dirs ---"
Get-ChildItem (Join-Path $env:LOCALAPPDATA 'ShipScheduleHub\evidence') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 8 | ForEach-Object { W ("  " + $_.Name + " " + $_.Length + " " + $_.LastWriteTime.ToString('s')) }
$finalVisible = @([WinEnum7]::Visible())
W ("SELF-PROOF: final visible=" + $finalVisible.Count + " baseline=" + $baseVisible.Count + " powershell visible windows=" + @(Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle }).Count)
W "=== PROBE07 DONE ==="
Write-Output 'PROBE07 DONE'
