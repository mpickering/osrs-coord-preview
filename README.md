# OSRS Coordinate Preview

`osrs-coordinate-preview` is a TypeScript GitHub Action and local CLI for rendering preview images for OSRS coordinates during CI. It is intended for workflows where another step computes one or more coordinates and reviewers need a visual check that each marker lands in the expected place.

The action is OSRS-specific in v1. It always renders one image per coordinate, writes a `manifest.json`, uploads the output directory as an artifact, and can optionally post or update a single pull request comment with a summary.

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
          github-token: ${{ github.token }}
```

Outputs:

- `manifest_path`: path to the generated manifest
- `artifact_name`: uploaded artifact name
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

## Repository development

```bash
npm install
npm test
npm run build
```

This repo includes a self-test workflow at [`.github/workflows/self-test.yml`](/home/matt/osrs-coord-preview/.github/workflows/self-test.yml) that runs the action against fixture coordinates after building it.

## Notes

- v1 uses RuneScape Wiki rendered map tiles from `https://maps.runescape.wiki/osrs/versions/2026-03-04_a/tiles/rendered/`.
- The action processes all requested coordinates, writes all successful previews, then fails if any coordinate could not be rendered.
- PR comments are optional and are posted as a single updatable summary comment rather than inline review comments. When enabled, pass `github-token: ${{ github.token }}`.
