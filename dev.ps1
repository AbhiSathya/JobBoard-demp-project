<#
    Starts the API and the web app together, on Windows.

        .\dev.ps1              start both
        .\dev.ps1 -Setup       also (re)install dependencies before starting

    Ctrl-C stops both cleanly. Everything either process prints is echoed here with a
    prefix and written to logs\dev-api.log and logs\dev-web.log. The application's own
    structured log stays where it always was: backend\logs\jobboard-<timestamp>.log.

    If PowerShell refuses to run this ("running scripts is disabled on this system"),
    start it with:  powershell -ExecutionPolicy Bypass -File .\dev.ps1
#>

[CmdletBinding()]
param(
    [switch]$Setup,
    [int]$ApiPort = 8000,
    [int]$WebPort = 5173
)

$ErrorActionPreference = 'Stop'

# $PSScriptRoot is the script's own directory, so this works from any working directory.
$Root     = $PSScriptRoot
$Backend  = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Logs     = Join-Path $Root 'logs'
$Venv     = Join-Path $Backend '.venv'
$Py       = Join-Path $Venv 'Scripts\python.exe'

function Say  { param([string]$m) Write-Host "[dev] $m" -ForegroundColor Green }
function Fail { param([string]$m) Write-Host "[dev] $m" -ForegroundColor Red; exit 1 }

# --- preflight --------------------------------------------------------------

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'node is not installed. Node 20+ is required.'
}
$nodeMajor = [int](node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 20) { Say "warning: Node $nodeMajor detected; 20+ is what this is built against." }

function Test-PortBusy {
    param([int]$Port)
    # A TCP connect attempt, so this needs no admin rights and no extra modules.
    $client = New-Object System.Net.Sockets.TcpClient
    try   { $client.Connect('127.0.0.1', $Port); return $true }
    catch { return $false }
    finally { $client.Dispose() }
}

foreach ($p in @(@{ Port = $ApiPort; Name = 'API' }, @{ Port = $WebPort; Name = 'web app' })) {
    if (Test-PortBusy -Port $p.Port) {
        # Built as a variable rather than passed inline: a here-string starting with @"
        # in argument position is ambiguous with the splat operator, and this script's
        # error paths are the last place to want a parser surprise.
        $msg = "Port $($p.Port) is already in use, so the $($p.Name) cannot start.`n" +
               "      Find it with:  netstat -ano | findstr :$($p.Port)`n" +
               "      Or use another port:  .\dev.ps1 -ApiPort 8001 -WebPort 5174"
        Fail $msg
    }
}

if ((-not (Test-Path $Py)) -or $Setup) {
    $uv = Get-Command uv -ErrorAction SilentlyContinue

    if (-not (Test-Path $Py)) {
        Say 'No virtualenv at backend\.venv - creating one.'
        if ($uv) {
            & uv venv $Venv
            if ($LASTEXITCODE -ne 0) { Fail 'Could not create the virtualenv with uv.' }
        } else {
            # Not `??` — that is PowerShell 7 only, and Windows still ships 5.1 by default.
            $sysPy = Get-Command python -ErrorAction SilentlyContinue
            if (-not $sysPy) { $sysPy = Get-Command py -ErrorAction SilentlyContinue }
            if (-not $sysPy) { Fail 'python is not installed. Python 3.11+ is required.' }
            & $sysPy.Source -m venv $Venv
            if ($LASTEXITCODE -ne 0) { Fail 'Could not create the virtualenv.' }
        }
    }

    Say 'Installing backend dependencies...'
    if ($uv) {
        # uv, when present, is both faster and the tool the README recommends for setup.
        & uv pip install --quiet --python $Py -e "$Backend[dev]"
        if ($LASTEXITCODE -ne 0) { Fail 'Backend dependency install failed.' }
    } else {
        # A venv created by `uv venv` contains no pip at all, which is how this branch
        # first failed on Linux. ensurepip puts one there rather than dead-ending.
        & $Py -m pip --version *> $null
        if ($LASTEXITCODE -ne 0) {
            & $Py -m ensurepip --upgrade *> $null
            if ($LASTEXITCODE -ne 0) {
                Fail 'This virtualenv has no pip and ensurepip could not add one. Install uv, or recreate backend\.venv with: python -m venv backend\.venv'
            }
        }
        & $Py -m pip install --quiet --upgrade pip
        & $Py -m pip install --quiet -e "$Backend[dev]"
        if ($LASTEXITCODE -ne 0) { Fail 'Backend dependency install failed.' }
    }
}

if ((-not (Test-Path (Join-Path $Frontend 'node_modules'))) -or $Setup) {
    Say 'Installing frontend dependencies...'
    Push-Location $Frontend
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { Fail 'npm install failed.' }
    } finally { Pop-Location }
}

