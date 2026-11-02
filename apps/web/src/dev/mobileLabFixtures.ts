import { Phase } from "@aegis/shared/schema/enums";
import type { LogTurnGroup } from "@/game/log/LogEntry";
/* Fixtures for the mobile components lab (/dev/mobile). Server-originated text — prompt
   sentences, choice labels, effect clauses — is not translated by the client, but the lab
   still offers pt-BR and es variants of each so the longest realistic strings can be tried on
   a phone frame. Card ids are the ones the board showcase and the arena demo already use. */

import { getCardDefinition, splitPrintedClauses, type DecisionRequest } from "@aegis/shared";
import type { Locale } from "../i18n";
import type { LogLine } from "@/game/log/LogEntry";
import type { NarrationItem } from "../game/narration";
import type { MatchNotice } from "../game/notices";
import type { TriggerDetail } from "../game/overlay";
import type { DecisionCandidate } from "../game/overlay/choice/decisionTypes";
import type { SidePanel } from "../game/sidePanels";
import { Side } from "../game/side";
import { CARDS, handEntry } from "./boardShowcaseFixtures";

/** Long enough that nothing in a specimen expires while it is being looked at. */
const READING_TIME_MS = 60 * 60 * 1000;

type Copy = Record<"en" | "pt-BR" | "es", string>;

const pick = (copy: Copy, locale: Locale) => copy[locale === "pt-BR" || locale === "es" ? locale : "en"];

const LONG_CHOICES: readonly Copy[] = [
  {
    en: "Trash the top card of your deck. Then, delete 1 of your opponent's Digimon with the lowest play cost.",
    "pt-BR":
      "Descarte a carta do topo do seu deck. Depois, delete 1 dos Digimon do seu oponente com o menor custo de jogo.",
    es: "Descarta la carta superior de tu deck. Luego, elimina 1 de los Digimon de tu oponente con el menor costo de juego.",
  },
  {
    en: "Return 1 of your opponent's Digimon with 6000 DP or less to the bottom of the deck, then your opponent adds the top card of their security stack to the hand.",
    "pt-BR":
      "Retorne 1 dos Digimon do seu oponente com 6000 DP ou menos para o fundo do deck; em seguida, seu oponente adiciona a carta do topo da pilha de segurança à mão.",
    es: "Devuelve 1 de los Digimon de tu oponente con 6000 DP o menos al fondo del deck; luego, tu oponente agrega a su mano la carta superior de su pila de seguridad.",
  },
  {
    en: "Place 1 [Chirinmon] from your hand under this Tamer as its bottom digivolution card to reduce the play cost by 3.",
    "pt-BR":
      "Coloque 1 [Chirinmon] da sua mão sob este Tamer como a carta de digivolução de baixo para reduzir o custo de jogo em 3.",
    es: "Coloca 1 [Chirinmon] de tu mano debajo de este Tamer como su carta de digievolución inferior para reducir el costo de juego en 3.",
  },
];

const LONG_CLAUSE: Copy = {
  en: "[On Play] You may choose one of the following effects. If this Digimon has 3 or more digivolution cards, you may choose both, resolving them in the printed order.",
  "pt-BR":
    "[Ao Jogar] Você pode escolher um dos efeitos a seguir. Se este Digimon tiver 3 ou mais cartas de digivolução, você pode escolher os dois, resolvendo-os na ordem impressa.",
  es: "[On Play] Puedes elegir uno de los siguientes efectos. Si este Digimon tiene 3 o más cartas de digievolución, puedes elegir ambos y resolverlos en el orden impreso.",
};

const OPTIONAL_CLAUSE: Copy = {
  en: "[When Digivolving] By suspending 1 of your Tamers, delete 1 of your opponent's Digimon with 8000 DP or less. Then, if you have 2 or more Tamers, gain 2 memory.",
  "pt-BR":
    "[Ao Digivolver] Ao suspender 1 dos seus Tamers, delete 1 dos Digimon do seu oponente com 8000 DP ou menos. Depois, se você tiver 2 ou mais Tamers, ganhe 2 de memória.",
  es: "[When Digivolving] Al suspender 1 de tus Tamers, elimina 1 de los Digimon de tu oponente con 8000 DP o menos. Luego, si tienes 2 o más Tamers, gana 2 de memoria.",
};

const TARGET_PROMPT: Copy = {
  en: "Choose 1 of your opponent's Digimon with 6000 DP or less to delete.",
  "pt-BR": "Escolha 1 dos Digimon do seu oponente com 6000 DP ou menos para deletar.",
  es: "Elige 1 de los Digimon de tu oponente con 6000 DP o menos para eliminar.",
};

const SELECT_PROMPT: Copy = {
  en: "Select up to 2 cards in your hand to trash.",
  "pt-BR": "Selecione até 2 cartas da sua mão para descartar.",
  es: "Selecciona hasta 2 cartas de tu mano para descartar.",
};

