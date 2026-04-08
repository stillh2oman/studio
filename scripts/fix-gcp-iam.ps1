# Grants Cloud Build / Artifact Registry / Storage roles so Firebase SSR (2nd gen) can build.
# Requires: gcloud CLI, Owner or Security Admin on the project, and `gcloud auth login`.
# Run from repo root: npm run fix:gcp

$ErrorActionPreference = "Continue"

function Read-FirebaseProjectId {
  $path = Join-Path $PSScriptRoot "..\.firebaserc"
  if (-not (Test-Path $path)) { throw ".firebaserc not found at $path" }
  $j = Get-Content $path -Raw | ConvertFrom-Json
  return $j.projects.default
}

$PROJECT_ID = Read-FirebaseProjectId
Write-Host "Project ID: $PROJECT_ID" -ForegroundColor Cyan

$NUM = gcloud projects describe $PROJECT_ID --format="value(projectNumber)" 2>$null
if (-not $NUM) { throw "gcloud failed. Run: gcloud auth login && gcloud config set project $PROJECT_ID" }
Write-Host "Project number: $NUM" -ForegroundColor Cyan

$COMPUTE_SA = "${NUM}-compute@developer.gserviceaccount.com"
$CLOUD_BUILD_SA = "${NUM}@cloudbuild.gserviceaccount.com"
$CB_MANAGED_SA = "service-${NUM}@gcp-sa-cloudbuild.iam.gserviceaccount.com"

Write-Host "`nEnabling APIs (idempotent)..." -ForegroundColor Yellow
gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com `
  cloudfunctions.googleapis.com run.googleapis.com storage.googleapis.com `
  logging.googleapis.com eventarc.googleapis.com pubsub.googleapis.com `
  --project $PROJECT_ID

function Add-Binding([string]$Member, [string]$Role) {
  Write-Host "  + $Member => $Role"
  gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:$Member" `
    --role=$Role `
    --quiet 2>&1 | Out-Null
}

Write-Host "`nProject-level IAM (compute default SA - common build identity)..." -ForegroundColor Yellow
Add-Binding $COMPUTE_SA "roles/cloudbuild.builds.builder"
Add-Binding $COMPUTE_SA "roles/logging.logWriter"
Add-Binding $COMPUTE_SA "roles/artifactregistry.writer"
Add-Binding $COMPUTE_SA "roles/storage.objectAdmin"

Write-Host "`nProject-level IAM (legacy Cloud Build SA)..." -ForegroundColor Yellow
Add-Binding $CLOUD_BUILD_SA "roles/logging.logWriter"
Add-Binding $CLOUD_BUILD_SA "roles/artifactregistry.writer"
Add-Binding $CLOUD_BUILD_SA "roles/storage.objectAdmin"

Write-Host "`nProject-level IAM (Google-managed Cloud Build SA)..." -ForegroundColor Yellow
Add-Binding $CB_MANAGED_SA "roles/logging.logWriter"
Add-Binding $CB_MANAGED_SA "roles/artifactregistry.writer"
Add-Binding $CB_MANAGED_SA "roles/storage.objectAdmin"

Write-Host "`nArtifact Registry repo gcf-artifacts (us-central1) if it exists..." -ForegroundColor Yellow
$repoCmd = "gcloud artifacts repositories describe gcf-artifacts --location=us-central1 --project=$PROJECT_ID 2>&1"
$exists = Invoke-Expression $repoCmd
if ($LASTEXITCODE -eq 0) {
  gcloud artifacts repositories add-iam-policy-binding gcf-artifacts `
    --location=us-central1 `
    --project=$PROJECT_ID `
    --member="serviceAccount:$COMPUTE_SA" `
    --role=roles/artifactregistry.repoAdmin `
    --quiet 2>&1 | Out-Null
  gcloud artifacts repositories add-iam-policy-binding gcf-artifacts `
    --location=us-central1 `
    --project=$PROJECT_ID `
    --member="serviceAccount:$CLOUD_BUILD_SA" `
    --role=roles/artifactregistry.repoAdmin `
    --quiet 2>&1 | Out-Null
  gcloud artifacts repositories add-iam-policy-binding gcf-artifacts `
    --location=us-central1 `
    --project=$PROJECT_ID `
    --member="serviceAccount:$CB_MANAGED_SA" `
    --role=roles/artifactregistry.repoAdmin `
    --quiet 2>&1 | Out-Null
  Write-Host "  Repo bindings applied."
} else {
  Write-Host "  (skip) gcf-artifacts repo not found yet - will exist after first successful build."
}

$REGION = "us-central1"
Write-Host "`nCloud Run: public invoker for SSR (fixes 'Forbidden' on Hosting URL)..." -ForegroundColor Yellow
$svcList = gcloud run services list --project=$PROJECT_ID --region=$REGION --format="value(metadata.name)" 2>$null
if ($LASTEXITCODE -ne 0 -or -not $svcList) {
  Write-Host "  (skip) No Cloud Run services listed yet, or run.googleapis.com not ready."
} else {
  foreach ($svc in $svcList) {
    if ($svc -match "(?i)ssr|firebase-frameworks|firebaseframeworks|gcfv2") {
      Write-Host "  + allUsers => roles/run.invoker on $svc"
      gcloud run services add-iam-policy-binding $svc `
        --region=$REGION `
        --project=$PROJECT_ID `
        --member="allUsers" `
        --role="roles/run.invoker" `
        --quiet 2>&1 | Out-Null
    }
  }
  Write-Host "  If org policy blocks allUsers, an admin must allow unauthenticated Cloud Run or set invoker in firebase.json and redeploy."
}

Write-Host "`nDone. Deploy with: npm run deploy" -ForegroundColor Green
Write-Host "If build still fails, open the Cloud Build log and search for PERMISSION_DENIED for the exact principal." -ForegroundColor DarkGray
