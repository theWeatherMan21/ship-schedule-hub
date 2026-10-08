#!/usr/bin/env python3
"""把 tools/win/setup-remote-access.ps1 打包成单文件 .bat（自提权 + base64 内嵌 PowerShell）

为什么用 base64：.bat 里嵌长 PS 代码要转义一堆 ( ) % > | & ^ <，极易踩坑。
base64 只含 [A-Za-z0-9+/=]，对 cmd 的 echo 完全安全，零转义、零编码问题。
关键：不能把十几 KB 的 base64 拼成一条命令（cmd 单条命令行上限 8191 字符），
      必须逐行 `echo` 追加到临时文件。
"""
import base64, hashlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
PS = ROOT / 'tools/win/setup-remote-access.ps1'
OUT = ROOT / 'tools/win/一键配置调试环境.bat'
OUT_ASCII = ROOT / 'tools/win/setup-remote-access.bat'

ps_text = PS.read_text(encoding='utf-8')
b64 = base64.b64encode(ps_text.encode('utf-16-le')).decode('ascii')
sha = hashlib.sha256(ps_text.encode('utf-8')).hexdigest()[:16]
CH = 3500
lines = [b64[i:i + CH] for i in range(0, len(b64), CH)]

echo_block = '\r\n'.join(
    ('> "%B64FILE%" echo ' if i == 0 else '>> "%B64FILE%" echo ') + chunk
    for i, chunk in enumerate(lines)
)

bat = f'''@echo off
rem ============================================================================
rem  ShipScheduleHub ・ Windows 远程调试环境一键配置（婉宜 10-08）
rem  双击运行；会自动申请管理员权限。做四件事：
rem    1) 环境体检  2) Tailscale（装/登录/报 IP）  3) OpenSSH Server（装/自启/防火墙/公钥）
rem    4) 自检 + 桌面报告 + 关键信息复制到剪贴板
rem  源码与校验：tools/win/setup-remote-access.ps1（sha256 前16位 {sha}）
rem ============================================================================
chcp 65001 >nul
setlocal EnableDelayedExpansion
title ShipScheduleHub 远程调试环境配置

fltmc >nul 2>&1
if errorlevel 1 (
  echo 需要管理员权限，正在申请（会弹一个 UAC 确认框）...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "B64FILE=%TEMP%\\ssh-setup-b64.txt"
set "PS1=%TEMP%\\setup-remote-access.ps1"
del "%B64FILE%" >nul 2>&1
{echo_block}

if not exist "%B64FILE%" (
  echo [NG] 写临时文件失败：%B64FILE%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$b=[IO.File]::ReadAllText('%B64FILE%'); $s=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($b.Trim())); [IO.File]::WriteAllText('%PS1%', $s, (New-Object Text.UTF8Encoding $false)); Write-Host '[OK] 脚本已解出，开始执行' -ForegroundColor Green"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%ERRORLEVEL%"
del "%B64FILE%" >nul 2>&1

if not "%RC%"=="0" (
  echo.
  echo [NG] 脚本退出码 %RC% —— 请把上面的输出或桌面报告发给我
  pause
)
exit /b %RC%
'''

for target in (OUT, OUT_ASCII):
    target.write_text(bat, encoding='utf-8')
print(f"PS 源码 {len(ps_text)} 字节  sha256:{sha}")
print(f"base64 {len(b64)} 字符，分 {len(lines)} 行 echo 写入（每行 ≤{CH}）")
print(f"生成: {OUT}")
print(f"生成: {OUT_ASCII}")
print(f"bat 体积: {len(bat.encode('utf-8'))} 字节")
