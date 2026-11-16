@echo off
chcp 936 >nul
rem ====================================================================
rem  weka launcher — double click to open http://127.0.0.1:7080
rem  options:  --no-browser    start server only
rem            --foreground    run in this window (Ctrl+C to stop)
rem ====================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PORT=7080"
set "URL=http://127.0.0.1:%PORT%"
set "LOGDIR=%~dp0logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1

rem ---------- find Node.js ----------
set "NODE="
for /f "delims=" %%i in ('where node.exe 2^>nul') do if not defined NODE set "NODE=%%i"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "D:\Program Files\nodejs\node.exe" set "NODE=D:\Program Files\nodejs\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE goto no_node

rem ---------- already running? ----------
call :is_up
if not errorlevel 1 (
  echo [weka] 服务已在运行: %URL%
  goto open
)

rem ---------- foreground mode ----------
if /i "%~1"=="--foreground" (
  echo [weka] 前台模式，关闭本窗口即停止服务
  "%NODE%" src\cli.mjs serve --port %PORT%
  goto end
)

rem ---------- start hidden ----------
echo [weka] 正在启动本地服务...
cscript.exe //nologo "%~dp0launcher.vbs" "%NODE%" "%PORT%" >nul 2>&1
if errorlevel 1 (
  echo [weka] 隐藏启动失败，改用最小化窗口启动
  start "weka-server" /min "%NODE%" src\cli.mjs serve --port %PORT%
)

rem ---------- wait until ready (max ~30s) ----------
set /a tries=0
:wait
ping -n 2 127.0.0.1 >nul 2>&1
call :is_up
if not errorlevel 1 goto open
set /a tries+=1
if !tries! lss 20 goto wait

echo.
echo [weka] 启动失败: 40 秒内服务没有就绪
echo 排查建议:
echo   1) Node.js 是否已安装:  https://nodejs.org/
echo   2) 端口 %PORT% 是否被占用
echo   3) 账号密钥是否已导入:  "%NODE%" src\cli.mjs import-weflow
echo   4) 前台运行看日志:      "%~f0" --foreground
echo.
pause
exit /b 1

:open
if /i "%~1"=="--no-browser" goto end
echo [weka] 正在打开 %URL%
start "" "%URL%"
:end
endlocal
exit /b 0

rem ---------- health check ----------
:is_up
curl.exe -s -m 2 -o nul "%URL%/api/meta" >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:no_node
echo.
echo [weka] 没有找到 Node.js
echo 请先安装 Node.js 22.5 或更高版本: https://nodejs.org/
echo 安装完成后重新双击本程序即可。
echo.
pause
exit /b 1