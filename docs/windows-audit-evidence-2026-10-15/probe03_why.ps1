# -*- coding: utf-8 -*-
"""Probe 03 - why did install dir mtimes move today? + full inventory."""
$ErrorActionPreference = 'Continue'
$out = @()
function W($s) { $script:out += $s }
$APP = 'C:\Program Files\ShipScheduleHub'

W "=== PROBE 03 ==="
W ("time=" + (Get-Date).ToString('s'))
$ai = Get-Item $APP
W ("APP dir CreationTime=" + $ai.CreationTime.ToString('s') + " LastWriteTime=" + $ai.LastWriteTime.ToString('s'))
foreach ($sub in @('db','engine')) {
  $s = Get-Item (Join-Path $APP $sub)
  W ("  " + $sub + " CreationTime=" + $s.CreationTime.ToString('s') + " LastWrite=" + $s.LastWriteTime.ToString('s'))
}
W ""
W "--- all files under APP sorted by mtime desc (top 30) ---"
Get-ChildItem $APP -Recurse -File -Force -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 30 |
  ForEach-Object { W ("  " + $_.LastWriteTime.ToString('s') + "  " + $_.Length.ToString().PadLeft(10) + "  " + $_.FullName.Replace($APP,'')) }
W ""
W "--- db dir ---"
Get-ChildItem (Join-Path $APP 'db') -Force -ErrorAction SilentlyContinue | ForEach-Object { W ("  " + $_.Name + " " + $(if($_.PSIsContainer){'<dir>'}else{$_.Length}) + " " + $_.LastWriteTime.ToString('s')) }
W ""
W "--- engine subdirs ---"
foreach ($d in @('lib','recipes','tracking','node_modules')) {
  $p = Join-Path $APP "engine\$d"
  if (Test-Path $p) {
    $n = (Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
    W ("  engine\$d files=$n lastWrite=" + (Get-Item $p).LastWriteTime.ToString('s'))
    Get-ChildItem $p -Force -ErrorAction SilentlyContinue | Select-Object -First 30 | ForEach-Object { W ("     " + $_.Name + " " + $(if($_.PSIsContainer){'<dir>'}else{$_.Length})) }
  }
}
W ""
W "--- installer / antivirus / agent processes ---"
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'msiexec|setup|install|defender|MsMpEng|hermes|python|node|tailscale|powershell|cmd' } |
  ForEach-Object { W ("  pid=" + $_.ProcessId + " " + $_.Name + " | " + ($_.CommandLine -replace '\s+',' ')) }
W ""
W "--- hermes on windows? ---"
foreach ($p in @("$env:USERPROFILE\.hermes", "$env:USERPROFILE\.hermes\kanban.db", "$env:USERPROFILE\.hermes\config.json")) {
  W ("  " + $p + " exists=" + (Test-Path $p))
}
W ""
W "--- recently modified files in C:\Program Files (last 2h) ---"
Get-ChildItem 'C:\Program Files' -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-2) } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 20 |
  ForEach-Object { W ("  " + $_.LastWriteTime.ToString('s') + " " + $_.FullName) }
W ""
W "--- start menu lnk target ---"
$lnk = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\ShipScheduleHub.lnk"
if (Test-Path $lnk) {
  $sh = New-Object -ComObject WScript.Shell
  $sc = $sh.CreateShortcut($lnk)
  W ("  target=" + $sc.TargetPath + " | args=" + $sc.Arguments + " | workdir=" + $sc.WorkingDirectory)
}
W ""
W "--- last evidence ndjson: which run, how many lines ---"
$ev = "$env:LOCALAPPDATA\ShipScheduleHub\evidence"
Get-ChildItem $ev -Filter *.ndjson -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 3 | ForEach-Object {
  W ("  " + $_.Name + " lines=" + ((Get-Content $_.FullName -ErrorAction SilentlyContinue).Count) + " mtime=" + $_.LastWriteTime.ToString('s'))
}
$recent = Get-ChildItem $ev -Filter *.ndjson -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($recent) {
  W ("  --- first 3 lines of " + $recent.Name + " ---")
  Get-Content $recent.FullName -TotalCount 3 -ErrorAction SilentlyContinue | ForEach-Object { W ("    " + $_.Substring(0, [Math]::Min(300, $_.Length))) }
}
$out | Out-File -FilePath 'C:\Users\Administrator\ssh_review\probe03.txt' -Encoding UTF8
Write-Output "PROBE03 DONE lines=$($out.Count)"
