$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvScripts = Join-Path $repoRoot ".venv\Scripts"
$linter = Join-Path $venvScripts "genvm-lint.exe"

if (-not (Test-Path $linter)) {
    throw "genvm-lint is missing. Create .venv and install requirements-dev.txt first."
}

$env:PATH = "$venvScripts;$env:PATH"
Push-Location $repoRoot
try {
    & $linter check "contracts\claim_lens.py"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & (Join-Path $venvScripts "python.exe") "scripts\sync_genvm_test_cache.py"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $linter typecheck "contracts\claim_lens.py"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & (Join-Path $venvScripts "python.exe") -m pytest "tests\direct" -v
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "Local GenLayer checks passed."
}
finally {
    Pop-Location
}
