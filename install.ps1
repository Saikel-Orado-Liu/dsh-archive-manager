# dsh-archive-manager local-development installer (web profile).
# The published single npm package is installed with:
#   dsh plugin --profile web add @gamegeek-saikel/dsh-archive-manager
# This script is for working from a source checkout: it copies the three
# internal submodules, creates junctions, and appends the local patch block.
# Idempotent: re-running refreshes the installed copies and the patch layer.
$ErrorActionPreference = "Stop"

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$profiles = Join-Path $env:USERPROFILE ".dsh\profiles"
$web = Join-Path $profiles "web"
$installRoot = Join-Path $profiles "archive-manager"
$webModules = Join-Path $web "node_modules"
$patchPath = Join-Path $web "cordis.patch.yml"

$packages = @(
    "dsh-archive-manager-workspace",
    "dsh-archive-manager-projcache",
    "dsh-archive-manager-client"
)

Write-Host "==> installing dsh-archive-manager into web profile"

# 1. copy package sources (independent of the source checkout afterwards)
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
foreach ($pkg in $packages) {
    $from = Join-Path $sourceRoot $pkg
    $to = Join-Path $installRoot $pkg
    if (Test-Path $to) { Remove-Item $to -Recurse -Force }
    Copy-Item $from $to -Recurse
    Write-Host "    copied $pkg"
}

# 2. junction links in the profile node_modules (mirrors pnpm's file: links;
#    ESM deps resolve through the parent walk to the flat fallback)
New-Item -ItemType Directory -Force -Path $webModules | Out-Null
foreach ($pkg in $packages) {
    $link = Join-Path $webModules $pkg
    $target = Join-Path $installRoot $pkg
    if (Test-Path $link) {
        $item = Get-Item $link
        if ($item.LinkType -eq "Junction") { & cmd /c rmdir "$link" 2>$null | Out-Null; if (Test-Path $link) { Remove-Item $link -Recurse -Force } }
        else { throw "$link exists and is not a junction; remove it manually" }
    }
    New-Item -ItemType Junction -Path $link -Target $target | Out-Null
    Write-Host "    linked $pkg"
}

# 3. patch layer (backup first)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$patchPath.bak-$stamp"
Copy-Item $patchPath $backup -Force
Write-Host "    backed up cordis.patch.yml -> $backup"

$patchBlock = @'
# ── dsh-archive-manager: archive session management ─────────────────────────
# Disables the stock rows and substitutes the archive-manager implementations.
# Rollback: delete this block (or restore the backup) and remove the
# dsh-archive-manager-* packages, then restart dsh web.
- id: workspace
  disabled: true
- id: session-projection-cache
  disabled: true
- id: ui-workspace
  disabled: true
- insert:
    - id: workspace-archive-manager
      name: dsh-archive-manager-workspace
    - id: session-projection-cache-archive-manager
      name: dsh-archive-manager-projcache
      config:
        writeEveryEvents: 200
        writeIntervalMs: 5000
    - id: ui-workspace-archive-manager
      name: dsh-archive-manager-client
'@

$current = Get-Content $patchPath -Raw
if ($current -match "dsh-archive-manager: archive session management") {
    Write-Host "    patch block already present; skipped"
} else {
    # The profile template is one YAML document ending in "[]"; the patch must
    # replace that empty-list line instead of starting a second document.
    $lines = Get-Content $patchPath
    $listLine = -1
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
        if ($lines[$i].Trim() -eq "[]") { $listLine = $i; break }
        if ($lines[$i].Trim() -ne "" -and -not $lines[$i].Trim().StartsWith("#")) { break }
    }
    if ($listLine -ge 0) {
        $keep = $lines[0..($listLine - 1)]
        ($keep + $patchBlock) | Set-Content -Path $patchPath -Encoding UTF8
    } else {
        Add-Content -Path $patchPath -Value $patchBlock -Encoding UTF8
    }
    Write-Host "    patch entries appended"
}

# 4. test harness junction (so `node --test` resolves the same flat fallback)
$testModules = Join-Path $sourceRoot "node_modules"
if (-not (Test-Path $testModules)) {
    New-Item -ItemType Junction -Path $testModules -Target (Join-Path $profiles "node_modules") | Out-Null
}

Write-Host ""
Write-Host "Installed. Restart 'dsh web' to activate (this interrupts the current session)."
Write-Host "Verify per README.md's restart checklist. Rollback: rollback.ps1"
