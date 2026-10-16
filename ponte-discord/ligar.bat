@echo off
cd /d "%~dp0"
echo Ligando a ponte do Discord (na primeira vez demora alguns minutos)...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Deu erro. O Docker Desktop esta aberto? Veja o LEIA-ME, secao Problemas comuns.
) else (
  echo.
  echo Pronto! A ponte esta ligada e volta sozinha quando o Docker Desktop abrir.
  echo Para ver o que ela esta fazendo, abra "ver-registro.bat".
)
pause