const ORDER_PROMPT: Copy = {
  en: "Place the revealed cards at the bottom of your deck in any order.",
  "pt-BR": "Coloque as cartas reveladas no fundo do seu deck em qualquer ordem.",
  es: "Coloca las cartas reveladas en el fondo de tu deck en cualquier orden.",
};

export const REJECTION_REASON: Copy = {
  en: "You cannot digivolve into this card: its digivolution requirements are not met by that Digimon.",
  "pt-BR": "Você não pode digivolver para esta carta: aquele Digimon não cumpre os requisitos de digivolução.",
  es: "No puedes digievolucionar a esta carta: ese Digimon no cumple los requisitos de digievolución.",
};

export function chooseShortDecision(): DecisionRequest {
  return {
    decisionId: "lab-choose-short",
    seat: 0,
    kind: "chooseOption",
    promptText: "Choose where the revealed card goes.",
    sourceCardId: "BT1-090",
    options: { choices: ["hand", "trash"], timing: "Main" },
  };
}

export function chooseLongDecision(locale: Locale): DecisionRequest {
  return {
    decisionId: "lab-choose-long",
    seat: 0,
    kind: "chooseOption",
    promptText: getCardDefinition("EX13-032")?.nameEn ?? "EX13-032",
    sourceCardId: "EX13-032",
    options: {
      choices: LONG_CHOICES.map((copy) => pick(copy, locale)),
      timing: "OnPlay",
      effectText: pick(LONG_CLAUSE, locale),
    },
  };
}

export function chooseRevealedDecision(): DecisionRequest {
  return {
    decisionId: "lab-choose-revealed",
    seat: 0,
    kind: "chooseOption",
    promptText: "Choose where the revealed cards go.",
    sourceCardId: CARDS.tamer,
    options: { choices: ["top", "bottom"], timing: "Main" },
  };
}

export function optionalDecision(locale: Locale): DecisionRequest {
  return {
    decisionId: "lab-optional",
    seat: 0,
    kind: "optional",
    promptText: "",
    sourceCardId: CARDS.mega,
    options: { timing: "WhenDigivolving", effectText: pick(OPTIONAL_CLAUSE, locale) },
  };
}

export function targetDecision(locale: Locale): DecisionRequest {
  return {
    decisionId: "lab-targets",
    seat: 0,
    kind: "chooseTargets",
    promptText: pick(TARGET_PROMPT, locale),
    sourceCardId: CARDS.option,
    options: {
      candidateInstanceIds: TARGET_CANDIDATES.map((candidate) => candidate.instanceId),
      min: 1,
      max: 1,
      timing: "Main",
      targetFate: "delete",
    },
  };
}

export function selectDecision(locale: Locale): DecisionRequest {
  return {
    decisionId: "lab-select",
    seat: 0,
    kind: "selectCards",
    promptText: pick(SELECT_PROMPT, locale),
    sourceCardId: CARDS.ultimate,
    options: {
      candidateInstanceIds: SELECT_CANDIDATES.map((candidate) => candidate.instanceId),
      min: 0,
      max: 2,
      timing: "OnPlay",
    },
  };
}

export function orderCardsDecision(locale: Locale): DecisionRequest {
  return {
    decisionId: "lab-order-cards",
    seat: 0,
    kind: "orderCards",
    promptText: pick(ORDER_PROMPT, locale),
    sourceCardId: CARDS.tamer,
    options: {
      candidateInstanceIds: ORDER_CANDIDATES.map((candidate) => candidate.instanceId),
      min: ORDER_CANDIDATES.length,
      max: ORDER_CANDIDATES.length,
      orderDestination: "deckBottom",
    },
  };
}

export const TRIGGER_CARD_IDS = ["EX12-064", CARDS.champion, CARDS.ultimate] as const;

export function orderTriggersDecision(): DecisionRequest {
  return {
    decisionId: "lab-order-triggers",
    seat: 0,
    kind: "orderTriggers",
    promptText: "Choose one effect to activate",
    options: {
      triggerKeys: TRIGGER_CARD_IDS.map((cardId, index) => `p-you-${index}-top::${cardId}/ir-${index}-0`),
      triggerCardIds: [...TRIGGER_CARD_IDS],
      triggerTimings: ["OnPlay", "WhenDigivolving", "WhenDigivolving"],
      timing: "OnPlay",
    },
  };
}

export const TRIGGER_DETAILS: readonly TriggerDetail[] = [
  { sourceLabel: "Field", summary: "Delete 1 of your opponent's level 4 or lower Digimon…" },
  {
    sourceLabel: "Inherited by Omnimon",
    hostCardId: "BT1-084",
    summary: "Draw 1 card, then trash 1 card in your hand.",
  },
  { sourceLabel: "Field (copy 2)", summary: "Return 1 of your opponent's Digimon with 5000 DP or less to the hand." },
];

