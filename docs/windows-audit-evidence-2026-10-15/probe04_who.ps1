# -*- coding: utf-8 -*-
"""Probe 04 - who is running the leftover probe loop? process tree, tasks, scripts."""
$ErrorActionPreference = 'Continue'
$out = @()
function W($s) { $script:out += $s }

W "=== PROBE 04 ==="
W ("time=" + (Get-Date).ToString('s'))
W ""
W "--- process tree (all non-system procs, with parent + start) ---"
$ps = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
foreach ($p in ($ps | Where-Object { $_.Name -match 'powershell|node|cmd|shipschedule|conhost|schtasks' })) {
  $par = $ps | Where-Object { $_.ProcessId -eq $p.ParentProcessId } | Select-Object -First 1
  W ("  pid=" + $p.ProcessId + " ppid=" + $p.ParentProcessId + " (" + $(if($par){$par.Name}else{'?'}) + ") name=" + $p.Name + " start=" + $p.CreationDate + " cmd=" + ($p.CommandLine -replace '\s+',' '))
}
W ""
W "--- ssh-probe dir ---"
$sp = 'C:\Users\Administrator\ssh-probe'
if (Test-Path $sp) {
  Get-ChildItem $sp -Force -Recurse | ForEach-Object { W ("  " + $_.FullName + " " + $(if($_.PSIsContainer){'<dir>'}else{$_.Length}) + " " + $_.LastWriteTime.ToString('s')) }
  foreach ($f in (Get-ChildItem $sp -File -Filter *.ps1 -ErrorAction SilentlyContinue)) {
    W ""
    W ("--- CONTENT: " + $f.FullName + " ---")
    Get-Content $f.FullName -ErrorAction SilentlyContinue | ForEach-Object { W ("  | " + $_) }
  }
} else { W "  (no ssh-probe dir)" }
W ""
W "--- ssh_review dir ---"
Get-ChildItem 'C:\Users\Administrator\ssh_review' -Force -ErrorAction SilentlyContinue | ForEach-Object { W ("  " + $_.Name + " " + $_.Length + " " + $_.LastWriteTime.ToString('s')) }
W ""
W "--- scheduled tasks (non-microsoft) ---"
try {
  Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } | ForEach-Object {
    $info = $_ | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
    W ("  " + $_.TaskPath + $_.TaskName + " state=" + $_.State + " lastRun=" + $(if($info){$info.LastRunTime}) + " nextRun=" + $(if($info){$info.NextRunTime}) + " lastResult=" + $(if($info){$info.LastTaskResult}))
    ($_.Actions | ForEach-Object { W ("      action: " + $_.Execute + " " + $_.Arguments) })
  }
} catch { W "  task enum failed" }
W ""
W "--- schtasks CSV fallback (filter) ---"
try { (& "$env:SystemRoot\System32\schtasks.exe" /query /fo CSV /v 2>&1) | Select-String -Pattern 'ShipSchedule|ssh-probe|query\.ps1|Hermes|shiphub' | Select-Object -First 20 | ForEach-Object { W ("  " + $_.ToString()) } } catch { W "  schtasks failed" }
W ""
W "--- Downloads / Desktop recent files ---"
foreach ($d in @("$env:USERPROFILE\Downloads", "$env:USERPROFILE\Desktop", 'C:\Users\Administrator\Documents')) {
  if (Test-Path $d) {
    W ("  == " + $d)
    Get-ChildItem $d -Force -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 12 | ForEach-Object { W ("     " + $_.LastWriteTime.ToString('s') + " " + $_.Name + " " + $(if($_.PSIsContainer){'<dir>'}else{$_.Length})) }
  }
}
W ""
W "--- evidence runs today ---"
$ev = "$env:LOCALAPPDATA\ShipScheduleHub\evidence"
Get-ChildItem $ev -Filter *.ndjson -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 8 | ForEach-Object { W ("  " + $_.Name + " " + $_.Length + " lines=" + ((Get-Content $_.FullName -ErrorAction SilentlyContinue).Count) + " " + $_.LastWriteTime.ToString('s')) }
$out | Out-File -FilePath 'C:\Users\Administrator\ssh_review\probe04.txt' -Encoding UTF8
Write-Output "PROBE04 DONE lines=$($out.Count)"
