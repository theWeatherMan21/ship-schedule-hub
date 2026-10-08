<#
  setup-remote-access.ps1 —— Windows 一键调试环境配置（ShipScheduleHub 远程排障用）
  婉宜 10-08 写。目标：不管那台机器是什么状态，跑完这个脚本我就能 SSH 进去。

  做四件事（全部幂等，重复跑没事）：
    ① 环境体检：版本/架构/管理员/网络/代理/已有组件/可疑环境变量/已装 App/浏览器
    ② Tailscale：没装就装；没登录就给登录链接并等待；最后报出 Tailscale IP
    ③ OpenSSH Server：装（Windows 功能 → GitHub 兜底）、开机自启、默认 shell=PowerShell、
       防火墙只放 Tailscale 网段、写入调试公钥
    ④ 自检 + 生成报告（桌面），并把关键信息复制到剪贴板方便你发我

  兼容：Windows 10 1809+ / Windows 11；PowerShell 5.1 语法（不依赖 PS7）。
#>

[CmdletBinding()]
param(
  [string]$PubKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKNCwrbU8S+KTQwY57iQl4uRQKAmlx6YLFK/dDleZUsD hermes-debug@mac',
  [string]$DebugIp = '100.93.4.124'   # 我的 Tailscale 地址（用来限制防火墙来源）
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

# ---------- 报告与输出 ----------
$script:Report = New-Object System.Collections.ArrayList
function W([string]$m, [string]$c = 'Gray') {
  $m = [string]$m
  Write-Host $m -ForegroundColor $c
  [void]$script:Report.Add($m)
}
function Ok([string]$m)   { W ("[OK]   " + $m) 'Green' }
function Bad([string]$m)  { W ("[NG]   " + $m) 'Red' }
function Warn2([string]$m){ W ("[WARN] " + $m) 'Yellow' }
function Sec([string]$t)  { W ''; W ("==== " + $t + " ====") 'Cyan' }

$reportPath = $null
try {
  $desktop = [Environment]::GetFolderPath('Desktop')
  if ([string]::IsNullOrWhiteSpace($desktop)) { $desktop = $env:TEMP }
  $reportPath = Join-Path $desktop ("ssh-setup-report-{0:yyyyMMdd-HHmm}.txt" -f (Get-Date))
} catch { $reportPath = Join-Path $env:TEMP 'ssh-setup-report.txt' }

Write-Host ''
Write-Host '==================================================================' -ForegroundColor Cyan
Write-Host ' ShipScheduleHub ・ Windows 远程调试环境一键配置（婉宜）' -ForegroundColor Cyan
Write-Host ' 这个脚本会让「我」能通过 Tailscale + SSH 连进这台机器排查问题' -ForegroundColor Cyan
Write-Host ' 全程幂等、可重复运行；不会删除任何东西' -ForegroundColor Cyan
Write-Host '==================================================================' -ForegroundColor Cyan
Write-Host ''

# ---------- 0. 身份与网络 ----------
Sec '0. 环境识别'
$isAdmin = $false
try {
  $pr = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  $isAdmin = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {}
if (-not $isAdmin) {
  Bad '当前不是管理员权限 —— 装 OpenSSH / 改防火墙会失败'
  W '     请关掉窗口，右键这个 .bat →「以管理员身份运行」再试一次。' 'Yellow'
  Read-Host '按回车退出'
  exit 1
}
Ok '管理员权限'

$os = $null
try { $os = Get-CimInstance -ClassName Win32_OperatingSystem } catch {}
$arch = $env:PROCESSOR_ARCHITECTURE
$user = "$env:USERDOMAIN\$env:USERNAME"
$hostname = $env:COMPUTERNAME
if ($os) {
  Ok ("系统：{0} (Build {1})" -f $os.Caption, $os.BuildNumber)
} else { Warn2 '取不到系统信息（WMI 被限？）' }
Ok ("架构：{0}　用户名：{1}　主机名：{2}" -f $arch, $user, $hostname)

# 出网连通性
Sec '1. 网络与代理'
foreach ($t in @(@('login.tailscale.com', 443), @('github.com', 443), @('pkgs.tailscale.com', 443))) {
  $ok = $false
  try { $ok = Test-NetConnection -ComputerName $t[0] -Port $t[1] -InformationLevel Quiet -WarningAction SilentlyContinue } catch {}
  if ($ok) { Ok ("可达 {0}:{1}" -f $t[0], $t[1]) } else { Bad ("不可达 {0}:{1}（装 Tailscale 需要它）" -f $t[0], $t[1]) }
}
try {
  $wp = (netsh winhttp show proxy) -join ' '
  W ('      WinHTTP 代理：' + ($wp -replace '\s+', ' ')).Trim() 'DarkGray'
} catch {}
try {
  $ie = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction Stop
  if ($ie.ProxyEnable -eq 1) { Warn2 ("系统代理开着：" + $ie.ProxyServer + "（脚本会尝试直连；代理会影响下载）") }
} catch {}

# 可疑环境变量（之前踩过的坑：裸盘符 / 污染变量会让引擎启动即崩）
Sec '2. 环境变量体检（引擎启动踩过的坑）'
foreach ($v in @('TEMP', 'TMP', 'NODE_PATH', 'NODE_OPTIONS', 'PATH')) {
  $val = [Environment]::GetEnvironmentVariable($v, 'Process')
  if ([string]::IsNullOrWhiteSpace($val) -and $v -ne 'PATH') { Warn2 ("$v 为空") ; continue }
  $short = $val
  if ($short.Length -gt 200) { $short = $short.Substring(0, 200) + ' …' }
  W ("     $v = $short") 'DarkGray'
  if ($val -match '^[A-Za-z]:$') { Bad ("$v 是裸盘符（$val）→ 会导致 Node 报 EISDIR: lstat 'D:'，脚本会记下来") }
  if ($v -eq 'NODE_PATH' -and -not [string]::IsNullOrWhiteSpace($val)) { Warn2 'NODE_PATH 有值，我们的 App 会主动忽略它（防污染）' }
  if ($v -eq 'NODE_OPTIONS' -and $val -match 'require|import') { Warn2 'NODE_OPTIONS 含 require/import，会干扰引擎' }
}

# ---------- 3. Tailscale ----------
Sec '3. Tailscale'
$tsExe = $null
foreach ($p in @(
    (Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Tailscale\tailscale.exe'),
    (Join-Path $env:LOCALAPPDATA 'Tailscale\tailscale.exe'))) {
  if ($p -and (Test-Path $p)) { $tsExe = $p; break }
}
if (-not $tsExe) {
  $cmd = Get-Command tailscale.exe -ErrorAction SilentlyContinue
  if ($cmd) { $tsExe = $cmd.Source }
}

if ($tsExe) {
  Ok ("已安装：" + $tsExe)
} else {
  Warn2 '未安装 Tailscale —— 开始安装'
  $installed = $false
  $wg = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($wg) {
    W '     尝试 winget 安装 Tailscale.Tailscale …' 'DarkGray'
    try {
      & $wg.Source install --id Tailscale.Tailscale --exact --silent --accept-package-agreements --accept-source-agreements | Out-Null
      $installed = $true
    } catch { Warn2 ('winget 失败：' + $_.Exception.Message) }
  }
  if (-not $installed) {
    $exe = Join-Path $env:TEMP 'tailscale-setup.exe'
    W '     下载官方安装包 pkgs.tailscale.com …' 'DarkGray'
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri 'https://pkgs.tailscale.com/stable/tailscale-setup-latest.exe' -OutFile $exe -UseBasicParsing -TimeoutSec 300
      Ok ('已下载 ' + $exe)
      Start-Process -FilePath $exe -ArgumentList '/quiet' -Wait
      $installed = $true
    } catch { Bad ('下载/安装失败：' + $_.Exception.Message) }
  }
  Start-Sleep -Seconds 5
  foreach ($p in @((Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'), (Join-Path $env:LOCALAPPDATA 'Tailscale\tailscale.exe'))) {
    if (Test-Path $p) { $tsExe = $p; break }
  }
  if ($tsExe) { Ok 'Tailscale 安装完成' } else { Bad 'Tailscale 仍未就绪（可能被安全软件拦了）' }
}

$tsIp = $null
if ($tsExe) {
  try { Start-Service Tailscale -ErrorAction SilentlyContinue } catch {}
  try { Start-Sleep -Seconds 3; & $tsExe status | Out-Null } catch {}

  # 判断是否已登录：status 里能拿到自己的 IP
  try {
    $st = (& $tsExe ip -4 2>$null | Select-Object -First 1)
    if ($st -and $st -match '^\d+\.\d+\.\d+\.\d+$') { $tsIp = $st }
  } catch {}

  if ($tsIp) {
    Ok ("已登录，Tailscale IP = " + $tsIp)
  } else {
    Warn2 'Tailscale 未登录 —— 下面会给你一个链接，请在浏览器里登录（授权这台机器）'
    $outFile = Join-Path $env:TEMP 'ts-up-out.txt'
    $errFile = Join-Path $env:TEMP 'ts-up-err.txt'
    if (Test-Path $outFile) { Remove-Item $outFile -Force -ErrorAction SilentlyContinue }
    $proc = Start-Process -FilePath $tsExe -ArgumentList 'up' -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $loginUrl = $null
    $waited = 0
    while ($waited -lt 300) {
      Start-Sleep -Seconds 2; $waited += 2
      $txt = ''
      foreach ($f in @($outFile, $errFile)) { if (Test-Path $f) { $txt += (Get-Content $f -Raw -ErrorAction SilentlyContinue) } }
      if ($txt -and -not $loginUrl -and ($txt -match 'https://login\.tailscale\.com/\S+')) {
        $loginUrl = $Matches[0]
        W ''
        W '  ┌────────────────────────────────────────────────────────────┐' 'Yellow'
        W '  │ 请在浏览器打开下面这个链接完成登录（同一台机器上直接点开）  │' 'Yellow'
        W '  └────────────────────────────────────────────────────────────┘' 'Yellow'
        W ('  ' + $loginUrl) 'White'
        try { Set-Clipboard -Value $loginUrl; Ok '链接已复制到剪贴板' } catch {}
        W ''
      }
      try { $st2 = (& $tsExe ip -4 2>$null | Select-Object -First 1) } catch { $st2 = $null }
      if ($st2 -and $st2 -match '^\d+\.\d+\.\d+\.\d+$') { $tsIp = $st2; break }
      if ($proc.HasExited) {
        try { $st3 = (& $tsExe ip -4 2>$null | Select-Object -First 1) } catch { $st3 = $null }
        if ($st3 -and $st3 -match '^\d+\.\d+\.\d+\.\d+$') { $tsIp = $st3 }
        break
      }
    }
    if (-not $proc.HasExited) { try { $proc | Wait-Process -Timeout 60 -ErrorAction SilentlyContinue } catch {} }
    if ($tsIp) { Ok ("登录成功，Tailscale IP = " + $tsIp) }
    else { Bad '还没登录成功。可以手动开 Tailscale 托盘图标登录，然后重新跑本脚本。' }
  }
}

# ---------- 4. OpenSSH Server ----------
Sec '4. OpenSSH Server'
$sshdDir = Join-Path $env:ProgramFiles 'OpenSSH'
$sshdExe = Join-Path $sshdDir 'sshd.exe'
$svc = Get-Service -Name sshd -ErrorAction SilentlyContinue

function Test-SshdPort {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $t = $c.BeginConnect('127.0.0.1', 22, $null, $null)
    $ok = $t.AsyncWaitHandle.WaitOne(1500)
    $c.Close()
    return $ok
  } catch { return $false }
}

if ($svc -and (Test-Path $sshdExe)) {
  Ok 'sshd 已安装（服务存在）'
} else {
  Warn2 '未安装 OpenSSH Server —— 开始安装（优先用 Windows 功能）'
  $capOk = $false
  try {
    $cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction Stop
    if ($cap.State -eq 'Installed') { $capOk = $true; Ok 'Windows 功能里已安装 OpenSSH.Server' }
    else {
      W '     通过 Windows 功能安装（可能较慢）…' 'DarkGray'
      $r = Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction Stop
      $capOk = ($r.RestartNeeded -ne $true) -or $true
      Ok 'Windows 功能安装完成'
    }
  } catch { Warn2 ('Windows 功能安装失败：' + $_.Exception.Message) }

  if (-not $capOk -or -not (Test-Path (Join-Path $env:SystemRoot 'System32\OpenSSH\sshd.exe'))) {
    Warn2 '改用官方 Win32-OpenSSH 压缩包（GitHub 兜底）'
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $zip = Join-Path $env:TEMP 'OpenSSH-Win64.zip'
      Invoke-WebRequest -Uri 'https://github.com/PowerShell/Win32-OpenSSH/releases/latest/download/OpenSSH-Win64.zip' -OutFile $zip -UseBasicParsing -TimeoutSec 300
      $dst = Join-Path $env:TEMP ('OpenSSH-x-' + (Get-Random))
      if (Test-Path $dst) { Remove-Item $dst -Recurse -Force -ErrorAction SilentlyContinue }
      Expand-Archive -Path $zip -DestinationPath $dst -Force
      $inner = Get-ChildItem -Path $dst -Directory | Select-Object -First 1
      if (-not (Test-Path $sshdDir)) { New-Item -Path $sshdDir -ItemType Directory -Force | Out-Null }
      Copy-Item -Path (Join-Path $inner.FullName '*') -Destination $sshdDir -Recurse -Force
      if (Test-Path (Join-Path $sshdDir 'install-sshd.ps1')) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $sshdDir 'install-sshd.ps1') | Out-Null
      }
      Ok 'Win32-OpenSSH 已就位'
    } catch { Bad ('Win32-OpenSSH 安装失败：' + $_.Exception.Message) }
  }
}

