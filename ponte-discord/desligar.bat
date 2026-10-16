@echo off
cd /d "%~dp0"
docker compose down
echo A ponte foi desligada. Para ligar de novo, abra "ligar.bat".
pause
