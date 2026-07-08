<#
.SYNOPSIS
  CREA3 platform preflight check (Windows / PowerShell).

.DESCRIPTION
  Runs the full local test/build suite for backend and frontend and prints a
  colour-coded report. Exit code 0 = all green, non-zero = a check failed.

  This is the PowerShell equivalent of preflight.sh (which requires Git Bash or
  WSL). Run it from a normal PowerShell prompt:

      .\preflight.ps1
      .\preflight.ps1 -Quick      # skip the (slower) frontend production build
      .\preflight.ps1 -NoColor    # plain output (for CI logs)

  If you get an execution-policy error, run once:
      powershell -ExecutionPolicy Bypass -File .\preflight.ps1
#>
[CmdletBinding()]
param(
  [switch]$Quick,
  [switch]$NoColor
)

$ErrorActionPreference = "Continue"
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir  = Join-Path $ScriptDir "backend"
$FrontendDir = Join-Path $ScriptDir "frontend"

# Pick a python launcher that exists on this machine
$PY = $null
foreach ($cand in @("python", "py", "python3")) {
  if (Get-Command $cand -ErrorAction SilentlyContinue) { $PY = $cand; break }
}

$script:Pass = 0
$script:Fail = 0
$script:Skip = 0
$script:Failed = @()

function Write-C([string]$Text, [string]$Color = "Gray", [switch]$NoNewline) {
  if ($NoColor) {
    if ($NoNewline) { Write-Host $Text -NoNewline } else { Write-Host $Text }
  } else {
    if ($NoNewline) { Write-Host $Text -ForegroundColor $Color -NoNewline }
    else { Write-Host $Text -ForegroundColor $Color }
  }
}

function Section([string]$Title) {
  Write-Host ""
  Write-C ("> " + $Title) "Cyan"
}

function Run-Step {
  param([string]$Label, [scriptblock]$Action)
  Write-C ("  - " + $Label.PadRight(46)) "Gray" -NoNewline
  try {
    $out = & $Action 2>&1
    if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) { throw ($out | Out-String) }
    Write-C "PASS" "Green"
    $script:Pass++
  } catch {
    Write-C "FAIL" "Red"
    $script:Fail++
    $script:Failed += $Label
    $msg = ($_ | Out-String)
    $tail = ($msg -split "`n" | Select-Object -Last 8) -join "`n"
    if ($tail.Trim()) { Write-C ($tail.TrimEnd()) "DarkGray" }
  }
}

function Skip-Step([string]$Label) {
  Write-C ("  - " + $Label.PadRight(46)) "Gray" -NoNewline
  Write-C "skipped" "Yellow"
  $script:Skip++
}

