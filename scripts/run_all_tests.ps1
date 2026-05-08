param(
  [string]$VenvPath = ".venv"
)

if (-not (Test-Path "$VenvPath\Scripts\python.exe")) {
  Write-Host "Venv not found. Creating it..."
  & ".\scripts\setup_venv.ps1" -VenvPath $VenvPath
}

Write-Host "Running JavaScript tests..."
npm run test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running Python tests..."
& "$VenvPath\Scripts\python.exe" -m pytest tests/python -q
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "All tests passed."
