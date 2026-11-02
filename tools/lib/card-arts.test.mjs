import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeCardArts, encodeCardArts, serializeCardArts, sourceCardArts, sourceJapaneseArts } from "./card-arts.mjs";

test("serializes the art index exactly as the committed formatter writes it", () => {
  const committed = readFileSync(new URL("../../packages/shared/src/cards/data/arts.json", import.meta.url), "utf8");
  assert.equal(serializeCardArts(JSON.parse(committed)), committed);
});

test("encodes arts as card suffixes and shared labels, keeping existing label positions", () => {
  const arts = {
    "BT1-010": [
      { artId: "BT1-010_P1", imageId: "BT1-010_P1", label: "Promotion" },
      { artId: "BT1-010-J", imageId: "BT1-010-j", label: "Japanese printing" },
    ],
    "BT1-009": [{ artId: "BT1-009_P1", imageId: "BT1-009_P1", label: "Promotion" }],
  };
  const encoded = encodeCardArts(arts, ["Japanese printing", "Retired label"]);
  assert.deepEqual(encoded, {
    labels: ["Japanese printing", "Promotion"],
    cards: {
      "BT1-009": [["_P1", 1]],
      "BT1-010": [
        ["_P1", 1],
        ["-J", 0, "BT1-010-j"],
      ],
    },
  });
  assert.deepEqual(decodeCardArts(encoded), arts);
});

test("rejects an art that does not belong to its card", () => {
  assert.throws(
    () => encodeCardArts({ "BT1-010": [{ artId: "BT1-011_P1", imageId: "BT1-011_P1", label: "Promotion" }] }),
    /does not belong/,
  );
});

test("imports only declared printings for the canonical card, deduplicated and sorted", () => {
  assert.deepEqual(
    sourceCardArts({
      cardNumber: "BT1-010",
      AAs: [
        { id: "BT1-010_P2", note: "Memorial collection" },
        { id: "BT1-011_P1" },
        { id: "BT1-010_P1-J" },
        { id: "BT1-010_P2" },
        { id: "BT1-010_P1", type: "Alternative Art" },
      ],
    }),
    [
      { artId: "BT1-010_P1", imageId: "BT1-010_P1", label: "Alternative Art" },
      { artId: "BT1-010_P2", imageId: "BT1-010_P2", label: "Memorial collection" },
    ],
  );
  assert.deepEqual(sourceCardArts({ cardNumber: "BT1-010" }), []);
});

test("imports allowlisted English printings the source lists only as Japanese", () => {
  assert.deepEqual(
    sourceCardArts({
      cardNumber: "BT20-055",
      AAs: [{ id: "BT20-055_P2", note: "PB-22: Digimon Liberator Debuggers Set" }],
      JAAs: [{ id: "BT20-055_P1-J", note: "BT-20: Booster Over the X" }],
    }),
    [
      { artId: "BT20-055_P1", imageId: "BT20-055_P1", label: "BT-20: Booster Over the X" },
      { artId: "BT20-055_P2", imageId: "BT20-055_P2", label: "PB-22: Digimon Liberator Debuggers Set" },
    ],
  );
  assert.deepEqual(
    sourceCardArts({ cardNumber: "P-148", JAAs: [{ id: "P-148_P1-J", note: "Tamer Battle Pack 22" }] }),
    [{ artId: "P-148_P1", imageId: "P-148_P1", label: "Store Tournament 2024 Jul.–Sep. Winner Pack" }],
  );
  assert.deepEqual(sourceCardArts({ cardNumber: "BT1-010", JAAs: [{ id: "BT1-010_P1-J" }] }), []);
});

test("imports allowlisted English printings the source does not list at all", () => {
  assert.deepEqual(
    sourceCardArts({
      cardNumber: "BT9-028",
      AAs: [{ id: "BT9-028_P0", note: "X Record Pre-Release Pack" }],
    }),
    [
      { artId: "BT9-028_P0", imageId: "BT9-028_P0", label: "X Record Pre-Release Pack" },
      {
        artId: "BT9-028_P1",
        imageId: "BT9-028_P1",
        label: "2024 Evolution Cup August 2024 Wave 2 (Participation)",
      },
      { artId: "BT9-028_P2", imageId: "BT9-028_P2", label: "2024 Evolution Cup August 2024 Wave 2 (Top 4)" },
    ],
  );
  assert.deepEqual(
    sourceCardArts({ cardNumber: "BT9-02" }),
    [],
    "an allowlisted ID only belongs to its exact card number",
  );
});

test("prefers the source's own entry over an allowlisted label", () => {
  assert.deepEqual(sourceCardArts({ cardNumber: "P-245", AAs: [{ id: "P-245_P1", note: "Source label" }] }), [
    { artId: "P-245_P1", imageId: "P-245_P1", label: "Source label" },
  ]);
});

test("imports errata printings under their plain art ID with their own image", () => {
  assert.deepEqual(
    sourceCardArts({
      cardNumber: "BT3-111",
      AAs: [
        { id: "BT3-111_P2-Errata", note: "EX-03: Theme Booster Draconic Roar" },
        { id: "BT3-111_P2-Errata", note: "Revision Pack 2023" },
        { id: "BT3-111-Errata", note: "Revision Pack 2023" },
      ],
    }),
    [{ artId: "BT3-111_P2", imageId: "BT3-111_P2-Errata", label: "EX-03: Theme Booster Draconic Roar" }],
  );
});

test("imports the Japanese base printing and Japanese arts under -J art IDs", () => {
  assert.deepEqual(
    sourceJapaneseArts({
      cardNumber: "BT6-084",
      JAAs: [
        { id: "BT6-084_P2-J", note: "Special Battle Area Set 2023" },
        { id: "BT6-084_P1-J", type: "Alternative Art" },
        { id: "BT6-084_P1-j", note: "Duplicate in lowercase" },
        { id: "BT6-084_P3-Sample-J", note: "Sample scan" },
        { id: "BT6-085_P1-J", note: "Another card" },
        { id: "BT6-084_P4", note: "Not Japanese" },
      ],
    }),
    [
      { artId: "BT6-084-J", imageId: "BT6-084-J", label: "Japanese printing" },
      { artId: "BT6-084_P1-J", imageId: "BT6-084_P1-J", label: "Alternative Art (Japanese)" },
      { artId: "BT6-084_P2-J", imageId: "BT6-084_P2-J", label: "Special Battle Area Set 2023 (Japanese)" },
      { artId: "BT6-084_P3-J", imageId: "BT6-084_P3-Sample-J", label: "Sample scan (Japanese)" },
    ],
  );
  assert.deepEqual(sourceJapaneseArts({ cardNumber: "BT1-010" }), [
    { artId: "BT1-010-J", imageId: "BT1-010-J", label: "Japanese printing" },
  ]);
});

test("keeps the English alternate printing on the official illustration after import", () => {
  const arts = sourceCardArts({ cardNumber: "EX12-033", AAs: [{ id: "EX12-033_P1", note: "Parallel Rare" }] });
  assert.deepEqual(arts, [{ artId: "EX12-033_P1", imageId: "EX12-033_P1-Official", label: "Parallel Rare" }]);
  const committed = JSON.parse(
    readFileSync(new URL("../../packages/shared/src/cards/data/arts.json", import.meta.url), "utf8"),
  );
  assert.equal(
    decodeCardArts(committed)["EX12-033"].find((art) => art.artId === "EX12-033_P1").imageId,
    arts[0].imageId,
  );
});
