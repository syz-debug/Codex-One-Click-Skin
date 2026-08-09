@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\theme-picker.ps1"
if errorlevel 1 pause
