@echo off
chcp 65001 >nul
title Day Du An Trieu Trai Tim Len GitHub
powershell -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1"
echo.
pause
