@echo off
pushd "%~dp0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1
start "" pythonw server.py
powershell -NoProfile -Command "for ($i=0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/index.html' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 300 }; exit 1"
if %errorlevel%==0 (
    start "" http://127.0.0.1:8080
) else (
    start "" index.html
)
popd
