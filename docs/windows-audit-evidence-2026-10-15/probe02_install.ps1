# -*- coding: utf-8 -*-
"""Probe 02 - inspect ShipScheduleHub install + app data on Windows (no GUI)."""
$ErrorActionPreference = 'Continue'
$out = @()
function W($s) { $script:out += $s }

$APP = 'C:\Program Files\ShipScheduleHub'
$DATA = "$env:LOCALAPPDATA\ShipScheduleHub"

W "=== PROBE 02 INSTALL INVENTORY ==="
W ("time=" + (Get-Date).ToString('s'))
W ""
W "--- $APP (top level) ---"
if (Test-Path $APP) {
  Get-ChildItem $APP -Force | ForEach-Object {
    $sz = if ($_.PSIsContainer) { '<dir>' } else { $_.Length }
    W ("  " + $_.Name.PadRight(40) + " " + $sz + "  mtime=" + $_.LastWriteTime.ToString('s'))
  }
  W ""
  W "--- exe version info ---"
  $exes = Get-ChildItem $APP -Filter *.exe
  foreach ($e in $exes) {
    $vi = $e.VersionInfo
    W ("  " + $e.Name + " ProductVersion=" + $vi.ProductVersion + " FileVersion=" + $vi.FileVersion + " Product=" + $vi.ProductName + " size=" + $e.Length)
  }
  W ""
  W "--- resources tree (depth 3, dirs + file counts) ---"
  $res = Join-Path $APP 'resources'
  if (Test-Path $res) {
    Get-ChildItem $res -Recurse -Depth 2 -Force -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.PSIsContainer) { W ("  DIR " + $_.FullName.Replace($APP,'') ) }
    }
  } else { W "  (no resources dir)" }
  W ""
  W "--- engine files (top 2 levels) ---"
  foreach ($d in @((Join-Path $APP 'resources\engine'), (Join-Path $APP 'engine'))) {
    if (Test-Path $d) {
      W ("  ==" + $d)
      Get-ChildItem $d -Force | ForEach-Object { W ("    " + $_.Name + "  " + $(if($_.PSIsContainer){'<dir>'}else{$_.Length})) }
      $nb = Join-Path $d 'node-bin'
      if (Test-Path $nb) { Get-ChildItem $nb -Force | ForEach-Object { W ("    node-bin/" + $_.Name + " " + $(if($_.PSIsContainer){'<dir>'}else{$_.Length})) } }
    }
  }
  W ""
  W "--- bundled node --version ---"
  foreach ($np in @("$APP\resources\engine\node-bin\node.exe", "$APP\engine\node-bin\node.exe")) {
    if (Test-Path $np) { W ("  " + $np + " -> " + (& $np --version 2>&1)) }
  }
} else { W "APP DIR MISSING" }

W ""
W "--- app data dir $DATA ---"
if (Test-Path $DATA) {
  Get-ChildItem $DATA -Force | ForEach-Object { W ("  " + $_.Name + " " + $(if($_.PSIsContainer){'<dir>'}else{$_.Length}) + " mtime=" + $_.LastWriteTime.ToString('s')) }
  $gl = Join-Path $DATA 'glass.log'
  if (Test-Path $gl) {
    W ""
    W "--- glass.log tail 60 ---"
    Get-Content $gl -Tail 60 -ErrorAction SilentlyContinue | ForEach-Object { W ("  | " + $_) }
    W ("  glass.log size=" + (Get-Item $gl).Length + " lines=" + ((Get-Content $gl -ErrorAction SilentlyContinue).Count))
  }
  $ev = Join-Path $DATA 'evidence'
  if (Test-Path $ev) {
    W ""
    W "--- evidence (recent 25) ---"
    Get-ChildItem $ev -Recurse -Force -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 25 | ForEach-Object { W ("  " + $_.FullName.Replace($DATA,'') + " " + $(if($_.PSIsContainer){'<dir>'}else{$_.Length}) + " " + $_.LastWriteTime.ToString('s')) }
  }
  $bp = Join-Path $DATA 'browser-profile'
  if (Test-Path $bp) {
    W ""
    W "--- browser-profile top ---"
    Get-ChildItem $bp -Force | Select-Object -First 15 | ForEach-Object { W ("  " + $_.Name + " mtime=" + $_.LastWriteTime.ToString('s')) }
  }
} else { W "DATA DIR MISSING" }

W ""
W "--- recent files under data dir (last 2h) ---"
if (Test-Path $DATA) {
  Get-ChildItem $DATA -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-24) } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 20 |
    ForEach-Object { W ("  " + $_.FullName.Replace($DATA,'') + " " + $_.Length + " " + $_.LastWriteTime.ToString('s')) }
}

W ""
W "--- Shortcut / start menu entries ---"
foreach ($p in @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\ShipScheduleHub.lnk", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\ShipScheduleHub.lnk", "$env:USERPROFILE\Desktop\ShipScheduleHub.lnk")) {
  W ("  " + $p + " exists=" + (Test-Path $p))
}

$out | Out-File -FilePath 'C:\Users\Administrator\ssh_review\probe02.txt' -Encoding UTF8
Write-Output "PROBE02 DONE lines=$($out.Count)"