/** UlforceVeedramon's [When Digivolving] clauses, the choice Rina Shinomiya activates one of. */
export function effectChoiceDecision(): DecisionRequest {
  const effects = ["EX13-023", "BT11-032", "BT22-025"].flatMap((cardId) =>
    splitPrintedClauses(getCardDefinition(cardId)?.effectText ?? "")
      .filter((clause) => clause.labels.has("When Digivolving"))
      .map((clause) => ({ cardId, clause: clause.text })),
  );
  const rinaText = getCardDefinition("BT11-112")?.effectText ?? "";
  return {
    decisionId: "lab-effect-choice",
    seat: 0,
    kind: "chooseOption",
    sourceCardId: "BT11-112",
    promptText: "Rina Shinomiya",
    options: {
      choices: effects.map((effect) => effect.clause),
      choiceEffects: effects.map((effect) => ({ cardId: effect.cardId, timing: "WhenDigivolving" })),
      timing: "Static",
      effectText: rinaText.slice(rinaText.indexOf("[All Turns]"), rinaText.indexOf("[Your Turn]")),
    },
  };
}

export const TARGET_CANDIDATES: DecisionCandidate[] = [
  { instanceId: "opp-1", cardId: CARDS.opponentChampion, selectable: true, currentDP: 4000, zone: "opponentBattle" },
  {
    instanceId: "opp-2",
    cardId: CARDS.opponentUltimate,
    selectable: false,
    currentDP: 7000,
    isSuspended: true,
    zone: "opponentBattle",
  },
  { instanceId: "opp-3", cardId: "BT26-069", selectable: true, currentDP: 5000, zone: "opponentBattle" },
  {
    instanceId: "opp-4",
    cardId: "BT26-059",
    selectable: true,
    currentDP: 6000,
    sourceCount: 4,
    zone: "opponentBattle",
  },
];

export const SELECT_CANDIDATES: DecisionCandidate[] = [
  CARDS.rookie,
  CARDS.champion,
  CARDS.tamer,
  CARDS.option,
  CARDS.ultimate,
  CARDS.mega,
  "BT26-009",
  "BT26-011",
].map((cardId, index) => ({ instanceId: `hand-${index}`, cardId, selectable: true, zone: "hand" }));

export const ORDER_CANDIDATES: DecisionCandidate[] = [CARDS.champion, CARDS.option, CARDS.mega].map(
  (cardId, index) => ({ instanceId: `reveal-${index}`, cardId }),
);

export const REVEALED_CANDIDATES: DecisionCandidate[] = [CARDS.champion, CARDS.tamer].map((cardId, index) => ({
  instanceId: `revealed-${index}`,
  cardId,
}));

export const PHONE_HAND = [CARDS.rookie, CARDS.champion, CARDS.tamer, CARDS.option, CARDS.ultimate, CARDS.mega].map(
  (cardId, index) => handEntry({ index, cardId, playable: index % 2 === 0 }),
);

export const FULL_HAND = Array.from({ length: 10 }, (_, index) =>
  handEntry({
    index,
    cardId: Object.values(CARDS)[index % Object.values(CARDS).length]!,
    playable: index % 3 === 0,
  }),
);

function notice(
  id: string,
  body: MatchNotice["body"],
  overrides: Partial<MatchNotice> = {},
): { id: string; notice: MatchNotice } {
  return { id, notice: { id, side: Side.Viewer, fromSecurity: false, body, createdAt: Date.now(), ...overrides } };
}

function panel({
  id,
  titleKey,
  side = Side.Viewer,
  cardIds,
  ordered = false,
}: {
  id: string;
  titleKey: SidePanel["titleKey"];
  side?: Side;
  cardIds: readonly string[];
  ordered?: boolean;
}): SidePanel {
  return {
    id,
    titleKey,
    side,
    cards: cardIds.map((cardId, index) => ({ cardId, badge: index + 1 })),
    ordered,
    createdAt: Date.now(),
  };
}

function narrationItem(fields: Omit<NarrationItem, "batchId" | "createdAt" | "lifetimeMs">): NarrationItem {
  return { batchId: "lab-batch", createdAt: Date.now(), lifetimeMs: READING_TIME_MS, ...fields };
}

export const WIZARDMON_CLAUSE =
  "[End of Your Turn] If you have a blue or yellow Digimon, by returning this Digimon to the bottom of the deck, you may play 1 red or blue [Iliad] trait Digimon card from your trash with the cost reduced by 4.";

export function effectNarration(): NarrationItem {
  const { id, notice: effect } = notice("lab-effect", {
    variant: "effect",
    cardId: "BT26-067",
    timing: "EndOfYourTurn",
    description: WIZARDMON_CLAUSE,
  });
  return narrationItem({ id, side: Side.Viewer, notice: effect });
}

