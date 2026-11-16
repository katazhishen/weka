@echo off
chcp 936 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "PORT=7080"
echo [weka] 正在停止 127.0.0.1:%PORT% 上的服务...
set KILLED=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":%PORT%" ^| findstr /i "LISTENING"') do (
  taskkill /PID %%p /F >nul 2>&1
  if not errorlevel 1 (
    echo   - 已结束进程 PID %%p
    set KILLED=1
  )
)
if "!KILLED!"=="0" echo   - 没有正在运行的服务
echo.
ping -n 3 127.0.0.1 >nul