# 服务：自启 + 启动
$svc = Get-Service -Name sshd -ErrorAction SilentlyContinue
if ($svc) {
  try { Set-Service -Name sshd -StartupType Automatic -ErrorAction Stop; Ok 'sshd 服务设为开机自启' } catch { Warn2 ('设自启失败：' + $_.Exception.Message) }
  try { if ($svc.Status -ne 'Running') { Start-Service -Name sshd -ErrorAction Stop; Start-Sleep -Seconds 2 } ; Ok 'sshd 已启动' } catch { Bad ('启动 sshd 失败：' + $_.Exception.Message) }
} else {
  Bad 'sshd 服务仍不存在 —— 这一步需要人工（把上面的报错发我）'
}

# 默认 shell 用 PowerShell（排障更好用）
try {
  if (-not (Test-Path 'HKLM:\SOFTWARE\OpenSSH')) { New-Item -Path 'HKLM:\SOFTWARE\OpenSSH' -Force | Out-Null }
  New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null
  Ok 'SSH 默认 shell = PowerShell'
} catch { Warn2 ('设置默认 shell 失败：' + $_.Exception.Message) }

# 防火墙：只放 Tailscale 网段（比全网放开安全）
try {
  $ruleName = 'OpenSSH-Server-TailscaleOnly'
  Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 `
    -RemoteAddress '100.64.0.0/10' -Profile Any -ErrorAction Stop | Out-Null
  Ok '防火墙：仅允许 Tailscale 网段（100.64.0.0/10）访问 22 端口'
} catch { Warn2 ('防火墙规则失败：' + $_.Exception.Message) }

# 公钥：管理员账户必须写 administrators_authorized_keys（否则密钥不生效）
try {
  $keyFile = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
  $sshDir = Join-Path $env:ProgramData 'ssh'
  if (-not (Test-Path $sshDir)) { New-Item -Path $sshDir -ItemType Directory -Force | Out-Null }
  if (-not (Test-Path $keyFile)) { New-Item -Path $keyFile -ItemType File -Force | Out-Null }
  $cur = ''
  try { $cur = Get-Content $keyFile -Raw -ErrorAction SilentlyContinue } catch {}
  if ($cur -and $cur.Contains($PubKey)) {
    Ok '调试公钥已存在（跳过）'
  } else {
    Add-Content -Path $keyFile -Value $PubKey -Encoding ASCII
    Ok '已写入调试公钥'
  }
  # ACL：只留 Administrators + SYSTEM（写错权限密钥会被 sshd 忽略）
  & icacls.exe $keyFile /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null
  Ok '公钥文件权限已收紧（Administrators + SYSTEM）'
} catch { Bad ('写公钥失败：' + $_.Exception.Message) }

# sshd_config：确保开启公钥认证
try {
  $cfg = Join-Path $env:ProgramData 'ssh\sshd_config'
  if (Test-Path $cfg) {
    $txt = Get-Content $cfg -Raw
    if ($txt -notmatch '(?m)^\s*PubkeyAuthentication\s+yes') {
      Add-Content -Path $cfg -Value "`r`nPubkeyAuthentication yes" -Encoding ASCII
      Ok 'sshd_config 补了 PubkeyAuthentication yes'
    } else { Ok 'sshd_config 公钥认证已开' }
    try { Restart-Service sshd -Force -ErrorAction SilentlyContinue; Ok 'sshd 已重启使配置生效' } catch {}
  }
} catch { Warn2 ('改 sshd_config 失败：' + $_.Exception.Message) }

# ---------- 5. 应用与浏览器体检（跟 App 排障直接相关）----------
Sec '5. App / 浏览器 / Node 体检'
$appHits = @()
try {
  $keys = @('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
            'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')
  foreach ($k in $keys) {
    Get-ItemProperty -Path $k -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -like '*ShipSchedule*' } |
      ForEach-Object { $appHits += ("{0} | {1} | {2}" -f $_.DisplayName, $_.DisplayVersion, $_.InstallLocation) }
  }
} catch {}
if ($appHits.Count -gt 0) { $appHits | ForEach-Object { Ok ('已装 App: ' + $_) } } else { Warn2 '注册表里没找到 ShipScheduleHub 的安装记录（可能是免安装/绿色版）' }

# 扫常见位置找 exe（只扫浅层，避免卡住）
$cands = @()
foreach ($root in @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
  if ($root -and (Test-Path $root)) {
    $cands += (Join-Path $root 'ShipScheduleHub')
    $cands += (Join-Path $root 'Programs\ShipScheduleHub')
  }
}
foreach ($d in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | Where-Object { $_.Free -ne $null })) {
  $cands += (Join-Path ($d.Name + ':\') 'ShipScheduleHub')
}
foreach ($c in $cands) {
  if ($c -and (Test-Path $c)) {
    $exe = Get-ChildItem -Path $c -Filter 'ShipScheduleHub.exe' -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exe) { Ok ('找到程序: ' + $exe.FullName) }
  }
}
$runData = Join-Path $env:LOCALAPPDATA 'ShipScheduleHub'
if (Test-Path $runData) {
  Ok ('运行期数据目录存在: ' + $runData)
  $logDir = Join-Path $runData 'evidence'
  if (Test-Path $logDir) {
    $latest = Get-ChildItem $logDir -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 3
    foreach ($l in $latest) { W ('     最近日志: ' + $l.Name + '  ' + $l.LastWriteTime) 'DarkGray' }
  }
} else { Warn2 '运行期数据目录不存在（App 可能从没成功跑起来过）' }

foreach ($b in @(
    @('Chrome', (Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe')),
    @('Chrome(86)', (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')),
    @('Edge', (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')),
    @('Edge', (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')))) {
  if ($b[1] -and (Test-Path $b[1])) { Ok ("浏览器 $($b[0])：$($b[1])") }
}
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCmd) { Ok ("系统 Node：" + $nodeCmd.Source + "  " + ((& $nodeCmd.Source -v) 2>$null)) } else { W '     系统没装 Node（我们的 App 自带 node，不影响）' 'DarkGray' }

# WebView2 运行时：Tauri 在 Windows 上**必需**（老 Win10 常常没有 → 装了 App 也打不开/白屏）
$wv2 = $null
foreach ($k in @('HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
                 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
                 'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}')) {
  try { $v = (Get-ItemProperty -Path $k -ErrorAction Stop).pv; if ($v) { $wv2 = $v; break } } catch {}
}
if ($wv2) { Ok ("WebView2 运行时：已装 " + $wv2) } else { Bad 'WebView2 运行时缺失 —— App 会白屏/打不开（需要装 Evergreen Bootstrapper）' }

# 长路径支持（引擎写证据文件路径较深时有用）
try {
  $lp = (Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled
  if ($lp -eq 1) { Ok '长路径支持：已开启' } else { W ('     长路径支持未开启（LongPathsEnabled=' + $lp + '），一般不影响') 'DarkGray' }
} catch {}

# 安装目录是否可写（装在 Program Files 时引擎写数据会失败 → 我们要求写到 LOCALAPPDATA）
foreach ($d in @((Join-Path $env:ProgramFiles 'ShipScheduleHub'), (Join-Path $env:LOCALAPPDATA 'ShipScheduleHub'), 'D:\ShipScheduleHub', 'D:\')) {
  if (Test-Path $d) {
    $writable = $false
    try { $tf = Join-Path $d ('.w-' + (Get-Random)); [IO.File]::WriteAllText($tf, 'x'); Remove-Item $tf -Force; $writable = $true } catch {}
    W ("     目录 " + $d + " 可写=" + $writable) 'DarkGray'
  }
}

# ---------- 6. 自检 ----------
Sec '6. 自检'
$port22 = Test-SshdPort
if ($port22) { Ok '本机 22 端口在监听 ✓' } else { Bad '本机 22 端口没监听 —— sshd 没起来（把报告发我）' }

# ---------- 7. 报告 ----------
Sec '7. 请把下面这段发给我'
$summary = @()
$summary += "hostname: $hostname"
$summary += "user: $env:USERNAME"
$summary += "os: " + ($(if ($os) { $os.Caption } else { 'unknown' })) + " build " + ($(if ($os) { $os.BuildNumber } else { '?' })) + " " + $arch
$summary += "tailscale_ip: " + ($(if ($tsIp) { $tsIp } else { 'NOT-LOGGED-IN' }))
$summary += "sshd: " + ($(if ((Get-Service sshd -ErrorAction SilentlyContinue)) { 'installed' } else { 'missing' })) + " port22=" + $port22
$summary += "app: " + ($(if ($appHits.Count -gt 0) { $appHits[0] } else { 'not-found' }))
$summary += "webview2: " + ($(if ($wv2) { $wv2 } else { 'MISSING' }))
$summary += "arch: " + $arch
$summary += "report: " + $reportPath
$text = $summary -join "`r`n"
Write-Host ''
Write-Host '--------------------------------------------------------------' -ForegroundColor White
Write-Host $text -ForegroundColor White
Write-Host '--------------------------------------------------------------' -ForegroundColor White
try { Set-Clipboard -Value $text; Ok '上面这段已复制到剪贴板（直接粘贴发我即可）' } catch {}

try {
  $head = @("# ShipScheduleHub 远程调试环境报告", ("# 生成时间: " + (Get-Date)), "")
  $all = $head + $script:Report + @('', '# ===== 摘要 =====', $text)
  $all | Out-File -FilePath $reportPath -Encoding UTF8
  Ok ('完整报告已保存: ' + $reportPath)
  try { Start-Process notepad.exe $reportPath } catch {}
} catch { Warn2 ('写报告文件失败：' + $_.Exception.Message) }

Write-Host ''
W '下一步：我这边会试连 —— 你也可以现在把上面那段（或报告文件）发我。' 'Cyan'
Write-Host ''
Read-Host '按回车结束'
