@echo off
title OpenBridge Telemetry Dashboard
echo ====================================================
echo      OPENBRIDGE TELEMETRY DASHBOARD (LIVE MONITOR)
echo ====================================================

netstat -ano | findstr :4098 >nul
if %errorlevel% neq 0 (
    echo Iniciando servicio de telemetria en segundo plano...
    start /b node "C:\Users\MGSCO\.gemini\antigravity\scratch\openbridge\src\standalone-dashboard.js"
    timeout /t 2 /nobreak >nul
)

echo Abriendo http://localhost:4098 en tu navegador predeterminado...
start http://localhost:4098
exit
