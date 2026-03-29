#!/usr/bin/env bash

set -euo pipefail

# This script provisions the public bucket if needed, applies the 365-day lifecycle
# policy, and deploys the renderer as a public Cloud Run service from this repo.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROJECT_ID="${PROJECT_ID:-osrs-coordinate-preview}"
REGION="${REGION:-europe-west2}"
SERVICE_NAME="${SERVICE_NAME:-osrs-coordinate-preview}"
BUCKET_NAME="${BUCKET_NAME:-osrs-coordinate-preview-images}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required." >&2
  exit 1
fi

TMP_LIFECYCLE="$(mktemp)"
trap 'rm -f "${TMP_LIFECYCLE}"' EXIT

cat > "${TMP_LIFECYCLE}" <<'EOF'
{
  "rule": [
    {
      "action": {
        "type": "Delete"
      },
      "condition": {
        "age": 365
      }
    }
  ]
}
EOF

echo "Using project: ${PROJECT_ID}"
echo "Using region: ${REGION}"
echo "Using service: ${SERVICE_NAME}"
echo "Using bucket: ${BUCKET_NAME}"

if ! gcloud storage buckets describe "gs://${BUCKET_NAME}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Creating bucket gs://${BUCKET_NAME}"
  gcloud storage buckets create "gs://${BUCKET_NAME}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}" \
    --uniform-bucket-level-access
else
  echo "Bucket gs://${BUCKET_NAME} already exists"
fi

echo "Applying 365-day lifecycle policy"
gcloud storage buckets update "gs://${BUCKET_NAME}" \
  --project "${PROJECT_ID}" \
  --lifecycle-file "${TMP_LIFECYCLE}"

echo "Making bucket objects publicly readable"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
  --project "${PROJECT_ID}" \
  --member="allUsers" \
  --role="roles/storage.objectViewer" >/dev/null

echo "Deploying Cloud Run service"
cd "${ROOT_DIR}"
gcloud run deploy "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --source . \
  --allow-unauthenticated \
  --set-env-vars "GCS_BUCKET=${BUCKET_NAME}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format='value(status.url)')"

echo
echo "Cloud Run service deployed."
echo "Renderer URL:"
echo "${SERVICE_URL}/render"
echo
echo "Suggested GitHub repository variable:"
echo "RENDERER_URL=${SERVICE_URL}/render"