$envFile = Join-Path $Backend '.env'
if (-not (Test-Path $envFile)) {
    Say 'No backend\.env - copying .env.example. Set JWT_SECRET before deploying anywhere.'
    Copy-Item (Join-Path $Backend '.env.example') $envFile
}

Say 'Applying database migrations...'
Push-Location $Backend
try {
    & $Py -m alembic upgrade head *> $null
    if ($LASTEXITCODE -ne 0) { Fail 'alembic upgrade head failed. Run it by hand in backend\ to see why.' }
} finally { Pop-Location }

New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$apiLog = Join-Path $Logs 'dev-api.log'
$webLog = Join-Path $Logs 'dev-web.log'
$apiErr = Join-Path $Logs 'dev-api.err.log'
$webErr = Join-Path $Logs 'dev-web.err.log'
foreach ($f in @($apiLog, $webLog, $apiErr, $webErr)) { Set-Content -Path $f -Value '' -NoNewline }

# --- run --------------------------------------------------------------------

$procs = @()

function Stop-Tree {
    param([System.Diagnostics.Process]$Proc)
    if (-not $Proc -or $Proc.HasExited) { return }
    # /T kills the whole tree: uvicorn's reloader and npm both run their real work in a
    # child process, and killing only the parent leaves that child holding the port.
    & taskkill.exe /PID $Proc.Id /T /F *> $null
}

$cleanedUp = $false
function Invoke-Cleanup {
    if ($script:cleanedUp) { return }
    $script:cleanedUp = $true
    Write-Host ''
    Say 'Stopping...'
    foreach ($p in $script:procs) { Stop-Tree -Proc $p }
    Say 'Stopped.'
}

try {
    Say "Starting API on http://localhost:$ApiPort  (docs at /docs)"
    # PYTHONUNBUFFERED matters here: Python block-buffers stdout when it is redirected
    # rather than a console, so without it the log looks empty for the first few minutes.
    $env:PYTHONUNBUFFERED = '1'
    $api = Start-Process -FilePath $Py `
        -ArgumentList '-m', 'uvicorn', 'app.main:app', '--reload', '--port', $ApiPort `
        -WorkingDirectory $Backend -NoNewWindow -PassThru `
        -RedirectStandardOutput $apiLog -RedirectStandardError $apiErr
    $procs += $api

    Say "Starting web app on http://localhost:$WebPort"
    $web = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', "npm run dev -- --port $WebPort --strictPort" `
        -WorkingDirectory $Frontend -NoNewWindow -PassThru `
        -RedirectStandardOutput $webLog -RedirectStandardError $webErr
    $procs += $web

    Say 'Both running. Ctrl-C to stop. Wrapper logs in logs\, application log in backend\logs\.'

    # Start-Process cannot stream to the console and to a file at once, so the log files
    # are the source and this loop tails them.
    #
    # Each reader holds the file open with FileShare.ReadWrite. Get-Content would be the
    # obvious choice but it reopens the file on every pass, and on Windows that
    # intermittently collides with the server still writing to it — a sharing violation
    # that shows up as randomly missing output. One long-lived handle cannot collide.
    $tails = @(
        @{ Path = $apiLog; Label = 'api'; Colour = 'Cyan' }
        @{ Path = $apiErr; Label = 'api'; Colour = 'Cyan' }
        @{ Path = $webLog; Label = 'web'; Colour = 'Magenta' }
        @{ Path = $webErr; Label = 'web'; Colour = 'Magenta' }
    )
    foreach ($t in $tails) {
        $stream = [System.IO.File]::Open(
            $t.Path, [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $t.Reader = New-Object System.IO.StreamReader($stream)
    }

    while ($true) {
        foreach ($t in $tails) {
            while ($null -ne ($line = $t.Reader.ReadLine())) {
                if ($line.Trim().Length -eq 0) { continue }
                Write-Host "[$($t.Label)] " -ForegroundColor $t.Colour -NoNewline
                Write-Host $line
            }
        }

        # If either process dies on its own, take the other down too — a half-running
        # stack is more confusing than a stopped one.
        foreach ($pair in @(@{ P = $api; N = 'API' }, @{ P = $web; N = 'web app' })) {
            if ($pair.P.HasExited) {
                Write-Host "[dev] The $($pair.N) exited. Shutting the other one down." -ForegroundColor Red
                Invoke-Cleanup
                exit 1
            }
        }

        Start-Sleep -Milliseconds 300
    }
}
finally {
    # Runs on Ctrl-C as well as on a normal exit, which is what makes the shutdown
    # graceful rather than leaving two orphaned servers holding their ports.
    if ($tails) {
        foreach ($t in $tails) { if ($t.Reader) { $t.Reader.Dispose() } }
    }
    Invoke-Cleanup
}
