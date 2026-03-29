# OSRS Coordinate Preview



`osrs-coordinate-preview` is a TypeScript GitHub Action, local CLI, and renderer service for previewing OSRS coordinates. The GitHub Action now acts as a client of a hosted renderer, while the CLI keeps local rendering available for development and manual inspection.

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

## GitHub Action usage

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

## Local CLI usage

Install dependencies, then run the CLI with the same schema used by the action.

```bash
npm install
npm run cli -- --coordinates-file fixtures/coordinates.json
```

You can also pass the JSON payload directly:

```bash
npm run cli -- --coordinates '[{"coordinate":"3200/3200/0","label":"Quest start"}]'
```

The CLI writes previews and `manifest.json` into `.osrs-coordinate-preview/` by default and prints the manifest path to stdout.

## Hosted renderer

The hosted renderer exposes a `POST /render` endpoint and returns public image URLs. Deployment notes are in [`CLOUD_RUN_FUNCTION.md`](/home/matt/osrs-coord-preview/CLOUD_RUN_FUNCTION.md).

For GCP deployment, there is also a helper script:

```bash
PROJECT_ID=your-gcp-project \
REGION=europe-west2 \
SERVICE_NAME=osrs-coordinate-preview \
BUCKET_NAME=your-public-preview-bucket \
./scripts/deploy-cloud-run.sh
```

## Repository development

```bash
npm install
npm test
npm run build
```

This repo includes a self-test workflow at [`.github/workflows/self-test.yml`](/home/matt/osrs-coord-preview/.github/workflows/self-test.yml) that runs the action against fixture coordinates after building it.

## Notes

- Rendering uses RuneScape Wiki rendered map tiles from `https://maps.runescape.wiki/osrs/versions/2026-03-04_a/tiles/rendered/`.
- The GitHub Action no longer renders locally in its main path; it calls a configured remote renderer URL.
- The local CLI still renders previews directly for development and manual testing.
