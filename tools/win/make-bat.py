#!/usr/bin/env python3
r"""把 tools/win/setup-remote-access.ps1 打包成单文件 .bat（v3）

历史坑（都真实踩过，别再犯）：
  ① v1 用 `fltmc` 判管理员 —— 真机 PATH 不全时报「不是内部或外部命令」→ 误判没权限 → 无限提权弹窗。
  ② v2 生成器用**普通字符串**写模板，`\WindowsPowerShell\v1.0` 里的 `\v` 被 Python 当成垂直制表符(\x0b)，
     `\net.exe` 里的 `\n` 被当成换行 → 生成的 bat 里路径全坏、命令整行消失（真机报「不是内部或外部命令」的另一个来源）。
     ⇒ 本文件改用 **raw f-string**（rf'''）：反斜杠单写即字面量，不做任何转义。
  ③ 真机 PATH 连 System32 都不全 ⇒ 所有外部命令走绝对路径（%SYS32%、%PSEXE%）。

base64 说明：只含 [A-Za-z0-9+/=]，对 cmd 的 echo 完全安全；十几 KB 不能拼成一条命令
（cmd 单行上限 8191），必须逐行 echo 追加。
"""
import base64, hashlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
PS = ROOT / 'tools/win/setup-remote-access.ps1'
OUT = ROOT / 'tools/win/一键配置调试环境.bat'
OUT_ASCII = ROOT / 'tools/win/setup-remote-access.bat'

ps_text = PS.read_text(encoding='utf-8-sig')
b64 = base64.b64encode(ps_text.encode('utf-16-le')).decode('ascii')
# 解码端用 UTF8Encoding $true 写 BOM：PS 5.1 无 BOM 会按 GBK 读 → 中文把语法读崩（真机踩过）
sha = hashlib.sha256(ps_text.encode('utf-8')).hexdigest()[:16]
CH = 3500
lines = [b64[i:i + CH] for i in range(0, len(b64), CH)]
echo_block = '\r\n'.join(
    ('>> "%B64FILE%" echo ' if i else '> "%B64FILE%" echo ') + c for i, c in enumerate(lines)
)

