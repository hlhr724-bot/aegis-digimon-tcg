import { expect, it } from "vitest";
import { splitInspectorPrintedText } from "@/game/splitInspectorPrintedText";
import { getInspectorMarker } from "@/game/getInspectorMarker";

it("moves evolution requirements without moving when-digivolving effects", () => {
  const requirements =
    "[Digivolve] Lv.6 w/[DATA SQUAD] trait: Cost 5 [Burst Digivolve] [Rosemon]: Cost 0 by returning 1 [Yoshino Fujieda] to the hand.";
  const effects = "[When Digivolving] You may suspend 2 Digimon.\n[When Attacking] [Once Per Turn] Draw 1.";
  expect(splitInspectorPrintedText({ text: `${requirements}\n\n${effects}` })).toEqual({ requirements, effects });
});

it("keeps requirement-only and requirement-free text visible", () => {
  for (const text of ["[Digivolve] Lv.3: Cost 2", "[When Digivolving] Draw 1."]) {
    expect(splitInspectorPrintedText({ text })).toEqual({ requirements: "", effects: text });
  }
});

it("moves requirements past printed keywords", () => {
  expect(splitInspectorPrintedText({ text: "[Digivolve] Lv.3: Cost 2\n\n＜Blocker＞\n[On Play] Draw 1." })).toEqual({
    requirements: "[Digivolve] Lv.3: Cost 2",
    effects: "＜Blocker＞\n[On Play] Draw 1.",
  });
});

it("moves Assembly and DigiXros lines wherever they are printed", () => {
  expect(
    splitInspectorPrintedText({
      text: "[Digivolve] Lv.5: Cost 4 \n[Assembly -6] 3 [Gokuumon]/[Sagomon] w/different names\n\n＜Rush＞ \n[On Play] Draw 1.",
    }),
  ).toEqual({
    requirements: "[Digivolve] Lv.5: Cost 4\n[Assembly -6] 3 [Gokuumon]/[Sagomon] w/different names",
    effects: "＜Rush＞ \n[On Play] Draw 1.",
  });
  expect(
    splitInspectorPrintedText({
      text: "[Digivolve] [Sanzomon]: Cost 6 \n\n[On Play] Draw 1.\n\n[DigiXros -1] 1 card w/[Xros Heart] trait\n[Rule] Name: Also treated as [Shoutmon].",
    }),
  ).toEqual({
    requirements: "[Digivolve] [Sanzomon]: Cost 6\n[DigiXros -1] 1 card w/[Xros Heart] trait",
    effects: "[On Play] Draw 1.\n\n[Rule] Name: Also treated as [Shoutmon].",
  });
});

it("cuts a requirement line at the effect printed on the same line", () => {
  expect(
    splitInspectorPrintedText({
      text: "[Digivolve] Lv.4 w/[Numemon] in name: Cost 3＜Armor Purge＞ [On Play] Draw 1.",
    }),
  ).toEqual({
    requirements: "[Digivolve] Lv.4 w/[Numemon] in name: Cost 3",
    effects: "＜Armor Purge＞ [On Play] Draw 1.",
  });
});

it("separates translated evolution text and classifies translated timings", () => {
  expect(splitInspectorPrintedText({ text: "[进化]Lv.3：费用2\n\n[进化时]抽1张卡" })).toEqual({
    requirements: "[进化]Lv.3：费用2",
    effects: "[进化时]抽1张卡",
  });
  expect(getInspectorMarker({ text: "[攻击时]" })).toBe("attack");
  expect(getInspectorMarker({ text: "[进化时]" })).toBe("evolution");
  expect(getInspectorMarker({ text: "[Once Per Turn]" })).toBe("limit");
  expect(getInspectorMarker({ text: "[DATA SQUAD]" })).toBeUndefined();
  expect(getInspectorMarker({ text: "[Rosemon]" })).toBeUndefined();
});

it.each(["[Trash]", "[手牌]", "[废弃区]", "[养成]"])("recognizes activation zone %s", (text) => {
  expect(getInspectorMarker({ text })).toBe("timing");
});
