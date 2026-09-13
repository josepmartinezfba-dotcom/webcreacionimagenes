@echo off
setlocal

if not exist "node_modules" (
    echo No se encontraron dependencias instaladas.
    echo Ejecuta primero setup.bat
    pause
    exit /b 1
)

if not exist ".next" (
    echo Compilando la aplicacion por primera vez, un momento...
    call npm run build
)

echo ============================================
echo  Iniciando la aplicacion web en http://localhost:3000
echo  Asegurate de que ComfyUI esta en marcha
echo  (start-comfyui.bat) antes de generar imagenes.
echo ============================================
call npm run start
pause
