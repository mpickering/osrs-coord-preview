import test from "node:test";
import assert from "node:assert/strict";
import { parseCoordinate, parseCoordinateItems } from "../src/input.js";

test("parseCoordinate parses x/y/plane", () => {
  assert.deepEqual(parseCoordinate("3200/3201/0"), { x: 3200, y: 3201, plane: 0 });
});

test("parseCoordinateItems derives ids", () => {
  const items = parseCoordinateItems(JSON.stringify([{ coordinate: "3200/3200/0", label: "Start tile" }]));
  assert.equal(items[0].id, "start-tile-1");
});

test("parseCoordinateItems rejects malformed input", () => {
  assert.throws(() => parseCoordinateItems("oops"), /Invalid coordinates JSON/);
  assert.throws(() => parseCoordinateItems(JSON.stringify([])), /non-empty JSON array/);
});
