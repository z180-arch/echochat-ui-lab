@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri http://127.0.0.1:8080/ -UseBasicParsing -TimeoutSec 2 | Out-Null } catch { Start-Process python -ArgumentList '-m','http.server','8080' -WindowStyle Minimized; Start-Sleep -Seconds 1 }"
start "" "http://127.0.0.1:8080/"
