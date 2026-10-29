@echo off
rem UZ-Carbon MRV - mahalliy ishga tushirish (namoyish uchun).
rem Ikki marta bosing: server ishga tushadi va brauzer ochiladi.
rem Internet kerak emas. To'xtatish uchun shu oynani yoping.

cd /d "%~dp0"
set PORT=3000
set MFA_ENFORCE=0

where node >nul 2>nul
if errorlevel 1 (
  echo XATO: Node.js topilmadi. https://nodejs.org dan 24-versiyani o'rnating.
  pause
  exit /b 1
)

echo UZ-Carbon MRV ishga tushmoqda...
start "" http://localhost:3000
npm start

echo.
echo Server to'xtadi. Yuqoridagi xabarni o'qing.
pause
