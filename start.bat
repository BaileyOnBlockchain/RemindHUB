@echo off
title RemindHUB
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  npm install
)
echo.
echo  Starting RemindHUB...
node server.js
