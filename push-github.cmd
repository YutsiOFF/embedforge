@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ================= A PERSONNALISER =================
set GITHUB_USER=YutsiOFF
set REPO=embedforge
set BRANCH=main
set COMMIT_MSG=feat: bot Discord EmbedForge + constructeur d'embeds web
REM ===================================================

echo ==========================================
echo   EmbedForge - push automatique sur GitHub
echo   Depot : https://github.com/%GITHUB_USER%/%REPO%
echo ==========================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [X] Git n'est pas installe : https://git-scm.com/download/win
  goto :end
)

if not exist ".git" (
  echo [1/6] Initialisation du depot local...
  git init >nul
) else (
  echo [1/6] Depot local deja initialise.
)

if not exist ".env" (
  echo [!] Pas de fichier .env : cree-le avec "copy .env.example .env" avant "npm run deploy".
)

echo [2/6] Configuration de l'identite git...
git config user.email >nul 2>&1
if errorlevel 1 (
  git config user.email "%GITHUB_USER%@users.noreply.github.com"
  git config user.name "%GITHUB_USER%"
  echo     identite locale definie sur %GITHUB_USER%
)

echo [3/6] Ajout des fichiers...
git add -A

git diff --cached --quiet
if errorlevel 1 (
  echo [4/6] Commit...
  git commit -m "%COMMIT_MSG%" >nul
  if errorlevel 1 goto :fail
) else (
  echo [4/6] Rien de nouveau a committer.
)

echo [5/6] Branche %BRANCH% + remote origin...
git branch -M %BRANCH% >nul
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin https://github.com/%GITHUB_USER%/%REPO%.git
) else (
  git remote set-url origin https://github.com/%GITHUB_USER%/%REPO%.git
)

echo [6/6] Push vers GitHub...
git push -u origin %BRANCH%
if errorlevel 1 goto :pushfail

echo.
echo ==========================================
echo   OK : code envoye sur GitHub.
echo   Active maintenant GitHub Pages :
echo   Settings - Pages - Branch : %BRANCH% / dossier "/docs" - Save
echo   Site : https://%GITHUB_USER%.github.io/%REPO%/
echo ==========================================
goto :end

:pushfail
echo.
echo ==========================================
echo   [X] Le push a echoue.
echo   Causes les plus frequentes :
echo   1. Le depot n'existe pas encore sur GitHub
echo      -^> cree-le (vide, sans README) : https://github.com/new
echo         nom du depot : %REPO%
echo   2. Identifiants refuses
echo      -^> relance et connecte-toi dans la fenetre Git Credential Manager
echo ==========================================
goto :end

:fail
echo [X] Une etape git a echoue. Regarde le message ci-dessus.

:end
echo.
pause
endlocal
