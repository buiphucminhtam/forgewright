# ============================================================================
# Production Grade Plugin — Setup & Update Script (Windows)
# ============================================================================
# Usage:
#   .\setup.ps1 install    — First-time install as git submodule
#   .\setup.ps1 update     — Pull latest version
#   .\setup.ps1 status     — Check current version & update availability
#   .\setup.ps1 uninstall  — Remove the submodule
# ============================================================================

param(
    [Parameter(Position = 0)]
    [ValidateSet("install", "update", "status", "uninstall", "help")]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"

# Configuration
$RepoUrl = "https://github.com/buiphucminhtam/forgewright.git"
$SubmodulePath = ".antigravity/plugins/production-grade"
$Branch = "main"

function Write-Header {
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║  Production Grade Plugin — 17 Skills for Antigravity    ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Info    { param($msg) Write-Host "  ℹ $msg" -ForegroundColor Blue }
function Write-Warn    { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err     { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }

function Get-LocalVersion {
    $versionFile = Join-Path $SubmodulePath "VERSION"
    if (Test-Path $versionFile) {
        return (Get-Content $versionFile -Raw).Trim()
    }
    return "unknown"
}

function Invoke-Install {
    Write-Header

    # Check if git repo
    $gitCheck = git rev-parse --is-inside-work-tree 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Not inside a git repository. Run 'git init' first."
        exit 1
    }

    # Check if already installed
    if (Test-Path $SubmodulePath) {
        Write-Warn "Plugin already installed at $SubmodulePath"
        Write-Info "Run '.\setup.ps1 update' to get the latest version."
        exit 0
    }

    Write-Info "Installing Production Grade Plugin as git submodule..."
    Write-Host ""

    # Create parent directory
    $parentDir = Split-Path $SubmodulePath -Parent
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }

    # Add submodule
    git submodule add -b $Branch $RepoUrl $SubmodulePath
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to add submodule. Check your git configuration."
        exit 1
    }

    git submodule update --init --recursive

    $version = Get-LocalVersion

    Write-Host ""
    Write-Success "Installed successfully! Version: v$version"
    Write-Host ""
    Write-Host "    Skills location:  $SubmodulePath/skills/" -ForegroundColor White
    Write-Host "    Skill count:      17 skills" -ForegroundColor White
    Write-Host "    Pipeline:         DEFINE → BUILD → HARDEN → SHIP → SUSTAIN" -ForegroundColor White
    Write-Host ""
    Write-Host "    Next steps:" -ForegroundColor White
    Write-Host "    1. Commit: " -NoNewline -ForegroundColor White
    Write-Host "git add .gitmodules $SubmodulePath; git commit -m 'feat: add production-grade plugin'" -ForegroundColor Cyan
    Write-Host '    2. Start: ' -NoNewline -ForegroundColor White
    Write-Host '"Build a production-grade SaaS for [your idea]"' -ForegroundColor Cyan
    Write-Host "    3. Check updates: " -NoNewline -ForegroundColor White
    Write-Host ".\setup.ps1 status" -ForegroundColor Cyan
    Write-Host ""
}

function Invoke-Update {
    Write-Header

    if (-not (Test-Path $SubmodulePath)) {
        Write-Err "Plugin not installed. Run '.\setup.ps1 install' first."
        exit 1
    }

    $oldVersion = Get-LocalVersion
    Write-Info "Updating from v$oldVersion..."

    git submodule update --remote $SubmodulePath
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to update. Check your network connection."
        exit 1
    }

    $newVersion = Get-LocalVersion

    Write-Host ""
    if ($oldVersion -eq $newVersion) {
        Write-Success "Already on the latest version: v$newVersion"
    }
    else {
        Write-Success "Updated: v$oldVersion → v$newVersion"
        Write-Host ""
        Write-Host "    Don't forget to commit:" -ForegroundColor White
        Write-Host "    git add $SubmodulePath; git commit -m 'chore: update production-grade plugin to v$newVersion'" -ForegroundColor Cyan
    }
    Write-Host ""
}

function Invoke-Status {
    Write-Header

    if (-not (Test-Path $SubmodulePath)) {
        Write-Warn "Plugin not installed."
        Write-Info "Run '.\setup.ps1 install' to install."
        exit 0
    }

    $localVer = Get-LocalVersion

    Write-Host "    Installed version:  v$localVer" -ForegroundColor White
    Write-Host "    Install path:       $SubmodulePath" -ForegroundColor White

    # Count skills
    $skillsDir = Join-Path $SubmodulePath "skills"
    if (Test-Path $skillsDir) {
        $skillCount = (Get-ChildItem -Path $skillsDir -Directory).Count
        Write-Host "    Skills available:   $skillCount" -ForegroundColor White
    }

    # Check submodule status
    $subStatus = git submodule status $SubmodulePath 2>&1
    if ($subStatus -match "^\+") {
        Write-Warn "Local changes detected (modified or ahead of pinned commit)"
    }
    elseif ($subStatus -match "^-") {
        Write-Warn "Submodule not initialized. Run: git submodule update --init"
    }
    else {
        Write-Success "Submodule is clean and up to date with pinned commit"
    }

    Write-Host ""
    Write-Host "    To check for remote updates:" -ForegroundColor White
    Write-Host "    .\setup.ps1 update" -ForegroundColor Cyan
    Write-Host ""
}

function Invoke-Uninstall {
    Write-Header

    if (-not (Test-Path $SubmodulePath)) {
        Write-Warn "Plugin not installed. Nothing to remove."
        exit 0
    }

    Write-Warn "This will remove the Production Grade Plugin submodule."
    $confirm = Read-Host "  Are you sure? (y/N)"

    if ($confirm -notin @("y", "Y")) {
        Write-Info "Cancelled."
        exit 0
    }

    git submodule deinit -f $SubmodulePath
    git rm -f $SubmodulePath
    $modulesPath = Join-Path ".git" "modules" $SubmodulePath
    if (Test-Path $modulesPath) {
        Remove-Item -Recurse -Force $modulesPath
    }

    Write-Success "Plugin removed successfully."
    Write-Host "    Commit the removal: " -NoNewline -ForegroundColor White
    Write-Host "git commit -m 'chore: remove production-grade plugin'" -ForegroundColor Cyan
    Write-Host ""
}

# ============================================================================
# Main
# ============================================================================

switch ($Command) {
    "install"   { Invoke-Install }
    "update"    { Invoke-Update }
    "status"    { Invoke-Status }
    "uninstall" { Invoke-Uninstall }
    default {
        Write-Header
        Write-Host "  Usage: .\setup.ps1 <command>" -ForegroundColor White
        Write-Host ""
        Write-Host "  Commands:" -ForegroundColor White
        Write-Host "    install     First-time install as git submodule" -ForegroundColor Gray
        Write-Host "    update      Pull latest version from remote" -ForegroundColor Gray
        Write-Host "    status      Check current version & installation" -ForegroundColor Gray
        Write-Host "    uninstall   Remove the submodule completely" -ForegroundColor Gray
        Write-Host ""
    }
}
