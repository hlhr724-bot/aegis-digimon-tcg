import { CardKind } from "@aegis/shared/schema/enums";
import type { Candidate } from "#api/bot/candidates";
import type { TrainingAction } from "#api/bot/training/actions";
import type { BotView } from "#api/bot/view";

type Params = { view: BotView; action: TrainingAction };

export function projectMainActionCandidate({ view, action }: Params): Candidate | undefined {
  const intent = action.intent;
  const common = { intent, key: JSON.stringify(intent), cost: action.projectedCost ?? 0 };
  if (intent.type === "endPhase") return { ...common, kind: "endPhase" };
  if (intent.type === "activateEffect") return { ...common, kind: "activateEffect" };
  if (intent.type === "attack") {
    const attacker = view.board.find((unit) => unit.permanentId === intent.attackerPermanentId);
    if (intent.target.kind === "player") return { ...common, kind: "attackPlayer", attacker };
    const targetId = intent.target.permanentId;
    return {
      ...common,
      kind: "attackDigimon",
      attacker,
      target: view.opponentBoard.find((unit) => unit.permanentId === targetId),
    };
  }
  if (intent.type === "digivolve" || intent.type === "appFusion") {
    const base = [...view.board, ...(view.breeding ? [view.breeding] : [])].find(
      (unit) => unit.permanentId === intent.permanentId,
    );
    return {
      ...common,
      kind: "digivolve",
      base,
      definition: view.hand.find((card) => card.instanceId === intent.instanceId)?.definition,
    };
  }
  if (intent.type === "dnaDigivolve") {
    return {
      ...common,
      kind: "dnaDigivolve",
      definition: view.hand.find((card) => card.instanceId === intent.instanceId)?.definition,
      materials: view.board.filter((unit) => intent.materialPermanentIds.includes(unit.permanentId)),
    };
  }
  if (intent.type === "linkCard") {
    const source = view.board.find((unit) => unit.topCardInstanceId === intent.instanceId);
    return {
      ...common,
      kind: "linkCard",
      base: view.board.find((unit) => unit.permanentId === intent.targetPermanentId),
      definition: view.hand.find((card) => card.instanceId === intent.instanceId)?.definition ?? source?.definition,
    };
  }
  if (intent.type === "playCard") {
    const definition = view.hand.find((card) => card.instanceId === intent.instanceId)?.definition;
    if (!definition) return undefined;
    let kind: Candidate["kind"] | undefined;
    if (definition.kinds.includes(CardKind.Option)) {
      kind = "playOption";
    } else if (definition.kinds.includes(CardKind.Digimon)) {
      kind = "playDigimon";
    } else if (definition.kinds.includes(CardKind.Tamer)) {
      kind = "playTamer";
    }
    return kind ? { ...common, kind, definition } : undefined;
  }
  return undefined;
}
