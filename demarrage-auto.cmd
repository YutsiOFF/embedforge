@echo off
chcp 65001 >nul
title EmbedForge - demarrage automatique Windows
cd /d "%~dp0"

set "CIBLE=%cd%\start-bot.cmd"
set "LIEN=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\EmbedForge Bot.lnk"

if /i "%~1"=="/off" goto retirer

if not exist "%CIBLE%" (
    echo [ERREUR] start-bot.cmd est introuvable a cote de ce fichier.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%LIEN%');" ^
  "$s.TargetPath = '%CIBLE%';" ^
  "$s.WorkingDirectory = '%cd%';" ^
  "$s.WindowStyle = 7;" ^
  "$s.Description = 'Bot Discord EmbedForge';" ^
  "$s.Save()"

if errorlevel 1 (
    echo [ERREUR] Impossible de creer le raccourci.
    pause
    exit /b 1
)

echo ==================================================
echo   [OK] Demarrage automatique active
echo ==================================================
echo Le bot se lancera tout seul (fenetre reduite) a chaque
echo ouverture de session Windows.
echo Raccourci cree : %LIEN%
echo.
echo Pour desactiver : demarrage-auto.cmd /off
echo.
pause
exit /b 0

:retirer
if exist "%LIEN%" (
    del "%LIEN%"
    echo [OK] Demarrage automatique desactive.
) else (
    echo Aucun demarrage automatique n'etait configure.
)
echo.
pause
exit /b 0
