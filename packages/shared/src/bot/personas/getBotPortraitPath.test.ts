import { expect, it } from "vitest";
import { botPersonaById } from "#shared/bot/personas/botPersonaById";
import { getBotPortraitPath } from "#shared/bot/personas/getBotPortraitPath";

it("keeps character portraits at their persona id", () => {
  expect(getBotPortraitPath({ persona: botPersonaById("zenith")! })).toBe("/assets/bot-portraits/zenith.webp");
});

it("shares one Digimon portrait across printings by slugging the Digimon name", () => {
  expect(getBotPortraitPath({ persona: { id: "digimon:BT1-010", displayName: "Agumon" } })).toBe(
    "/assets/bot-portraits/digimon/agumon.webp",
  );
  expect(getBotPortraitPath({ persona: { id: "digimon:BT10-112", displayName: "Gallantmon: Crimson Mode" } })).toBe(
    "/assets/bot-portraits/digimon/gallantmon-crimson-mode.webp",
  );
  expect(getBotPortraitPath({ persona: { id: "digimon:EX4-001", displayName: "Agumon (X Antibody)" } })).toBe(
    "/assets/bot-portraits/digimon/agumon-x-antibody.webp",
  );
});
