@echo off
echo Fermeture de tous les process Node.js...
taskkill /IM node.exe /F 2>nul
echo Ports 3000, 3001, 3002 liberes.
pause
