#!/usr/bin/env pwsh
# Run the FastAPI backend and the Next.js frontend together for local development.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Write-Host 'error: node_modules not found. Run: bun install' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $root 'backend/.venv/Scripts/uvicorn.exe'))) {
    Write-Host 'error: backend virtualenv not found. Run: (cd backend && uv sync --extra dev)' -ForegroundColor Red
    exit 1
}

Write-Host 'backend  -> http://localhost:8000'
Write-Host 'frontend -> http://localhost:3000'

$backend = Start-Process -FilePath 'uv' `
    -ArgumentList 'run', 'uvicorn', 'app.main:app', '--reload', '--port', '8000' `
    -WorkingDirectory (Join-Path $root 'backend') -NoNewWindow -PassThru

$frontend = Start-Process -FilePath 'bun' `
    -ArgumentList 'run', 'dev' `
    -WorkingDirectory $root -NoNewWindow -PassThru

try {
    while (-not $backend.HasExited -and -not $frontend.HasExited) {
        Start-Sleep -Milliseconds 500
    }
    $exitCode = if ($backend.HasExited) { $backend.ExitCode } else { $frontend.ExitCode }
} finally {
    foreach ($p in @($backend, $frontend)) {
        if (-not $p.HasExited) {
            taskkill /PID $p.Id /T /F | Out-Null
        }
    }
}
exit $exitCode