export function queuedNarration(): NarrationItem[] {
  const deletion = notice(
    "lab-deletion",
    { variant: "deletion", cards: [{ cardId: CARDS.opponentChampion }, { cardId: CARDS.opponentUltimate }] },
    { side: Side.Opponent },
  );
  const keyword = notice("lab-keyword", { variant: "keyword", keyword: "digiXros", cardId: CARDS.mega });
  const opponentEffect = notice(
    "lab-opp-effect",
    {
      variant: "effect",
      cardId: CARDS.opponentUltimate,
      timing: "WhenDigivolving",
      description: "[When Digivolving] Delete 1 of your opponent's Digimon with 5000 DP or less. Then, draw 1 card.",
    },
    { side: Side.Opponent },
  );
  return [
    effectNarration(),
    narrationItem({
      id: "lab-revealed",
      side: Side.Opponent,
      panel: panel({
        id: "lab-revealed",
        titleKey: "panel.revealedCards",
        side: Side.Opponent,
        cardIds: [CARDS.opponentChampion, CARDS.opponentUltimate, CARDS.egg],
        ordered: true,
      }),
    }),
    narrationItem({ id: deletion.id, side: Side.Opponent, notice: deletion.notice }),
    narrationItem({ id: keyword.id, side: Side.Viewer, notice: keyword.notice }),
    narrationItem({ id: opponentEffect.id, side: Side.Opponent, notice: opponentEffect.notice }),
  ];
}

export function rejectionNotice(locale: Locale): MatchNotice {
  return notice("lab-rejection", { variant: "rejection", reason: pick(REJECTION_REASON, locale) }).notice;
}

export const NOTICE_SAMPLES: { label: string; notice: () => MatchNotice }[] = [
  {
    label: "viewer effect, long clause",
    notice: () =>
      notice("n-effect", {
        variant: "effect",
        cardId: "BT26-067",
        timing: "EndOfYourTurn",
        description: WIZARDMON_CLAUSE,
      }).notice,
  },
  {
    label: "security effect",
    notice: () =>
      notice(
        "n-security",
        {
          variant: "effect",
          cardId: CARDS.mega,
          timing: "Security",
          description: "[Security] Play this card without paying its memory cost.",
        },
        { fromSecurity: true, side: Side.Opponent },
      ).notice,
  },
  {
    label: "keyword call-out",
    notice: () => notice("n-keyword", { variant: "keyword", keyword: "armorPurge", cardId: CARDS.ultimate }).notice,
  },
  { label: "recovery", notice: () => notice("n-recovery", { variant: "recovery", amount: 2 }).notice },
];

export function trashedPanel(): SidePanel {
  return panel({
    id: "lab-trashed",
    titleKey: "panel.trashedCards",
    cardIds: [CARDS.rookie, CARDS.option, CARDS.champion, CARDS.tamer],
  });
}

export function revealedPanel(): SidePanel {
  return panel({
    id: "lab-revealed-five",
    titleKey: "panel.revealedCards",
    side: Side.Opponent,
    cardIds: [CARDS.opponentChampion, CARDS.opponentUltimate, CARDS.egg, CARDS.rookie, CARDS.mega],
    ordered: true,
  });
}

export function deletedPanel(): SidePanel {
  return panel({
    id: "lab-deleted",
    titleKey: "panel.deletedCards",
    side: Side.Opponent,
    cardIds: [CARDS.opponentUltimate],
  });
}

const cardName = (cardId: string) => getCardDefinition(cardId)?.nameEn ?? cardId;

export const LAB_LOG: LogLine[] = [
  { text: `You played ${cardName(CARDS.rookie)}.`, kind: "you", cardIds: [CARDS.rookie] },
  {
    text: `Opponent digivolved into ${cardName(CARDS.opponentUltimate)}.`,
    kind: "opp",
    cardIds: [CARDS.opponentUltimate],
  },
  { text: "Memory moved from -2 to +4.", kind: "sys" },
  {
    text: `${cardName("BT26-067")}'s [End of Your Turn] effect returned it to the bottom of the deck and played a Digimon from the trash with the cost reduced by 4.`,
    kind: "you",
    cardIds: ["BT26-067"],
  },
  { text: `Security check revealed ${cardName(CARDS.rookie)}.`, kind: "sys", cardIds: [CARDS.rookie] },
];

export const LAB_LOG_TURNS: readonly LogTurnGroup[] = [
  {
    turnCount: 1,
    turnSeat: 0,
    phases: [
      {
        phase: Phase.Main,
        entries: [...LAB_LOG]
          .reverse()
          .map((line, index) => ({ ...line, id: `fixture-${index}`, turnCount: 1, turnSeat: 0, phase: Phase.Main })),
      },
    ],
  },
];
