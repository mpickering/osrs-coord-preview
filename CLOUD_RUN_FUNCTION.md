# Cloud Run Function Deployment

This repo contains three interfaces:

- the GitHub Action client
- the standalone local CLI
- the hosted renderer service

The hosted renderer is intended to run as a public HTTP Cloud Run function with a public GCS bucket for rendered images.

## One-step deployment

Use [`scripts/deploy-cloud-run.sh`](/home/matt/osrs-coord-preview/scripts/deploy-cloud-run.sh) from a shell with `gcloud` authenticated:

```bash
PROJECT_ID=your-gcp-project \
REGION=europe-west2 \
SERVICE_NAME=osrs-coordinate-preview \
BUCKET_NAME=your-public-preview-bucket \
./scripts/deploy-cloud-run.sh
```

The script:

- creates the bucket if it does not exist
- applies a 365-day lifecycle delete rule
- grants public object read access
- deploys the Cloud Run service from this repo
- prints the final `RENDERER_URL`

## Required environment

- `GCS_BUCKET`: public bucket name used for published preview images
- optional local development variables:
  - `PUBLISH_MODE=local`
  - `LOCAL_PUBLISH_DIR`
  - `PUBLIC_BASE_URL`

## Function contract

- `POST /render`
- request body: the same JSON array used by the GitHub Action `coordinates` input
- response body: JSON with `renderCount`, `failedCount`, and per-item `imageUrl`

## Local service development

```bash
PUBLISH_MODE=local \
LOCAL_PUBLISH_DIR=.cloud-run-public \
PUBLIC_BASE_URL=http://127.0.0.1:8080/static \
npm run serve
```

Then point the action at:

```text
http://127.0.0.1:8080/render
```
