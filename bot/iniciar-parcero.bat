@echo off
title Parcero Bot - UNSC Tac-Balancer V2
cd /d "%~dp0.."
set "NODE_EXE=C:\Users\ikleg\AppData\Local\OpenAI\Codex\runtimes\cua_node\bbc9141fe9f920ac\bin\node.exe"
if exist "%NODE_EXE%" (
    "%NODE_EXE%" bot\parcero-bot.js
) else (
    node bot\parcero-bot.js
)
pause
