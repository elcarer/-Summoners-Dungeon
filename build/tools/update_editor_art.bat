@echo off
chcp 65001 >nul
rem ================================================================
rem  Collect tile sprites for the city editor (cityEditor.html).
rem  Run AFTER redrawing tiles in build/images (walls, floor, terrain,
rem  buildings): rebuilds the base64 art snapshot
rem  build/tools/cityEditorAssets.js, so the editor opened by double
rem  click (file://) shows the new tiles. The game itself reads art
rem  files directly and does not need this script.
rem  (ASCII-only on purpose: Cyrillic text in .bat breaks cmd parsing.)
rem ================================================================
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH. Install Node and retry.
    pause
    exit /b 1
)
node cityEditorAssets.gen.mjs
if errorlevel 1 (
    echo.
    echo [ERROR] Snapshot was not built - see message above.
    pause
    exit /b 1
)
echo.
echo OK. Reopen cityEditor.html to see the new tiles.
pause
