@echo off
setlocal

REM Ajusta esta ruta si instalaste ComfyUI en otra carpeta.
set COMFYUI_DIR=%~dp0..\ComfyUI

if not exist "%COMFYUI_DIR%\main.py" (
    echo [ERROR] No se encontro ComfyUI en: %COMFYUI_DIR%
    echo.
    echo Edita este archivo ^(start-comfyui.bat^) y cambia la variable
    echo COMFYUI_DIR para que apunte a la carpeta donde instalaste ComfyUI,
    echo o mueve la carpeta ComfyUI junto a esta aplicacion.
    pause
    exit /b 1
)

echo ============================================
echo  Iniciando ComfyUI en http://127.0.0.1:8188
echo ============================================
cd /d "%COMFYUI_DIR%"

if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
)

python main.py --listen 127.0.0.1 --port 8188
pause
