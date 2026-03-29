import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CoordinateItem, RenderFailure, RenderManifest, RenderOptions, RenderResult, RenderSuccess, TileCoordinate } from "./types.js";

const DEFAULT_TILE_BASE_URL = "https://maps.runescape.wiki/osrs/versions/2026-03-04_a/tiles/rendered";
const TILE_USER_AGENT = "osrs-coordinate-preview/0.1.0 (+https://github.com/mpickering/osrs-coordinate-preview)";
const TILE_SIZE = 256;
const MAP_ID = 0;
const ZOOM_LEVEL = 3;
const GAME_SQUARES_PER_TILE = 32;
const PIXELS_PER_GAME_SQUARE = TILE_SIZE / GAME_SQUARES_PER_TILE;
const DEFAULT_CROP_SIZE = 384;
const DEFAULT_MARKER_RADIUS = 2;
const COMMENT_STROKE = "#111827";
const TILE_HIGHLIGHT_OUTER = "#ffffff";
const TILE_HIGHLIGHT_INNER = "#facc15";
const TILE_HIGHLIGHT_FILL = "rgba(250, 204, 21, 0.28)";

export function resolveTileCoordinate(x: number, y: number): TileCoordinate {
  // At zoom level 3, one rendered tile covers a 32x32 region of world coordinates.
  const tileX = Math.floor(x / GAME_SQUARES_PER_TILE);
  const tileY = Math.floor(y / GAME_SQUARES_PER_TILE);
  const localX = x - tileX * GAME_SQUARES_PER_TILE;
  const localY = y - tileY * GAME_SQUARES_PER_TILE;
  const pixelX = Math.floor(localX * PIXELS_PER_GAME_SQUARE);
  const pixelY = TILE_SIZE - 1 - Math.floor(localY * PIXELS_PER_GAME_SQUARE);
  return { tileX, tileY, pixelX, pixelY };
}

