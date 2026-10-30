@echo off
chcp 65001 >nul
title EmbedForge - bot Discord
cd /d "%~dp0"

echo ==================================================
echo   EmbedForge - demarrage du bot Discord
echo   Dossier : %cd%
echo ==================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Node.js n'est pas installe ou pas dans le PATH.
    echo Installe-le depuis https://nodejs.org ^(version LTS^), puis relance ce fichier.
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [ERREUR] Le fichier .env est absent.
    echo Copie .env.example en .env, puis mets ton token dans DISCORD_TOKEN=...
    echo.
    pause
    exit /b 1
)

findstr /b /c:"DISCORD_TOKEN=" ".env" >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] La ligne DISCORD_TOKEN=... est introuvable dans .env
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\discord.js" (
    echo [1/2] Installation des dependances ^(npm install^)...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERREUR] npm install a echoue. Verifie ta connexion internet.
        echo.
        pause
        exit /b 1
    )
    echo.
)

echo [2/2] Connexion a Discord...
echo      Laisse cette fenetre ouverte : si elle se ferme, le bot passe hors ligne.
echo      Ctrl+C pour arreter proprement.
echo.

:boucle
for /f "tokens=1-2 delims= " %%a in ("%date% %time%") do set "HORODATAGE=%%a %%b"
echo [%HORODATAGE%] Demarrage du bot...
node src/index.js
set "CODE=%errorlevel%"
echo.
echo [%HORODATAGE%] Le bot s'est arrete ^(code %CODE%^).
echo               Redemarrage automatique dans 5 secondes... ^(Ctrl+C pour quitter^)
timeout /t 5 /nobreak >nul
echo.
goto boucle
