# PROBE 08 - clean visual capture, in-app update check, tray probe, close behaviour, restore host windows, cleanup.
$ErrorActionPreference = 'Continue'
$dir = 'C:\Users\Administrator\ssh_review'
$log = Join-Path $dir 'probe08.txt'
function W($s) { [string]$s | Out-File -FilePath $log -Append -Encoding UTF8 }
"=== PROBE08 $(Get-Date -Format 's') ===" | Out-File $log -Encoding UTF8

Add-Type -TypeDefinition @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class Win8 {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
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
  public static long[] RectOf(long hwnd) { RECT r; GetWindowRect(new IntPtr(hwnd), out r); return new long[]{ r.L, r.T, r.R, r.B }; }
}
'@
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Shot($rect, $path) {
  try {
    $w = [int]$rect[2] - [int]$rect[0]; $h = [int]$rect[3] - [int]$rect[1]
    if ($w -le 0 -or $h -le 0) { W "  shot skipped (bad rect)"; return }
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen([int]$rect[0], [int]$rect[1], 0, 0, (New-Object System.Drawing.Size($w, $h)))
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    W ("  shot: " + $path + " (" + $w + "x" + $h + ")")
  } catch { W ("  shot FAILED: " + ($_.Exception.Message -replace '\s+',' ')) }
}

$base = @([Win8]::Visible())
W ("baseline visible windows=" + $base.Count)
foreach ($v in $base) { W ("    " + $v) }

Get-Process shipschedulehub -ErrorAction SilentlyContinue | ForEach-Object { & "$env:SystemRoot\System32\taskkill.exe" /T /F /PID $_.Id | Out-Null }
Start-Sleep 2

# ---------- clean single-instance launch + screenshot ----------
$exe = 'C:\Program Files\ShipScheduleHub\shipschedulehub.exe'
$app = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$appPid = $app.Id
W ("launched pid=" + $appPid)
$hwnd = 0; $rect = $null; $deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  $mine = @([Win8]::Visible() | Where-Object { ($_ -split '\|')[1] -eq [string]$appPid })
  if ($mine.Count -gt 0) { $hwnd = [int64](($mine[0] -split '\|')[0]); $rect = [Win8]::RectOf($hwnd); break }
}
$procs = @(Get-Process shipschedulehub -ErrorAction SilentlyContinue)
$winCount = @([Win8]::Visible() | Where-Object { ($_ -split '\|')[4] -like '*ShipScheduleHub*' }).Count
W ("processes named shipschedulehub=" + $procs.Count + " (pids " + (($procs | ForEach-Object { $_.Id }) -join ',') + ")")
W ("app hwnd=" + $hwnd + " rect=" + ($rect -join ',') + " 窗口标题含 ShipScheduleHub 的可见窗口数=" + $winCount)
[Win8]::ShowWindow($hwnd, 9) | Out-Null
[Win8]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep 3
Shot $rect (Join-Path $dir 'app-4-clean.png')

# ---------- UIA: update check + tray ----------
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $appPid)
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
W ""
W "--- UIA ---"
if (-not $win) { W "  app window not found via UIA" } else {
  W ("  name=" + $win.Current.Name + " class=" + $win.Current.ClassName)
  $upd = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '检查更新')))
  if ($upd) {
    W "  invoking 检查更新"
    $upd.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Start-Sleep 12
    $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $names = @(); for ($i=0; $i -lt $all.Count; $i++) { $n = $all.Item($i).Current.Name; if ($n -and $n -match '更新|最新|版本|v1\.|失败|错误|无法') { $names += $n } }
    W ("  update-related UIA text: " + (($names | Select-Object -Unique) -join ' || '))
    if ($rect) { Shot $rect (Join-Path $dir 'app-5-update.png') }
  } else { W "  检查更新 button not found" }
}
W ""
W "--- tray probe (Shell_TrayWnd descendants named like the app) ---"
try {
  $tray = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'Shell_TrayWnd')))
  if ($tray) {
    $all = $tray.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $hits = @(); for ($i=0; $i -lt $all.Count; $i++) { $n = $all.Item($i).Current.Name; if ($n -match 'Ship|船期') { $hits += ($all.Item($i).Current.ControlType.ProgrammaticName + ':' + $n) } }
    W ("  tray descendants=" + $all.Count + "  app-related=" + $hits.Count + " " + ($hits -join ' | '))
  } else { W "  Shell_TrayWnd not found" }
} catch { W ("  tray probe failed: " + ($_.Exception.Message -replace '\s+',' ')) }

# ---------- close behaviour ----------
W ""
W "--- close behaviour (invoke window close pattern) ---"
if ($win) {
  try {
    $win.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close()
    Start-Sleep 6
  } catch { W ("  UIA close failed: " + ($_.Exception.Message -replace '\s+',' ')) }
}
$still = @(Get-Process shipschedulehub -ErrorAction SilentlyContinue)
W ("  shipschedulehub processes after close: " + $still.Count + " (pids " + (($still | ForEach-Object { $_.Id }) -join ',') + ")")
if ($still.Count -gt 0) {
  Start-Sleep 8
  $still = @(Get-Process shipschedulehub -ErrorAction SilentlyContinue)
  W ("  after +8s: " + $still.Count)
  foreach ($s in $still) { & "$env:SystemRoot\System32\taskkill.exe" /T /F /PID $s.Id | Out-Null; W ("  force-killed leftover pid=" + $s.Id) }
}
Start-Sleep 2
$leftChrome = @(Get-CimInstance Win32_Process -Filter 'Name = "chrome.exe"' -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*ShipScheduleHub*' })
W ("  leftover chrome with app profile: " + $leftChrome.Count)

# ---------- restore host windows that got minimized earlier ----------
W ""
W "--- restore host windows minimized during earlier probes (QQ / Foxmail) ---"
foreach ($v in @([Win8]::Visible())) {
  $f = $v -split '\|'
  $r = $f[3] -split ','
  if ([int]$r[0] -le -30000) {
    $h = [int64]$f[0]
    [Win8]::ShowWindow($h, 9) | Out-Null
    Start-Sleep 1
    W ("  restored hwnd=" + $h + " title=" + $f[4] + " newRect=" + ([Win8]::RectOf($h) -join ','))
  }
}

# ---------- remove the scheduled tasks used by this card ----------
W ""
W "--- cleanup scheduled tasks ---"
foreach ($t in 'SSHREV05','SSHREV06','SSHREV07') {
  $out = & schtasks.exe /Delete /TN $t /F 2>&1
  W ("  delete " + $t + " -> " + ($out -join ' '))
}
$final = @([Win8]::Visible())
W ("SELF-PROOF: final visible=" + $final.Count + " baseline=" + $base.Count + " powershell visible windows=" + @(Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle }).Count)
W "=== PROBE08 DONE ==="
Write-Output 'PROBE08 DONE'
