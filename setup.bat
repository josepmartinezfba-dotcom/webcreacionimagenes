@echo off
setlocal

echo ============================================
echo  Instalacion de la app: Expansor de fondos
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] No se encontro Node.js en el PATH.
    echo Instala Node.js LTS desde https://nodejs.org/ y vuelve a ejecutar este script.
    pause
    exit /b 1
)

echo Node.js detectado:
node -v
echo.

echo Instalando dependencias de la aplicacion (npm install)...
call npm install
if errorlevel 1 (
    echo [ERROR] Fallo la instalacion de dependencias.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Instalacion completada.
echo.
echo  Siguientes pasos:
echo   1. Instala ComfyUI y el modelo FLUX.1-Fill-dev
echo      (lee README.md, seccion "Instalacion de ComfyUI").
echo   2. Ejecuta start-comfyui.bat para arrancar ComfyUI.
echo   3. Ejecuta start-app.bat para arrancar esta aplicacion.
echo ============================================
pause