# ----------------------------------------------------------------------------
# Banner - framed card. Pure ASCII only: PowerShell reads .ps1 as ANSI by
# default, so any byte > 127 (Unicode box/block glyphs) corrupts the file and
# breaks parsing. ASCII renders identically in every Windows console.
# ----------------------------------------------------------------------------
function Write-Banner {
  $azure = "Cyan"; $blue = "Blue"; $gold = "Yellow"; $frame = "DarkGray"
  $INNER = 58
  $bar   = "-" * $INNER

  Write-C ("+" + $bar + "+") $frame
  Write-C ("|" + (" " * $INNER) + "|") $frame

  # "CREA" block letters in azure, the "3" in gold.
  $cre = @(
    "  ####   ####   ####   ###  ",
    " ##     ##  ##  ##     ## ## ",
    " ##     #####   ###    ##### ",
    " ##     ## ##   ##     ## ## ",
    "  ####  ##  ##  ####   ## ## "
  )
  $three = @(" #####", "    ##", "  ### ", "    ##", " #####")
  for ($i = 0; $i -lt $cre.Count; $i++) {
    Write-C ("|   ") $frame -NoNewline
    Write-C $cre[$i] $azure -NoNewline
    Write-C $three[$i] $gold -NoNewline
    $used = 3 + $cre[$i].Length + $three[$i].Length
    Write-C ((" " * ($INNER - $used)) + "|") $frame
  }

  Write-C ("|" + (" " * $INNER) + "|") $frame
  $sub = "Conflict Resolution with Equitative Algorithms"
  Write-C ("|   ") $frame -NoNewline
  Write-C $sub "Gray" -NoNewline
  Write-C ((" " * ($INNER - 3 - $sub.Length)) + "|") $frame
  Write-C ("|" + (" " * $INNER) + "|") $frame
  Write-C ("+" + $bar + "+") $frame

  Write-C ("  Platform preflight check  -  " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")) "DarkGray"
}

Write-Banner

# ----------------------------------------------------------------------------
# Environment
# ----------------------------------------------------------------------------
Section "Environment"
Run-Step "Python available" { if (-not $PY) { throw "python not found" }; & $PY --version }
Run-Step "Node.js available" { node --version }
Run-Step "npm available"     { npm --version }

# ----------------------------------------------------------------------------
# Backend
# ----------------------------------------------------------------------------
Section "Backend (FastAPI)"
if (Test-Path $BackendDir) {
  Push-Location $BackendDir

  Run-Step "Python files compile" {
    $files = Get-ChildItem -Recurse -Filter *.py app | ForEach-Object { $_.FullName }
    & $PY -m py_compile @files
  }

  Run-Step "App imports cleanly" {
    $env:DATABASE_URL = "sqlite:///" + ((Join-Path $env:TEMP "crea_preflight_import.db") -replace '\\','/')
    & $PY -c "import app.main"
  }

  Run-Step "Engine + scheduler tests (pytest)" {
    & $PY -m pytest tests/ -q
  }

  Run-Step "Server boots & health OK" {
    $env:DATABASE_URL = "sqlite:///" + ((Join-Path $env:TEMP "crea_preflight_boot.db") -replace '\\','/')
    $proc = Start-Process -PassThru -WindowStyle Hidden $PY `
      -ArgumentList "-m","uvicorn","app.main:app","--port","8077"
    try {
      $ok = $false
      for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 700
        try {
          $r = Invoke-WebRequest "http://127.0.0.1:8077/health" -UseBasicParsing -TimeoutSec 3
          if ($r.StatusCode -eq 200) { $ok = $true; break }
        } catch {}
      }
      if (-not $ok) { throw "health check did not pass" }
      # protected route should be 401, not 404
      $code = 0
      try { Invoke-WebRequest "http://127.0.0.1:8077/api/invitations" -UseBasicParsing -TimeoutSec 3 | Out-Null }
      catch { $code = $_.Exception.Response.StatusCode.value__ }
      if ($code -ne 401) { throw "expected 401 from /api/invitations, got $code" }
    } finally {
      if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    }
  }

  Run-Step "No leaked App Password" {
    $hits = Select-String -Path (Get-ChildItem -Recurse -File app).FullName -Pattern "wxdiifryzplxwyns" -SimpleMatch -ErrorAction SilentlyContinue
    if ($hits) { throw "leaked secret found" }
  }

  Pop-Location
} else {
  Skip-Step "Backend directory not found"
}

# ----------------------------------------------------------------------------
# Frontend
# ----------------------------------------------------------------------------
Section "Frontend (React + Vite)"
if (Test-Path $FrontendDir) {
  Push-Location $FrontendDir

  if (-not (Test-Path "node_modules")) {
    Run-Step "Install dependencies (npm)" { npm install --no-audit --no-fund --loglevel=error }
  } else {
    Write-C ("  - " + "Dependencies present".PadRight(46)) "Gray" -NoNewline
    Write-C "up to date" "Green"
  }

  Run-Step "Type-check (tsc --noEmit)" { npx tsc --noEmit }

  if ($Quick) { Skip-Step "Production build (-Quick)" }
  else { Run-Step "Production build (vite)" { npm run build } }

  Pop-Location
} else {
  Skip-Step "Frontend directory not found"
}

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
Write-Host ""
Write-C "----------------------------------------------" "DarkGray"
Write-C ("  {0} passed   " -f $script:Pass) "Green" -NoNewline
Write-C ("{0} failed   " -f $script:Fail) ($(if ($script:Fail -gt 0) { "Red" } else { "Gray" })) -NoNewline
Write-C ("{0} skipped" -f $script:Skip) "Yellow"

if ($script:Fail -eq 0) {
  Write-Host ""
  Write-C "  PREFLIGHT PASSED - the platform is ready." "Green"
  Write-Host ""
  exit 0
} else {
  Write-Host ""
  Write-C ("  PREFLIGHT FAILED - {0} check(s) need attention:" -f $script:Fail) "Red"
  foreach ($s in $script:Failed) { Write-C ("      - " + $s) "Red" }
  Write-Host ""
  exit 1
}
