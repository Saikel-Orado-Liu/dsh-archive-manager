# dsh-archive-manager local-development rollback (web profile). Idempotent.
# The published package can be removed with `dsh plugin --profile web remove`.
$ErrorActionPreference = "Stop"

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

Write-Host "==> rolling back dsh-archive-manager from web profile"

# 1. remove the patch block (keep the rest of the user layer)
$template = @'
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
[]
'@
if (Test-Path $patchPath) {
    $lines = Get-Content $patchPath
    $start = ($lines | Select-String -Pattern "dsh-archive-manager: archive session management" | Select-Object -First 1).LineNumber
    if ($start) {
        # block runs from the comment line to the line before the first top-level
        # "- id:" / "- insert:" entry that follows it (blank lines included)
        $end = $start + 1
        while ($end -le $lines.Count) {
            $line = $lines[$end - 1]
            if ($end -gt $start + 1 -and ($line -match "^- (id|insert|disabled|config):" -or $line -match "^# Your patch layer")) { break }
            $end++
        }
        $keep = @($lines[0..($start - 2)]) + @($lines[($end - 1)..($lines.Count - 1)])
        # a comments-only file would parse as null, not a list — restore the template
        $meaningful = @($keep | Where-Object { $_.Trim() -ne "" -and -not $_.Trim().StartsWith("#") })
        if ($meaningful.Count -eq 0) { Set-Content -Path $patchPath -Value $template -Encoding UTF8 }
        else { Set-Content -Path $patchPath -Value $keep -Encoding UTF8 }
        Write-Host "    patch block removed"
    } else {
        Write-Host "    no archive-manager block found"
    }
}

# 2. remove junctions
foreach ($pkg in $packages) {
    $link = Join-Path $webModules $pkg
    if (Test-Path $link) {
        $item = Get-Item $link
        if ($item.LinkType -eq "Junction") { & cmd /c rmdir "$link" 2>$null | Out-Null; if (Test-Path $link) { Remove-Item $link -Recurse -Force }; Write-Host "    removed link $pkg" }
        else { throw "$link is not a junction; remove it manually" }
    }
}

# 3. remove the installed copies
if (Test-Path $installRoot) {
    Remove-Item $installRoot -Recurse -Force
    Write-Host "    removed $installRoot"
}

Write-Host ""
Write-Host "Rolled back. Restart 'dsh web' to restore the stock rows."
