@echo off
rem 작업 시작: 사이트를 골라 최신본을 받고 VS Code 로 엽니다 (tools\start-work.ps1)
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-work.ps1"
pause
