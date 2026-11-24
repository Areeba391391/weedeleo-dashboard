$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev -- --host 0.0.0.0 --port 5173"
Write-Host "WEEDELEO starting..."
Write-Host "Dashboard: http://localhost:5173"
Write-Host "API:       http://localhost:8000/docs"
