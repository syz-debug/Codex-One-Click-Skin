@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\restore-dream-skin.ps1" -RestoreBaseTheme -PromptRestart
if errorlevel 1 pause
