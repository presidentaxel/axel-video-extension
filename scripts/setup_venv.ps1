param(
  [string]$VenvPath = ".venv"
)

python -m venv $VenvPath
& "$VenvPath\Scripts\python.exe" -m pip install --upgrade pip
& "$VenvPath\Scripts\python.exe" -m pip install -r requirements-test.txt

Write-Host "Virtual environment ready at $VenvPath"
