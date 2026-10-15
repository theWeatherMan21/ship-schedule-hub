# PROBE 06 - launch the real App in the user's interactive session, screenshot it,
# drive the in-app 诊断 panel through UI Automation, and verify cleanup.
$ErrorActionPreference = 'Continue'
$dir = 'C:\Users\Administrator\ssh_review'
$log = Join-Path $dir 'probe06.txt'
function W($s) { [string]$s | Out-File -FilePath $log -Append -Encoding UTF8 }
"=== PROBE06 $(Get-Date -Format 's') ===" | Out-File $log -Encoding UTF8

Add-Type -TypeDefinition @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class WinEnum {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
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
  public static long[] RectOf(long hwnd) { RECT r; GetWindowRect(new IntPtr(hwnd), out r); return new long[]{ r.L, r.T, r.R, r.B }; }
}
'@
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Snap($label) {
  $all = [WinEnum]::List()
  $vis = @($all | Where-Object { ($_ -split '\|')[2] -eq '1' })
  W "--- $label : total=$($all.Count) visible=$($vis.Count)"
  foreach ($v in $vis) { $f = $v -split '\|'; W ("    hwnd=" + $f[0] + " pid=" + $f[1] + " ex=0x" + $f[3] + " class=" + $f[4] + " rect=" + $f[5] + " title=" + $f[6]) }
  return ,$vis
}
function Shot($rect, $path) {
  try {
    $w = [int]$rect[2] - [int]$rect[0]; $h = [int]$rect[3] - [int]$rect[1]
    if ($w -le 0 -or $h -le 0) { W ("  shot skipped (bad rect " + ($rect -join ',') + ")"); return }
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen([int]$rect[0], [int]$rect[1], 0, 0, (New-Object System.Drawing.Size($w, $h)))
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    W ("  shot saved: " + $path + " (" + $w + "x" + $h + ")")
  } catch { W ("  shot FAILED: " + ($_.Exception.Message -replace '\s+',' ')) }
}

$baseline = Snap 'baseline windows'
$baseVisible = $baseline.Count

# kill any previous instance
Get-Process shipschedulehub -ErrorAction SilentlyContinue | ForEach-Object { & "$env:SystemRoot\System32\taskkill.exe" /T /F /PID $_.Id | Out-Null }
Start-Sleep 2

$exe = 'C:\Program Files\ShipScheduleHub\shipschedulehub.exe'
$evidence = Join-Path $env:LOCALAPPDATA 'ShipScheduleHub\evidence'
$before = @(Get-ChildItem $evidence -Filter 'run-*.ndjson' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
$trace = Join-Path $env:TEMP 'ssh-app-trace.log'
$traceLen0 = if (Test-Path $trace) { (Get-Item $trace).Length } else { 0 }

W ""
W "--- launching app with SSH_SELFTEST=1 (auto fills Ningbo->Istanbul and clicks) ---"
$env:SSH_SELFTEST = '1'
$app = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$appPid = $app.Id
W ("  app pid=" + $appPid)
Remove-Item Env:\SSH_SELFTEST -ErrorAction SilentlyContinue

# wait for its window
$hwnd = 0; $rect = $null; $deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  $mine = @([WinEnum]::List() | Where-Object { ($_ -split '\|')[1] -eq [string]$appPid -and ($_ -split '\|')[2] -eq '1' })
  if ($mine.Count -gt 0) { $hwnd = [int64](($mine[0] -split '\|')[0]); $rect = [WinEnum]::RectOf($hwnd); break }
}
if ($hwnd -eq 0) { W "  APP WINDOW NOT FOUND within 60s" } else {
  $f = ([WinEnum]::List() | Where-Object { ($_ -split '\|')[0] -eq [string]$hwnd })[0] -split '\|'
  W ("  app window hwnd=" + $hwnd + " pid=" + $f[1] + " exstyle=0x" + $f[3] + " class=" + $f[4] + " rect=" + $f[5] + " title=" + $f[6])
  W ("  transparency check: WS_EX_NOREDIRECTIONBITMAP(0x00200000) set = " + ((([Convert]::ToInt64($f[3],16)) -band 0x00200000) -ne 0))
  [WinEnum]::ShowWindow($hwnd, 9) | Out-Null   # SW_RESTORE
  [WinEnum]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep 2
  Shot $rect (Join-Path $dir 'app-1-initial.png')
}

# wait for the selftest query to finish (new ndjson containing summary)
$done = $false; $deadline = (Get-Date).AddSeconds(300); $runFile = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 5
  $new = @(Get-ChildItem $evidence -Filter 'run-*.ndjson' -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Name } | Sort-Object LastWriteTime -Descending)
  if ($new.Count -gt 0) {
    $runFile = $new[0]
    $txt = Get-Content $runFile.FullName -ErrorAction SilentlyContinue -Raw
    if ($txt -match '"type":"summary"') { $done = $true; break }
  }
}
W ""
W ("--- selftest query finished=" + $done + " runFile=" + $(if ($runFile) { $runFile.Name } else { '(none)' }))
if ($runFile) {
  W ("  lines=" + ((Get-Content $runFile.FullName | Measure-Object).Count) + " size=" + $runFile.Length)
  Get-Content $runFile.FullName | ForEach-Object {
    if ($_ -match '^\s*\{') {
      try { $j = $_ | ConvertFrom-Json } catch { return }
      if ($j.type -eq 'carrier-status') { W ("    [" + $j.carrier + "] status=" + $j.status + " ms=" + $j.ms + " rows=" + $(if ($j.schedules) { $j.schedules.Count } else { 0 }) + " http=" + $j.httpStatus) }
      elseif ($j.type -eq 'summary') { W ("    SUMMARY total=" + $j.total + " prefilled=" + $j.prefilled + " failed=" + $j.failed) }
      elseif ($j.type -eq 'engine-started') { W ("    engine-started windowMode=" + $j.windowMode) }
    }
  }
}
$a = @([WinEnum]::List() | Where-Object { ($_ -split '\|')[1] -eq [string]$appPid -and ($_ -split '\|')[2] -eq '1' })
if ($a.Count -gt 0) { $rect = [WinEnum]::RectOf([int64](($a[0] -split '\|')[0])); Shot $rect (Join-Path $dir 'app-2-results.png') }

