#!/usr/bin/env bash
# Same as fix-gcp-iam.ps1 for macOS/Linux.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PROJECT_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('.firebaserc','utf8')).projects.default)")"
echo "Project ID: $PROJECT_ID"
NUM="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
COMPUTE_SA="${NUM}-compute@developer.gserviceaccount.com"
CLOUD_BUILD_SA="${NUM}@cloudbuild.gserviceaccount.com"
CB_MANAGED_SA="service-${NUM}@gcp-sa-cloudbuild.iam.gserviceaccount.com"

gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com \
  cloudfunctions.googleapis.com run.googleapis.com storage.googleapis.com \
  logging.googleapis.com eventarc.googleapis.com pubsub.googleapis.com \
  --project "$PROJECT_ID"

add() {
  echo "  + $1 => $2"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$1" --role="$2" --quiet || true
}

echo "Compute default SA..."
add "$COMPUTE_SA" roles/cloudbuild.builds.builder
add "$COMPUTE_SA" roles/logging.logWriter
add "$COMPUTE_SA" roles/artifactregistry.writer
add "$COMPUTE_SA" roles/storage.objectAdmin

echo "Cloud Build SA..."
add "$CLOUD_BUILD_SA" roles/logging.logWriter
add "$CLOUD_BUILD_SA" roles/artifactregistry.writer
add "$CLOUD_BUILD_SA" roles/storage.objectAdmin

echo "Google-managed Cloud Build SA..."
add "$CB_MANAGED_SA" roles/logging.logWriter
add "$CB_MANAGED_SA" roles/artifactregistry.writer
add "$CB_MANAGED_SA" roles/storage.objectAdmin

if gcloud artifacts repositories describe gcf-artifacts --location=us-central1 --project="$PROJECT_ID" &>/dev/null; then
  gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
    --location=us-central1 --project="$PROJECT_ID" \
    --member="serviceAccount:${COMPUTE_SA}" --role=roles/artifactregistry.repoAdmin --quiet || true
  gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
    --location=us-central1 --project="$PROJECT_ID" \
    --member="serviceAccount:${CLOUD_BUILD_SA}" --role=roles/artifactregistry.repoAdmin --quiet || true
  gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
    --location=us-central1 --project="$PROJECT_ID" \
    --member="serviceAccount:${CB_MANAGED_SA}" --role=roles/artifactregistry.repoAdmin --quiet || true
fi

REGION="us-central1"
echo ""
echo "Cloud Run: public invoker for SSR (fixes Forbidden on Hosting URL)..."
gcloud run services list --project="$PROJECT_ID" --region="$REGION" --format="value(metadata.name)" 2>/dev/null |
  while IFS= read -r svc; do
    [ -n "$svc" ] || continue
    case "$svc" in
      *ssr*|*firebase-frameworks*|*firebaseframeworks*|*gcfv2*)
        echo "  + allUsers => roles/run.invoker on $svc"
        gcloud run services add-iam-policy-binding "$svc" \
          --region="$REGION" --project="$PROJECT_ID" \
          --member="allUsers" --role="roles/run.invoker" --quiet || true
        ;;
    esac
  done || true

echo "Done. Deploy with: npm run deploy"