export async function renderBatch(items: CoordinateItem[], options: RenderOptions): Promise<RenderManifest> {
  const tileBaseUrl = options.tileBaseUrl ?? DEFAULT_TILE_BASE_URL;
  const outputDir = options.outputDir;
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? console.error;

  await fs.mkdir(outputDir, { recursive: true });

  const results = await Promise.all(
    items.map(async (item) => renderCoordinate(item, outputDir, fetchImpl, tileBaseUrl, options, logger))
  );

  const manifest: RenderManifest = {
    tileBaseUrl,
    generatedAt: new Date().toISOString(),
    renderCount: results.filter((result) => result.status === "success").length,
    failedCount: results.filter((result) => result.status === "failure").length,
    items: results
  };

  await fs.writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function renderCoordinate(
  item: CoordinateItem,
  outputDir: string,
  fetchImpl: typeof fetch,
  tileBaseUrl: string,
  options: RenderOptions,
  logger: (message: string) => void
): Promise<RenderResult> {
  try {
    const resolved = resolveTileCoordinate(item.parsed.x, item.parsed.y);
    const cropSize = options.cropSize ?? DEFAULT_CROP_SIZE;
    const markerRadius = options.markerRadius ?? DEFAULT_MARKER_RADIUS;
    const tileSpan = 3;
    const originTileX = resolved.tileX - 1;
    const originTileY = resolved.tileY - 1;

    if (options.debug) {
      logger(
        `[debug] ${item.id}: coordinate=${item.coordinate} tile=${resolved.tileX},${resolved.tileY} pixel=${resolved.pixelX},${resolved.pixelY}`
      );
    }

    const compositeInputs = await Promise.all(
      Array.from({ length: tileSpan * tileSpan }, async (_, index) => {
        const localTileX = index % tileSpan;
        const localTileY = Math.floor(index / tileSpan);
        const tileX = originTileX + localTileX;
        const tileY = originTileY + localTileY;
        // World Y increases to the north, so higher tile rows have to be composited
        // nearer the top of the stitched image.
        const compositeTop = (tileSpan - 1 - localTileY) * TILE_SIZE;
        if (options.debug) {
          logger(`[debug] ${item.id}: fetch ${tileBaseUrl}/${MAP_ID}/${ZOOM_LEVEL}/${item.parsed.plane}_${tileX}_${tileY}.png`);
        }
        const tileBuffer = await fetchTile(tileBaseUrl, item.parsed.plane, tileX, tileY, fetchImpl);
        return {
          input: tileBuffer,
          left: localTileX * TILE_SIZE,
          top: compositeTop
        };
      })
    );

    const stitched = sharp({
      create: {
        width: tileSpan * TILE_SIZE,
        height: tileSpan * TILE_SIZE,
        channels: 4,
        background: "#00000000"
      }
    }).composite(compositeInputs);

    const absoluteX = TILE_SIZE + resolved.pixelX;
    const absoluteY = TILE_SIZE + resolved.pixelY;
    const left = clamp(Math.round(absoluteX - cropSize / 2), 0, tileSpan * TILE_SIZE - cropSize);
    const top = clamp(Math.round(absoluteY - cropSize / 2), 0, tileSpan * TILE_SIZE - cropSize);
    const markerSvg = createMarkerSvg(
      cropSize,
      absoluteX - left,
      absoluteY - top,
      markerRadius,
      PIXELS_PER_GAME_SQUARE
    );

    const imageName = `${item.id}.png`;
    const imagePath = path.join(outputDir, imageName);

    if (options.debug) {
      logger(`[debug] ${item.id}: crop left=${left} top=${top} size=${cropSize} output=${imagePath}`);
    }

    // Materialize the stitched image before cropping; the direct streaming pipeline
    // produced incorrect transparent output with these source tiles.
    const stitchedBuffer = await stitched.png().toBuffer();

    if (options.debug) {
      const stitchedPath = path.join(outputDir, `${item.id}.stitched.png`);
      await fs.writeFile(stitchedPath, stitchedBuffer);
      logger(`[debug] ${item.id}: stitched output=${stitchedPath}`);
    }

    await sharp(stitchedBuffer)
      .extract({ left, top, width: cropSize, height: cropSize })
      .composite([{ input: Buffer.from(markerSvg), left: 0, top: 0 }])
      .png()
      .toFile(imagePath);

    const result: RenderSuccess = {
      status: "success",
      id: item.id,
      label: item.label,
      source: item.source,
      coordinate: item.coordinate,
      resolved,
      imageName,
      imagePath
    };
    return result;
  } catch (error) {
    const result: RenderFailure = {
      status: "failure",
      id: item.id,
      label: item.label,
      source: item.source,
      coordinate: item.coordinate,
      error: (error as Error).message
    };
    return result;
  }
}

async function fetchTile(
  tileBaseUrl: string,
  plane: number,
  tileX: number,
  tileY: number,
  fetchImpl: typeof fetch
): Promise<Buffer> {
  const url = `${tileBaseUrl}/${MAP_ID}/${ZOOM_LEVEL}/${plane}_${tileX}_${tileY}.png`;
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": TILE_USER_AGENT
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch tile ${plane}/${tileX}/${tileY}: ${response.status} ${response.statusText}`);
  }
  const input = Buffer.from(await response.arrayBuffer());
  // Normalise every tile to an opaque PNG before stitching so downstream compositing
  // does not inherit unexpected transparency from the source asset encoding.
  return sharp(input).removeAlpha().png().toBuffer();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function createMarkerSvg(size: number, x: number, y: number, radius: number, tileSize: number): string {
  const tileLeft = x - tileSize / 2;
  const tileTop = y - tileSize / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${tileLeft - 1}" y="${tileTop - 1}" width="${tileSize + 2}" height="${tileSize + 2}" fill="none" stroke="${TILE_HIGHLIGHT_OUTER}" stroke-width="2" />
    <rect x="${tileLeft}" y="${tileTop}" width="${tileSize}" height="${tileSize}" fill="${TILE_HIGHLIGHT_FILL}" stroke="${TILE_HIGHLIGHT_INNER}" stroke-width="2" />
    <circle cx="${x}" cy="${y}" r="${radius}" fill="#ffffff" stroke="${COMMENT_STROKE}" stroke-width="1.5" />
  </svg>`;
}
