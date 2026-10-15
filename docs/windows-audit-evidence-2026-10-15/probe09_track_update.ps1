# PROBE 09 - tracking tab UI end-to-end + in-app update check (polling) + final cleanup.
$ErrorActionPreference = 'Continue'
$dir = 'C:\Users\Administrator\ssh_review'
$log = Join-Path $dir 'probe09.txt'
function W($s) { [string]$s | Out-File -FilePath $log -Append -Encoding UTF8 }
"=== PROBE09 $(Get-Date -Format 's') ===" | Out-File $log -Encoding UTF8

Add-Type -TypeDefinition @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class Win9 {
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
    if ($w -le 0 -or $h -le 0) { W "  shot skipped"; return }
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen([int]$rect[0], [int]$rect[1], 0, 0, (New-Object System.Drawing.Size($w, $h)))
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    W ("  shot: " + $path)
  } catch { W ("  shot FAILED: " + ($_.Exception.Message -replace '\s+',' ')) }
}
function Names($win) {
  $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $out = @()
  for ($i=0; $i -lt $all.Count; $i++) { $n = $all.Item($i).Current.Name; if ($n) { $out += $n } }
  return ,$out
}

$base = @([Win9]::Visible())
W ("baseline visible=" + $base.Count)
Get-Process shipschedulehub -ErrorAction SilentlyContinue | ForEach-Object { & "$env:SystemRoot\System32\taskkill.exe" /T /F /PID $_.Id | Out-Null }
Start-Sleep 2

# ---------- tracking tab end-to-end via the built-in self test ----------
$exe = 'C:\Program Files\ShipScheduleHub\shipschedulehub.exe'
$env:SSH_TRACK_SELFTEST = '276759780'
$app = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$appPid = $app.Id
Remove-Item Env:\SSH_TRACK_SELFTEST -ErrorAction SilentlyContinue
W ("launched pid=" + $appPid + " with SSH_TRACK_SELFTEST=276759780")
$hwnd = 0; $rect = $null; $deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  $mine = @([Win9]::Visible() | Where-Object { ($_ -split '\|')[1] -eq [string]$appPid })
  if ($mine.Count -gt 0) { $hwnd = [int64](($mine[0] -split '\|')[0]); $rect = [Win9]::RectOf($hwnd); break }
}
[Win9]::ShowWindow($hwnd, 9) | Out-Null
[Win9]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep 2
$root = [System.Windows.Automation.AutomationElement]::RootElement
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $appPid)))
$hit = $false; $deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 4
  if (-not $win) { break }
  $ns = Names $win
  $txt = ($ns -join ' || ')
  if ($txt -match 'MRKU|箱号|Container|追踪结果' -and $txt -match '在途|In Transit|到达|ARRIVAL|已放行|卸船|装载|航程|更新') { $hit = $true; break }
}
W ""
W ("--- tracking tab: result detected=" + $hit)
if ($win) {
  $ns = Names $win
  $sel = $ns | Where-Object { $_ -match '提单|箱号|追踪|单号|MRKU|在途|到达|卸|装|港|更新|Maersk|航' } | Select-Object -Unique
  W ("  relevant UI text (" + $sel.Count + "):")
  $sel | Select-Object -First 40 | ForEach-Object { W ("    " + $_) }
  $all = Names $win
  "UIA names (track view)" | Out-File (Join-Path $dir 'uia-dump-track.txt') -Encoding UTF8
  $all | ForEach-Object { $_ | Out-File (Join-Path $dir 'uia-dump-track.txt') -Append -Encoding UTF8 }
}
if ($rect) { Shot $rect (Join-Path $dir 'app-6-track.png') }

# ---------- in-app update check (manual) with polling for the toast ----------
W ""
W "--- update check (manual click, polling for toast) ---"
$upd = $null
if ($win) { $upd = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, '检查更新'))) }
if ($upd) {
  $upd.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  $found = $null; $deadline = (Get-Date).AddSeconds(75)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    $ns = Names $win
    $cand = $ns | Where-Object { $_ -match '已是最新|发现新版本|检查更新失败|没有版本号|正在检查|下载中|更新完成' } | Select-Object -Unique
    if ($cand.Count -gt 0) { $found = $cand; Shot $rect (Join-Path $dir 'app-7-update.png'); break }
  }
  W ("  toast/dialog detected: " + $(if ($found) { ($found -join ' | ') } else { '(none within 75s)' }))
  if ($found) { W ("  evidence screenshot: app-7-update.png") }
} else { W "  检查更新 button not found" }

# ---------- close + cleanup ----------
W ""
W "--- close + cleanup ---"
if ($win) { try { $win.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close() } catch { W ("  close failed: " + $_.Exception.Message) } }
Start-Sleep 6
$still = @(Get-Process shipschedulehub -ErrorAction SilentlyContinue)
W ("  processes after close: " + $still.Count)
foreach ($s in $still) { & "$env:SystemRoot\System32\taskkill.exe" /T /F /PID $s.Id | Out-Null; W ("  force-killed " + $s.Id) }
Start-Sleep 2
W ("  leftover chrome with app profile: " + @(Get-CimInstance Win32_Process -Filter 'Name = "chrome.exe"' -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*ShipScheduleHub*' }).Count)
W ("  leftover node: " + @(Get-CimInstance Win32_Process -Filter 'Name = "node.exe"' -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*query.mjs*' -or $_.CommandLine -like '*cli.mjs*' }).Count)
foreach ($t in 'SSHREV08','SSHREV09','SSHREV05','SSHREV06','SSHREV07') { $o = & schtasks.exe /Delete /TN $t /F 2>&1; W ("  del " + $t + " -> " + (($o -join ' ') -replace '\s+',' ')) }
W "  remaining SSHREV tasks: " + ((& schtasks.exe /Query /FO LIST 2>$null | Select-String 'TaskName' | Select-String 'SSHREV' | ForEach-Object { $_.ToString().Trim() }) -join ' ; ')
$final = @([Win9]::Visible())
W ("final visible=" + $final.Count + " baseline=" + $base.Count)
foreach ($v in $final) { W ("    " + $v) }
W ("SELF-PROOF: powershell visible windows=" + @(Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle }).Count)
W "=== PROBE09 DONE ==="
Write-Output 'PROBE09 DONE'
