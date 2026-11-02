import { expect, it } from "vitest";
import { getSearchErrorCause } from "#api/bot/search/getSearchErrorCause";
import { LiveSearchErrorStage } from "#api/bot/search/LiveSearchErrorStage";

const SEARCH = LiveSearchErrorStage.SEARCH.value;

it("groups search errors that differ only in numbers under one cause", () => {
  expect(
    getSearchErrorCause({ error: new Error("Snapshot continuation diverged before input 12"), stage: SEARCH }),
  ).toBe(getSearchErrorCause({ error: new Error("Snapshot continuation diverged before input 3"), stage: SEARCH }));
});

it("names the stage that failed", () => {
  expect(
    getSearchErrorCause({ error: new Error("callback has no factory"), stage: LiveSearchErrorStage.SNAPSHOT.value }),
  ).toBe("snapshot: callback has no factory");
});

it("bounds the cause length", () => {
  expect(getSearchErrorCause({ error: "x".repeat(500), stage: SEARCH })).toHaveLength(120);
});
