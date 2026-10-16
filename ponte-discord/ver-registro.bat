@echo off
cd /d "%~dp0"
echo Mostrando o registro da ponte (feche esta janela para sair; a ponte continua ligada).
docker compose logs -f --tail 100
pause