# ---------- UI Automation: open the in-app 诊断 panel ----------
W ""
W "--- UIA ---"
try {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $appPid)
  $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
  if (-not $win) { W "  UIA window not found" } else {
    W ("  UIA window name=" + $win.Current.Name + " class=" + $win.Current.ClassName)
    $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    W ("  descendants=" + $all.Count)
    $dump = Join-Path $dir 'uia-dump1.txt'
    "UIA DESCENDANTS (first 120)" | Out-File $dump -Encoding UTF8
    for ($i = 0; $i -lt [Math]::Min(120, $all.Count); $i++) {
      $e = $all.Item($i)
      ("[" + $i + "] " + $e.Current.ControlType.ProgrammaticName + " name=" + $e.Current.Name) | Out-File $dump -Append -Encoding UTF8
    }
    $btnCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '诊断')
    $btn = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
    if (-not $btn) {
      W "  诊断 button not found by name; trying all buttons"
      $btns = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))
      W ("  buttons found=" + $btns.Count)
      for ($i = 0; $i -lt $btns.Count; $i++) { W ("    btn[" + $i + "] name=" + $btns.Item($i).Current.Name) }
    } else {
      W ("  found 诊断 button, invoking")
      $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
      Start-Sleep -Seconds 12
      $all2 = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $dump2 = Join-Path $dir 'uia-dump2.txt'
      "UIA DESCENDANTS AFTER 诊断 (all)" | Out-File $dump2 -Encoding UTF8
      for ($i = 0; $i -lt $all2.Count; $i++) {
        $e = $all2.Item($i)
        ("[" + $i + "] " + $e.Current.ControlType.ProgrammaticName + " name=" + $e.Current.Name) | Out-File $dump2 -Append -Encoding UTF8
      }
      W ("  post-diagnose descendants=" + $all2.Count)
      if ($rect) { Shot $rect (Join-Path $dir 'app-3-diagnose.png') }
      $copyCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '复制诊断')
      $cp = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $copyCond)
      if ($cp) {
        $cp.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        Start-Sleep -Seconds 2
        $clip = Get-Clipboard -Raw -ErrorAction SilentlyContinue
        if ($clip) { $clip | Out-File (Join-Path $dir 'diag-clipboard.txt') -Encoding UTF8; W ("  clipboard captured, " + $clip.Length + " chars") } else { W "  clipboard empty" }
      } else { W "  复制诊断 button not found" }
    }
  }
} catch { W ("  UIA failed: " + ($_.Exception.Message -replace '\s+',' ')) }

# ---------- artifacts ----------
W ""
W "--- trace log (new lines) ---"
if (Test-Path $trace) { $c = Get-Content $trace -ErrorAction SilentlyContinue; W ("  total lines=" + $c.Count); $c | Select-Object -Last 25 | ForEach-Object { W ("    | " + $_) } } else { W "  (no trace file)" }
W "--- glass.log ---"
$gl = Join-Path $env:LOCALAPPDATA 'ShipScheduleHub\glass.log'
if (Test-Path $gl) { Get-Content $gl -Tail 5 | ForEach-Object { W ("  | " + $_) } }
W "--- app data dir ---"
Get-ChildItem (Join-Path $env:LOCALAPPDATA 'ShipScheduleHub') -Force -ErrorAction SilentlyContinue | ForEach-Object { W ("  " + $_.Name + " " + $_.LastWriteTime.ToString('s')) }

# ---------- cleanup ----------
W ""
W "--- cleanup ---"
Get-Process shipschedulehub -ErrorAction SilentlyContinue | ForEach-Object { W ("  killing app pid=" + $_.Id); & "$env:SystemRoot\System32\taskkill.exe" /T /F /PID $_.Id | Out-Null }
Start-Sleep 3
$a = @([WinEnum]::List() | Where-Object { ($_ -split '\|')[1] -eq [string]$appPid -and ($_ -split '\|')[2] -eq '1' })
W ("  app windows still visible after kill: " + $a.Count)
$left = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*ShipScheduleHub*' })
W ("  leftover chrome with app profile: " + $left.Count)
foreach ($l in $left) { & "$env:SystemRoot\System32\taskkill.exe" /T /F /PID $l.ProcessId | Out-Null }
$final = Snap 'final windows'
$psWin = @(Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle })
W ("SELF-PROOF: powershell visible windows = " + $psWin.Count + " | baselineVisible=" + $baseVisible + " finalVisible=" + $final.Count)
W "=== PROBE06 DONE ==="
Write-Output 'PROBE06 DONE'
