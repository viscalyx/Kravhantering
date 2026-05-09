$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$worktreePath = if ($env:CODEX_WORKTREE_PATH) {
  $env:CODEX_WORKTREE_PATH
} else {
  $repoRoot.Path
}

if (($env:KRAV_DEVCONTAINER -eq "1") -and ($env:CODEX_APP_COMPOSE -ne "1")) {
  Write-Error ".codex/compose.ps1 is reserved for Codex App worktree automation. Inside the VS Code devcontainer, run npm and project commands directly."
  exit 64
}

if (-not $env:COMPOSE_PROJECT_NAME) {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($worktreePath)
  $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($bytes))).
    Replace("-", "").ToLowerInvariant().Substring(0, 12)
  $env:COMPOSE_PROJECT_NAME = "kravhantering-codex-$hash"
}

$env:CODEX_WORKTREE_PATH = $worktreePath

& docker compose -f (Join-Path $repoRoot ".codex/docker-compose.yml") @args
exit $LASTEXITCODE
