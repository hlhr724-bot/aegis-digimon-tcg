import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMapping,
  flagSharedMatches,
  inferCardSets,
  isCandidateImageId,
  matchScans,
  normalizeFingerprint,
} from "./import-clean-card-images.mjs";

const fingerprint = (...pixels) => normalizeFingerprint(pixels);

test("infers card sets from folder names", () => {
  assert.deepEqual(inferCardSets(["BT22", "BT22 Alter Art", "Promo", "ex10", "notes.txt", ".DS_Store"]), [
    "BT22",
    "EX10",
    "P",
  ]);
});

test("offers only English printings of the chosen sets", () => {
  const sets = ["BT22", "P"];
  assert.deepEqual(
    ["BT22-001", "BT22-001_P1", "BT22-001-J", "BT2-001", "P-206_P1", "EX10-001"].filter((id) =>
      isCandidateImageId(id, sets),
    ),
    ["BT22-001", "BT22-001_P1", "P-206_P1"],
  );
});

test("accepts a clear match and flags low scores and close second matches", () => {
  const references = [
    { id: "BT22-001", fingerprint: fingerprint(0, 1, 2, 3) },
    { id: "BT22-001_P1", fingerprint: fingerprint(0, 1, 2, 3.01) },
    { id: "BT22-002", fingerprint: fingerprint(3, 0, 2, 1) },
  ];
  const [variant, clear, unknown] = matchScans(
    [
      { file: "variant.png", fingerprint: fingerprint(0, 1, 2, 3) },
      { file: "clear.png", fingerprint: fingerprint(3, 0, 2, 1) },
      { file: "unknown.png", fingerprint: fingerprint(1, 3, 0, 2) },
    ],
    references,
  );
  assert.equal(variant.reason, "close second match");
  assert.deepEqual({ id: clear.id, reason: clear.reason }, { id: "BT22-002", reason: undefined });
  assert.equal(unknown.reason, "low score");
});

test("flags scans that claim the same printing, ignoring scans already under review", () => {
  const flagged = flagSharedMatches([
    { file: "a.png", id: "BT22-001" },
    { file: "b.png", id: "BT22-001" },
    { file: "c.png", id: "BT22-002" },
    { file: "d.png", id: "BT22-002", reason: "low score" },
  ]);
  assert.deepEqual(
    flagged.map((match) => match.reason),
    ["matched by another scan", "matched by another scan", undefined, "low score"],
  );
});

test("a mapping assigns or skips a scan", () => {
  const mapped = applyMapping(
    [
      { file: "a.png", id: "P-206_P1", reason: "close second match" },
      { file: "b.png", id: "BT23-077", reason: undefined },
      { file: "c.png", id: "BT22-001", reason: undefined },
    ],
    { "a.png": "P-206", "b.png": null },
  );
  assert.deepEqual(
    mapped.map(({ id, reason }) => ({ id, reason })),
    [
      { id: "P-206", reason: undefined },
      { id: undefined, reason: "skipped by mapping" },
      { id: "BT22-001", reason: undefined },
    ],
  );
});
