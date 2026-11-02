import { expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { catalogStoryBattles } from "@aegis/shared/story/catalogStoryBattles";
import { getStoryBotPersona } from "#api/story/getStoryBotPersona";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";

function getPersona(battleId: string) {
  return getStoryBotPersona({ battleId, fixture: getStoryScenario(battleId)! });
}

it.each([
  ["galacticmon-rematch", "zenith"],
  ["world-championship-finals", "owen-dreadnought"],
  ["pyramidimon", "close"],
  ["dw1-028", "analogman"],
])("gives %s the named character persona %s", (battleId, personaId) => {
  expect(getPersona(battleId)?.id).toBe(personaId);
});

it("gives Yggdrasil the King Drasil persona even when the deck holds it only as a Digi-Egg", () => {
  expect(getPersona("sa06")?.displayName).toBe("King Drasil_7D6");
});

it("does not take a Digimon from inside a longer opponent name", () => {
  expect(getPersona("fr03")?.displayName).not.toBe("Seraphimon");
});

it("does not match a character from part of a Digimon name", () => {
  expect(getPersona("dw1-024")?.id).not.toBe("ai-and-mako");
});

it("uses the named opponent Digimon from the opponent deck when no character matches", () => {
  const persona = getPersona("dw1-001")!;
  expect(persona.id).toMatch(/^digimon:/);
  expect(getCardDefinition(persona.portraitCardId!)?.nameEn).toBe("Agumon");
});

it("falls back to the opponent's starting Digimon whenever the deck lacks the named one", () => {
  let checked = 0;
  for (const battle of catalogStoryBattles.filter((entry) => entry.playable)) {
    const fixture = getStoryScenario(battle.id)!;
    const permanent = fixture.board[1]!.battleArea?.[0];
    const persona = getStoryBotPersona({ battleId: battle.id, fixture })!;
    const named = getCardDefinition(persona.portraitCardId ?? "")?.nameEn ?? "";
    const spaced = (text: string) =>
      ` ${text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()} `;
    const inDeck = getStorySeatDeck({ fixture, seat: 1 }).mainDeck.includes(persona.portraitCardId ?? "");
    if (
      !permanent ||
      !persona.id.startsWith("digimon:") ||
      !inDeck ||
      spaced(battle.opponent).includes(spaced(named))
    ) {
      continue;
    }
    checked++;
    expect(persona.portraitCardId).toBe(typeof permanent === "string" ? permanent : permanent.card);
  }
  expect(checked).toBeGreaterThan(0);
});
