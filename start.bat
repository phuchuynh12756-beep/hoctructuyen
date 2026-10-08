@echo off
cd /d "%~dp0"

if not exist node_modules\express (
  echo Dang cai thu vien lan dau...
  call npm install
  if errorlevel 1 (
    echo.
    echo [LOI] npm install that bai.
    pause
    exit /b 1
  )
)

if not exist .env (
  echo GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE> .env
  echo.
  echo [CAN CAU HINH] Da tao file .env
  echo Mo file .env bang Notepad va thay YOUR_GEMINI_API_KEY_HERE bang API key Gemini cua ban.
  echo Sau do chay lai start.bat.
  echo.
  pause
  exit /b 0
)

findstr /B /C:"GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE" .env >nul 2>&1
if not errorlevel 1 (
  echo.
  echo [CAN CAU HINH] Chua co Gemini API key.
  echo Mo file .env va thay YOUR_GEMINI_API_KEY_HERE bang API key Gemini cua ban.
  echo Sau do chay lai start.bat.
  echo.
  pause
  exit /b 0
)

echo.
echo ================================================
echo   LOP HOC TRUC TUYEN - GEMINI 2.5 FLASH
echo ================================================
echo Server: http://localhost:3000
echo AI:     gemini-2.5-flash
echo Khong mo file index.html truc tiep bang File://
echo ================================================
echo.
start "" http://localhost:3000
node --env-file=.env server.js
pause
