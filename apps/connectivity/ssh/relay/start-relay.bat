@echo off
rem SSH relay for the SSH app (Windows). Double-click, or: start-relay.bat [address] [port]
rem Runs start-relay.ps1 (needs Python 3 and: py -m pip install websockify).
set ADDR=%~1
set PORT=%~2
if "%ADDR%"=="" set ADDR=0.0.0.0
if "%PORT%"=="" set PORT=8022
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-relay.ps1" -Addr %ADDR% -Port %PORT%
pause
