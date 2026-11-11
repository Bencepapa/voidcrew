@echo off
rem Starts the game: a small local server (Windows PowerShell) and your browser.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
