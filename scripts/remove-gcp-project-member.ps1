# Removes a Google account from all IAM role bindings on the Firebase/GCP project.
# Run from repo root: npm run remove:member
# Requires: gcloud auth with permission to change project IAM (e.g. Owner).

param(
  [string]$Email = "tammidillon73@gmail.com"
)

$ErrorActionPreference = "Stop"
$path = Join-Path $PSScriptRoot "..\.firebaserc"
$j = Get-Content $path -Raw | ConvertFrom-Json
$PROJECT_ID = $j.projects.default
$MEMBER = "user:$Email"

Write-Host "Project: $PROJECT_ID" -ForegroundColor Cyan
Write-Host "Removing IAM member: $MEMBER" -ForegroundColor Yellow

$policyJson = gcloud projects get-iam-policy $PROJECT_ID --format=json
if ($LASTEXITCODE -ne 0) { throw "gcloud get-iam-policy failed (auth / project?)" }

$policy = $policyJson | ConvertFrom-Json
$removed = 0
foreach ($binding in $policy.bindings) {
  $role = $binding.role
  if (-not $binding.members) { continue }
  if ($binding.members -contains $MEMBER) {
    Write-Host "  remove $MEMBER from $role"
    gcloud projects remove-iam-policy-binding $PROJECT_ID --member=$MEMBER --role=$role --quiet
    if ($LASTEXITCODE -eq 0) { $removed++ }
  }
}

if ($removed -eq 0) {
  Write-Host "No bindings found for $MEMBER (already absent or different member format)." -ForegroundColor DarkYellow
} else {
  Write-Host "Removed $removed binding(s)." -ForegroundColor Green
}

Write-Host "`nNote: Firebase Authentication users are separate. Remove Tammi in Firebase Console > Authentication if needed." -ForegroundColor DarkGray