# ★ raw f-string：反斜杠单写即为字面量（这是 v2 出事故的地方）
bat = rf'''@echo off
rem ============================================================================
rem  ShipScheduleHub ・ Windows 远程调试环境配置（婉宜 10-08 ・ v3）
rem  双击即可；会申请一次管理员权限（UAC 点是），随后自动完成：
rem    Tailscale 检查/登录 - 装 OpenSSH Server - 装调试公钥 - 防火墙(仅 Tailscale 网段) - 体检报告
rem  源码校验：setup-remote-access.ps1  sha256 前16位 {sha}
rem  v3 修复：① 管理员判定不再依赖 fltmc（PATH 不全时误判会导致死循环弹窗）
rem            ② 所有外部命令走绝对路径 ③ 全量日志落盘，窗口一闪也有证据
rem ============================================================================
chcp 65001 >nul
setlocal EnableExtensions
title ShipScheduleHub 远程调试环境配置

set "SYS32=%SystemRoot%\System32"
set "PSEXE=%SYS32%\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PSEXE%" set "PSEXE=powershell.exe"
set "WORK=%TEMP%\ssh-setup"
if not exist "%WORK%" mkdir "%WORK%" >nul 2>&1
set "LOG=%WORK%\setup-log.txt"
call :log "==== 启动 %DATE% %TIME% 参数=[%*] ===="
call :log "SYS32=%SYS32% PSEXE=%PSEXE% TEMP=%TEMP% USER=%USERNAME%"

set "PS1="
if exist "%~dp0setup-remote-access.ps1" set "PS1=%~dp0setup-remote-access.ps1"

if /i "%~1"=="--elevated" (
  call :log "[i] 进入主体（已带 --elevated，不再提权）"
  goto :body
)

call :log "[i] 探测管理员权限..."
set "ISADMIN="
"%SYS32%\net.exe" session >nul 2>&1 && set "ISADMIN=1" && call :log "[i] net session 判定=管理员"
if not defined ISADMIN (
  "%PSEXE%" -NoProfile -Command "if((New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){{exit 0}}else{{exit 1}}" >nul 2>&1 && set "ISADMIN=1" && call :log "[i] PowerShell 角色判定=管理员"
)
if not defined ISADMIN (
  "%SYS32%\reg.exe" add "HKU\Software\Microsoft\Windows\CurrentVersion\SSHSetupProbe" /f >nul 2>&1 && set "ISADMIN=1" && "%SYS32%\reg.exe" delete "HKU\Software\Microsoft\Windows\CurrentVersion\SSHSetupProbe" /f >nul 2>&1 && call :log "[i] reg 写测试判定=管理员"
)
if defined ISADMIN goto :body

call :log "[i] 当前非管理员，准备提权一次"
echo 需要管理员权限 - 稍后会弹 UAC 确认框，请点「是」。
echo 脚本只申请这一次；若点「否」，它会停下并告诉你怎么手动跑，不会再反复弹窗。
set "SELFBAT=%~f0"
echo %SELFBAT% | "%SYS32%\findstr.exe" /b "\\\\" >nul
if not errorlevel 1 (
  call :log "[i] 从网络路径启动，先拷到本地再提权"
  copy /y "%~f0" "%WORK%\run.bat" >nul 2>&1
  if defined PS1 copy /y "%PS1%" "%WORK%\setup-remote-access.ps1" >nul 2>&1
  set "PS1=%WORK%\setup-remote-access.ps1"
  set "SELFBAT=%WORK%\run.bat"
)
"%PSEXE%" -NoProfile -Command "Start-Process -FilePath '%SELFBAT%' -ArgumentList '--elevated' -Verb RunAs" 1>>"%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo [NG] 提权失败（UAC 被拒绝，或 PowerShell 不可用）。两个办法任选：
  echo      1) 右键这个 .bat，选「以管理员身份运行」
  echo      2) 手动开「Windows PowerShell (管理员)」，粘贴执行：
  echo         "%PSEXE%" -ExecutionPolicy Bypass -File "%PS1%"
  echo.
  echo      日志：%LOG%
  pause
)
exit /b 0

:body
if not defined PS1 (
  set "PS1=%TEMP%\setup-remote-access.ps1"
  set "B64FILE=%WORK%\b64.txt"
  del "%B64FILE%" >nul 2>&1
  call :log "[i] 解出内嵌脚本到 %PS1%"
{echo_block}
  "%PSEXE%" -NoProfile -ExecutionPolicy Bypass -Command "$b=[IO.File]::ReadAllText('%B64FILE%'); $s=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($b.Trim())); [IO.File]::WriteAllText('%PS1%', $s, (New-Object Text.UTF8Encoding $false))" 1>>"%LOG%" 2>&1
  del "%B64FILE%" >nul 2>&1
)
if not exist "%PS1%" (
  echo [NG] 找不到脚本：%PS1%
  echo      请把 setup-remote-access.ps1 和本 .bat 放在同一文件夹再试。
  echo      日志：%LOG%
  pause
  exit /b 1
)

call :log "[i] 开始执行 %PS1%"
set "TRANS=%WORK%\transcript.txt"
rem transcript 抓「所有」输出：解析错误发生在脚本第一行之前，普通日志抓不到（真机踩过）
"%PSEXE%" -NoProfile -ExecutionPolicy Bypass -NoLogo -Command "Start-Transcript -Path '%TRANS%' -Append -Force | Out-Null; & '%PS1%' -LogPath '%LOG%'; $rc=$LASTEXITCODE; Stop-Transcript | Out-Null; exit $rc"
set "RC=%ERRORLEVEL%"
call :log "[i] 退出码 %RC%"
if not "%RC%"=="0" (
  echo.
  echo [NG] 脚本退出码 %RC% - 完整日志：%LOG%
  echo      把这个日志（或桌面上的报告 txt）发给婉宜即可。
  pause
)
exit /b %RC%

:log
>>"%LOG%" echo %~1
exit /b 0
'''

bat = bat.replace('\r\n', '\n').replace('\n', '\r\n')   # 统一 CRLF
for target in (OUT, OUT_ASCII):
    with open(target, 'w', encoding='utf-8', newline='') as fh:
        fh.write(bat)

# ---- 生成即自检（v2 的事故就是没自检）----
bad_ctrl = {hex(ord(c)): bat.count(c) for c in set(bat) if ord(c) < 32 and c not in '\r\n'}
must = ['%SYS32%\\net.exe', '%SYS32%\\reg.exe', '%SYS32%\\findstr.exe',
        '%SYS32%\\WindowsPowerShell\\v1.0\\powershell.exe', 'if /i "%~1"=="--elevated"']
missing = [m for m in must if m not in bat]
print(f"PS 源码 {len(ps_text)} 字节  sha256:{sha}")
print(f"base64 {len(b64)} 字符 / {len(lines)} 行（每行 ≤{CH}）")
print(f"生成: {OUT.name} · {OUT_ASCII.name} · {len(bat.encode('utf-8'))} 字节 · 最长行 {max(len(l) for l in bat.splitlines())}")
print("控制字符自检:", bad_ctrl if bad_ctrl else "干净 ✅（只有 CR/LF）")
print("关键路径自检:", "全部就位 ✅" if not missing else f"缺失 ❌ {missing}")
if bad_ctrl or missing:
    raise SystemExit("生成结果不可用，已中止（请修生成器，别把坏 bat 发出去）")
