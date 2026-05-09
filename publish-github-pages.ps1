param(
  [Parameter(Mandatory = $true)]
  [string]$Owner,

  [string]$Repo = "coffee-counter"
)

$ErrorActionPreference = "Stop"

$gh = "C:\Program Files\GitHub CLI\gh.exe"

if (-not (Test-Path $gh)) {
  throw "GitHub CLI not found at $gh"
}

$repoSlug = "$Owner/$Repo"
$pagesUrl = "https://$Owner.github.io/$Repo/"

Write-Host "Creating public repository $repoSlug..."
& $gh repo create $repoSlug --public --source . --remote origin --push

Write-Host "Enabling GitHub Pages from the main branch root..."
& $gh api "repos/$repoSlug/pages" --method POST -f "source[branch]=main" -f "source[path]=/"

Write-Host ""
Write-Host "GitHub Pages publish requested."
Write-Host "Expected URL: $pagesUrl"
