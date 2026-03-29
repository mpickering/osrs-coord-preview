# OSRS Coordinate Preview

`osrs-coordinate-preview` is a TypeScript toolkit for previewing OSRS coordinates in three modes:

- a GitHub Action that calls a hosted renderer and can comment on pull requests
- a standalone local CLI that renders images directly on your machine
- a hosted renderer service intended for Cloud Run + public GCS image hosting

The shared input format is a batch JSON array of coordinates in `x/y/plane` form.

## Architecture

The components are split intentionally:

- The GitHub Action is a thin client. It sends coordinate batches to a remote renderer URL, writes a local manifest, and optionally posts or updates a PR comment using the hosted image URLs returned by the service.
- The local CLI renders directly using the shared renderer. Use it for development, manual inspection, and debugging.
- The hosted renderer accepts the same batch payload, renders the images, publishes them to a public bucket, and returns public image URLs.

## Input format

The action accepts a single `coordinates` input containing a JSON array. Each item must include a `coordinate` string in `x/y/plane` form.

```json
[
  {
    "id": "quest-start",
    "label": "Quest start",
    "coordinate": "3200/3200/0",
    "source": "data/quest-steps.json:14"
  },
  {
    "label": "Talk to guide",
    "coordinate": "3210/3215/0"
  }
]
```

Fields:

- `coordinate`: required, `x/y/plane`
- `id`: optional stable identifier used for filenames
- `label`: optional display label for summaries
- `source`: optional source reference shown in the PR comment

## Shared input format

The action, CLI, and hosted renderer all accept the same batch JSON array. Each item must include a `coordinate` string in `x/y/plane` form.

```json
[
  {
    "id": "quest-start",
    "label": "Quest start",
    "coordinate": "3200/3200/0",
    "source": "data/quest-steps.json:14"
  },
  {
    "label": "Talk to guide",
    "coordinate": "3210/3215/0"
  }
]
```

Fields:

- `coordinate`: required, `x/y/plane`
- `id`: optional stable identifier used for filenames and response items
- `label`: optional display label for summaries and PR comments
- `source`: optional source reference shown in the PR comment

## GitHub Action

The action does not render locally. It sends the batch payload to a configured hosted renderer.

```yaml
jobs:
  preview-coordinates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - id: coords
        name: Compute coordinates
        run: |
          echo 'coordinates=[{"id":"quest-start","label":"Quest start","coordinate":"3200/3200/0"},{"id":"step-2","label":"Talk to guide","coordinate":"3210/3215/0"}]' >> "$GITHUB_OUTPUT"

      - uses: matt/osrs-coordinate-preview@v1
        with:
          coordinates: ${{ steps.coords.outputs.coordinates }}
          comment: "true"
          renderer-url: https://osrs-coordinate-preview-nt7ywvsdgq-nw.a.run.app/render
          github-token: ${{ github.token }}
```

Outputs:

- `manifest_path`: path to the generated manifest
- `render_count`: successful renders
- `failed_count`: failed renders

If `comment: "true"` is enabled, the action posts or updates one PR-level comment with inline images using the URLs returned by the hosted renderer.

## Local CLI usage

Install dependencies, then run the CLI with the same schema used by the action and service.

```bash
npm install
npm run cli -- --coordinates-file fixtures/coordinates.json
```

You can also pass the JSON payload directly:

```bash
npm run cli -- --coordinates '[{"coordinate":"3200/3200/0","label":"Quest start"}]'
```

The CLI writes previews and `manifest.json` into `.osrs-coordinate-preview/` by default and prints the manifest path to stdout.

Use `--debug` to emit verbose tracing and the stitched intermediate composite image:

```bash
npm run cli -- --debug --coordinates '[{"coordinate":"2701/3408/0","label":"Test coordinate"}]'
```

## Hosted renderer

The hosted renderer exposes a `POST /render` endpoint and returns public image URLs. It is intended to run on Cloud Run and publish images to a public GCS bucket with a 365-day lifecycle policy.

Example request:

```bash
curl -X POST 'https://osrs-coordinate-preview-nt7ywvsdgq-nw.a.run.app/render' \
  -H 'content-type: application/json' \
  -d '[{"coordinate":"2701/3408/0","label":"Test coordinate"}]'
```

Deployment notes are in [`CLOUD_RUN_FUNCTION.md`](/home/matt/osrs-coord-preview/CLOUD_RUN_FUNCTION.md). For GCP deployment, there is also a helper script:

```bash
REGION=europe-west2 \
SERVICE_NAME=osrs-coordinate-preview \
./scripts/deploy-cloud-run.sh
```

The deploy script currently defaults to:

- `PROJECT_ID=osrs-coordinate-preview`
- `BUCKET_NAME=osrs-coordinate-preview-images`

## Repository development

```bash
npm install
npm test
npm run build
```

This repo includes a self-test workflow at [`.github/workflows/self-test.yml`](/home/matt/osrs-coord-preview/.github/workflows/self-test.yml) that runs the action against fixture coordinates after building it.

There is also a PR comment integration workflow at [`.github/workflows/test-pr-comment.yml`](/home/matt/osrs-coord-preview/.github/workflows/test-pr-comment.yml). It runs only when a PR has the `test-pr-comment` label.

## Notes

- Rendering uses RuneScape Wiki rendered map tiles from `https://maps.runescape.wiki/osrs/versions/2026-03-04_a/tiles/rendered/`.
- The GitHub Action does not render locally in its main path; it calls a configured remote renderer URL.
- The local CLI remains the direct local rendering path.
- The hosted renderer is public by design so returned image URLs can be embedded directly in PR comments.
