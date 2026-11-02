import { Phase } from "@aegis/shared";
import { expect, it } from "vitest";
import { translator } from "../i18n";
import { describeEvent } from "./matchLog";
import { turnControlLabelKey } from "./turnControl";

it.each(["en", "pt-BR"] as const)("#4990 does not describe legacy End markers as a phase (%s)", (locale) => {
  const t = translator(locale);
  expect(
    describeEvent({
      event: { kind: "phaseChanged", phase: Phase.End, turnSeat: 0, turnCount: 1 },
      viewerSeat: 0,
      identities: new Map(),
      t: t,
    }),
  ).toBeNull();
  const closed = describeEvent({
    event: { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 1 },
    viewerSeat: 0,
    identities: new Map(),
    t: t,
  });
  expect(closed?.text).toBe(t("log.turnEnded", { player: t("game.you"), nextPlayer: t("game.opponent") }));
});

it.each(["en", "pt-BR"] as const)("#4990 the Main control passes the turn (%s)", (locale) => {
  expect(translator(locale)(turnControlLabelKey("endTurn"))).toBe(locale === "en" ? "End turn" : "Encerrar turno");
});
