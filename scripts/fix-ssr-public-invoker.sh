#!/usr/bin/env bash
# Same as fix-ssr-public-invoker.ps1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PROJECT_ID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('.firebaserc','utf8')).projects.default)")"
REGION="us-central1"
echo "Project: $PROJECT_ID  Region: $REGION"

gcloud run services list --project="$PROJECT_ID" --region="$REGION" --format="value(metadata.name)" |
  while IFS= read -r svc; do
    [ -n "$svc" ] || continue
    case "$svc" in *ssr*|*firebase-frameworks*|*firebaseframeworks*|*gcfv2*)
      echo "Binding allUsers -> roles/run.invoker on $svc"
      gcloud run services add-iam-policy-binding "$svc" \
        --region="$REGION" --project="$PROJECT_ID" \
        --member="allUsers" --role="roles/run.invoker"
      ;;
    esac
  done

echo "Done. Reload your Hosting URL."
