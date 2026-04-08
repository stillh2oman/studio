# Grant allUsers Cloud Run Invoker on Firebase Hosting SSR services (Next.js on Cloud Run).
# Run AFTER a successful deploy if firebase.json uses invoker: private (deploy cannot set public IAM).
# Requires: gcloud auth; permission run.services.setIamPolicy (e.g. roles/run.admin or Owner).
# Org policy must allow principal allUsers on Cloud Run (not blocked by domain restrictions).

$ErrorActionPreference = "Continue"

$path = Join-Path $PSScriptRoot "..\.firebaserc"
$j = Get-Content $path -Raw | ConvertFrom-Json
$PROJECT_ID = $j.projects.default
$REGION = "us-central1"

Write-Host "Project: $PROJECT_ID  Region: $REGION" -ForegroundColor Cyan
Write-Host "Listing Cloud Run services (SSR names contain ssr / firebase-frameworks)..." -ForegroundColor Yellow

$services = @(gcloud run services list --project=$PROJECT_ID --region=$REGION --format="value(metadata.name)")
if ($LASTEXITCODE -ne 0) {
  Write-Host "gcloud run services list failed. Check auth and project." -ForegroundColor Red
  exit 1
}

$matched = $services | Where-Object { $_ -match "(?i)ssr|firebase-frameworks|firebaseframeworks|gcfv2" }
if (-not $matched) {
  Write-Host "No matching services. Deploy first, or open Cloud Run console and note the service name." -ForegroundColor Red
  exit 1
}

foreach ($svc in $matched) {
  Write-Host "`nBinding allUsers -> roles/run.invoker on $svc" -ForegroundColor Yellow
  gcloud run services add-iam-policy-binding $svc `
    --region=$REGION `
    --project=$PROJECT_ID `
    --member="allUsers" `
    --role="roles/run.invoker"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED on $svc. Common causes: missing run.admin / Owner, or org policy blocks allUsers." -ForegroundColor Red
    exit 1
  }
}

Write-Host "`nDone. Reload your Hosting URL." -ForegroundColor Green
