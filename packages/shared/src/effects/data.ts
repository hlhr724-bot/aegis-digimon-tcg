import type { CompiledCard, CompiledEffects } from "./ir/card.js";
import type { AppFusionRequirement, AssemblyRequirement, DnaDigivolveRequirement } from "./ir/requirements/fusion.js";
import type { BaseGrantedDigivolve, DigivolutionRequirement } from "./ir/requirements/digivolve.js";
import type { DigiXrosRequirement } from "./ir/requirements/xrosLink.js";
import effectsJson from "./effects.json" with { type: "json" };
import generatedDigivolveOverridesJson from "./generated-digivolve-overrides.json" with { type: "json" };

/** Runtime effect records keyed by card id. Card modules remain authoritative. */
export const compiledEffects: CompiledEffects = effectsJson as unknown as CompiledEffects;

/** Compiled records whose complete hand-authored runtime modules normalize stale residual metadata. */
export const HAND_AUTHORED_COVERAGE_OVERRIDES: ReadonlySet<string> = new Set([
  "EX4-021",
  "EX4-030",
  "EX4-036",
  "EX4-037",
  "EX4-049",
  "EX4-051",
  "EX4-059",
  "EX4-060",
  "EX4-062",
  "EX4-068",
  "EX4-069",
  "EX4-072",
  "EX4-073",
  "EX6-001",
  "EX6-010",
  "EX6-030",
  "EX6-057",
  "EX6-059",
  "EX6-060",
  "EX6-068",
  "EX6-069",
  "EX6-070",
  "EX6-071",
  "EX6-073",
  "BT4-030",
  "BT4-095",
  "BT4-096",
  "BT4-098",
]);

/** BT26 is hand-authored while generated effect records are absent. */
export const ASSEMBLY_REQUIREMENT_OVERRIDES: Record<string, AssemblyRequirement[]> = {
  // EX9-074: printed Assembly uses seven differently named level-four DM Digimon.
  "EX9-074": [
    { reduceCost: 7, materials: [{ count: 7, level: 4, traits: ["DM"], kinds: ["Digimon"], differentNames: true }] },
  ],
  // EX12-031: one Lv.4-or-lower card with [Aqua]/[Sea Animal] in any trait OR [TB].
  "EX12-031": [
    {
      reduceCost: 2,
      materials: [
        {
          count: 1,
          nameOrTrait: [
            { tokens: ["Aqua", "Sea Animal"], match: "traitContains" },
            { tokens: ["TB"], match: "trait" },
          ],
          levelMax: 4,
        },
      ],
    },
  ],
  "EX12-035": [
    {
      reduceCost: 6,
      materials: [
        {
          count: 1,
          level: 5,
          nameOrTrait: [
            { tokens: ["Gabumon", "Garurumon"], match: "name" },
            { tokens: ["ME", "VB"], match: "trait" },
          ],
        },
        {
          count: 1,
          level: 4,
          nameOrTrait: [
            { tokens: ["Gabumon", "Garurumon"], match: "name" },
            { tokens: ["ME", "VB"], match: "trait" },
          ],
        },
        {
          count: 1,
          level: 3,
          nameOrTrait: [
            { tokens: ["Gabumon", "Garurumon"], match: "name" },
            { tokens: ["ME", "VB"], match: "trait" },
          ],
        },
      ],
    },
  ],
  "BT26-014": [{ reduceCost: 2, materials: [{ traits: ["TB"], levelMax: 4, count: 1 }] }],
  "BT26-017": [{ reduceCost: 4, materials: [{ traits: ["Shambala"], levelMax: 5, count: 2, differentLevels: true }] }],
  "BT26-028": [
    {
      reduceCost: 2,
      materials: [{ kinds: ["Digimon"], traits: ["Life", "System", "Seven Code"], level: 3, count: 1 }],
    },
  ],
  "BT26-037": [
    {
      reduceCost: 2,
      materials: [{ kinds: ["Digimon"], traits: ["Navi", "System", "Seven Code"], level: 3, count: 1 }],
    },
  ],
  "BT26-047": [
    {
      reduceCost: 6,
      materials: [{ kinds: ["Digimon"], traits: ["Larva", "Insectoid", "Titan"], count: 4, differentLevels: true }],
    },
  ],
  "BT26-073": [
    {
      reduceCost: 2,
      materials: [
        {
          kinds: ["Digimon"],
          nameOrTrait: [
            { tokens: ["Chronomon"], match: "text" },
            { tokens: ["TS"], match: "trait" },
          ],
          levelMax: 4,
          count: 1,
        },
      ],
    },
  ],
  "BT26-079": [{ reduceCost: 2, materials: [{ namesExact: ["Plutomon"], count: 1 }] }],
  "BT26-081": [{ reduceCost: 5, materials: [{ namesExact: ["Minervamon"], count: 1 }] }],
  "BT26-083": [{ reduceCost: 4, materials: [{ namesExact: ["Junomon"], count: 1 }] }],
  "BT26-085": [
    {
      reduceCost: 5,
      materials: [
        {
          nameOrTrait: [
            { tokens: ["Chronomon"], match: "text" },
            { tokens: ["Shaman"], match: "trait" },
          ],
          count: 5,
          differentLevels: true,
        },
      ],
    },
  ],
  "BT26-086": [
    { reduceCost: 7, materials: [{ kinds: ["Digimon"], traits: ["Seven Code"], count: 7, differentNames: true }] },
  ],
};

/** BT26 App Fusion headers are absent from the historical compiled effects artifact. */
export const APP_FUSION_REQUIREMENT_OVERRIDES: Record<string, AppFusionRequirement[]> = {
  "BT26-028": [{ names: ["Aidmon", "Supplemon", "Spamon"], cost: 0 }],
  "BT26-037": [{ names: ["Weathermon", "Rocketmon", "Newsmon"], cost: 0 }],
};

/** Look up the compiled IR record for a card id, or undefined when absent. */
export function getCompiledCard(cardId: string): CompiledCard | undefined {
  const compiled = compiledEffects[cardId];
  if (compiled === undefined || !HAND_AUTHORED_COVERAGE_OVERRIDES.has(cardId)) return compiled;
  return { ...compiled, coverage: "full", residual: [] };
}

/**
 * Hand-authored DNA requirements missing from the historical aggregate. BT8-015's card-data
 * text starts at [When Digivolving] and omits its printed DNA header, while its audited runtime
 * module correctly carries the red Lv.4 + yellow Lv.4 recipe. An override REPLACES the compiled
 * record, so a stale entry here silently hides a corrected card module: prefer the module.
 * This shared override keeps server cost validation/payment and client material highlighting on
 * one source of truth.
 */
export const DNA_DIGIVOLUTION_REQUIREMENT_OVERRIDES: Record<string, DnaDigivolveRequirement[]> = {
  // EX12-017 prints Red/Yellow Lv.5 + Black/Purple Lv.5: expand the color alternatives
  // into the four concrete material pairings consumed by the server legality seam.
  "EX12-017": [
    {
      cost: 0,
      materials: [
        { color: "Red", level: 5 },
        { color: "Black", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Red", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Black", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
  ],
  // EX12-028 prints Blue/Purple Lv.4 + Black/Yellow Lv.4: expand the color alternatives
  // into the four concrete material pairings consumed by the server legality seam.
  "EX12-028": [
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 4 },
        { color: "Black", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 4 },
        { color: "Yellow", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Purple", level: 4 },
        { color: "Black", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Purple", level: 4 },
        { color: "Yellow", level: 4 },
      ],
    },
  ],
  // EX12-032 prints Blue/Yellow Lv.4 + Purple/Red Lv.4: expand the color alternatives
  // into the four concrete material pairings consumed by the server legality seam.
  "EX12-032": [
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 4 },
        { color: "Purple", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 4 },
        { color: "Red", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Purple", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Red", level: 4 },
      ],
    },
  ],
  "EX12-035": [
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 5 },
        { color: "Yellow", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Black", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Black", level: 5 },
        { color: "Yellow", level: 5 },
      ],
    },
  ],
  "EX12-037": [
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 6 },
        { color: "Red", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 6 },
        { color: "Black", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Red", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Black", level: 6 },
      ],
    },
  ],
  "EX12-044": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Green", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Black", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 4 },
        { color: "Green", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 4 },
        { color: "Black", level: 4 },
      ],
    },
  ],
  // EX12-055 prints Black/Purple Lv.4 + Red/Yellow Lv.4: expand the color alternatives
  // into the four concrete material pairings consumed by the server legality seam.
  "EX12-055": [
    {
      cost: 0,
      materials: [
        { color: "Black", level: 4 },
        { color: "Red", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Black", level: 4 },
        { color: "Yellow", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Purple", level: 4 },
        { color: "Red", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Purple", level: 4 },
        { color: "Yellow", level: 4 },
      ],
    },
  ],
  "EX9-045": [
    {
      cost: 0,
      materials: [
        { color: "Green", level: 6 },
        { color: "Blue", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Green", level: 6 },
        { color: "Purple", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Blue", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Purple", level: 6 },
      ],
    },
  ],
  "BT8-015": [
    {
      cost: 0,
      materials: [
        { color: "Red", level: 4 },
        { color: "Yellow", level: 4 },
      ],
    },
  ],
  "BT8-042": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Blue", level: 4 },
      ],
    },
  ],
  // Backfilled 2026-09-06 from the community card DB's `dnaDigivolve` header
  // (TakaOtaku/Digimon-Card-App), which the pre-EX9 imports dropped. Each entry transcribes the
  // printed [DNA Digivolve] line; a slashed color list ("Blue/Yellow Lv.5") expands into one
  // requirement per color pair, because a material spec holds a single color.
  // See docs/engine/dna-digivolve-into-filter.md.
  // Paildramon — [DNA Digivolve] Blue Lv.4 + Green Lv.4
  "AD1-011": [
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 4 },
        { color: "Green", level: 4 },
      ],
    },
  ],
  // Omnimon — [DNA Digivolve] Lv.6 w/[Greymon] in name + Lv.6 w/[Garurumon] in name
  "AD1-025": [
    {
      cost: 0,
      materials: [
        { level: 6, names: ["Greymon"] },
        { level: 6, names: ["Garurumon"] },
      ],
    },
  ],
  // Paildramon — [DNA Digivolve] Red Lv.4 + Purple Lv.4
  "BT20-016": [
    {
      cost: 0,
      materials: [
        { color: "Red", level: 4 },
        { color: "Purple", level: 4 },
      ],
    },
  ],
  // Jesmon GX — [DNA Digivolve] Lv.6 w/[Jesmon] in name + Lv.6 w/[Gankoomon] in name
  "BT20-021": [
    {
      cost: 0,
      materials: [
        { level: 6, names: ["Jesmon"] },
        { level: 6, names: ["Gankoomon"] },
      ],
    },
  ],
  // Chaosmon: Valdur Arm — [DNA Digivolve] Yellow Lv.6 + Green/Black Lv.6
  "BT20-037": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Green", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Black", level: 6 },
      ],
    },
  ],
  // Examon — [DNA Digivolve] Green Lv.6 + Blue Lv.6
  "BT20-045": [
    {
      cost: 0,
      materials: [
        { color: "Green", level: 6 },
        { color: "Blue", level: 6 },
      ],
    },
  ],
  // Alphamon: Ouryuken — [DNA Digivolve] Black Lv.6 + Yellow/Red Lv.6
  "BT20-060": [
    {
      cost: 0,
      materials: [
        { color: "Black", level: 6 },
        { color: "Yellow", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Black", level: 6 },
        { color: "Red", level: 6 },
      ],
    },
  ],
  // Dinobeemon — [DNA Digivolve] Purple Lv.4 + Red Lv.4
  "BT20-074": [
    {
      cost: 0,
      materials: [
        { color: "Purple", level: 4 },
        { color: "Red", level: 4 },
      ],
    },
  ],
  // Imperialdramon: Dragon Mode — [DNA Digivolve] Purple Lv.5 + Red Lv.5
  "BT20-076": [
    {
      cost: 0,
      materials: [
        { color: "Purple", level: 5 },
        { color: "Red", level: 5 },
      ],
    },
  ],
  // Gryphonmon — [DNA Digivolve] Blue/Yellow Lv.5 + Green/Red Lv.5
  "BT21-039": [
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 5 },
        { color: "Green", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 5 },
        { color: "Red", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Green", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Red", level: 5 },
      ],
    },
  ],
  // Omnimon — [DNA Digivolve] Lv.6 w/[Greymon] in name + Lv.6 w/[Garurumon] in name
  "BT22-015": [
    {
      cost: 0,
      materials: [
        { level: 6, names: ["Greymon"] },
        { level: 6, names: ["Garurumon"] },
      ],
    },
  ],
  // Shakkoumon — [DNA Digivolve] Yellow Lv.4 + Black/Blue Lv. 4
  "BT23-032": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Black", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Blue", level: 4 },
      ],
    },
  ],
  // Examon — [DNA Digivolve] Green Lv.6 + Blue Lv.6
  "BT23-047": [
    {
      cost: 0,
      materials: [
        { color: "Green", level: 6 },
        { color: "Blue", level: 6 },
      ],
    },
  ],
  // Mastemon — [DNA Digivolve] Yellow Lv.5 + Purple Lv.5
  "BT23-102": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
  ],
  // Shakkoumon — [DNA Digivolve] Yellow Lv.4 + Blue/Black Lv. 4
  "BT25-038": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Blue", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Black", level: 4 },
      ],
    },
  ],
  // GraceNovamon — [DNA Digivolve] Red Lv.6 + Blue Lv.6
  "BT25-103": [
    {
      cost: 0,
      materials: [
        { color: "Red", level: 6 },
        { color: "Blue", level: 6 },
      ],
    },
  ],
  // Kimeramon — [DNA Digivolve] Lv.4 + Lv.4
  "BT8-084": [
    {
      cost: 0,
      materials: [{ level: 4 }, { level: 4 }],
    },
  ],
  // RagnaLoardmon — [DNA Digivolve] Red Lv.6 + Black Lv.6
  "EX6-011": [
    {
      cost: 0,
      materials: [
        { color: "Red", level: 6 },
        { color: "Black", level: 6 },
      ],
    },
  ],
  // Mastemon — [DNA Digivolve] Yellow Lv.5 + Purple Lv.5
  "EX6-029": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
  ],
  // UltimateChaosmon — [DNA Digivolve] Yellow/Black Lv.6 + Green/Purple Lv.6
  "EX6-062": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Green", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Purple", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Black", level: 6 },
        { color: "Green", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Black", level: 6 },
        { color: "Purple", level: 6 },
      ],
    },
  ],
  // Tlalocmon — [DNA Digivolve] Green/Yellow Lv.6 + Black/Blue Lv.6
  "EX7-037": [
    {
      cost: 0,
      materials: [
        { color: "Green", level: 6 },
        { color: "Black", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Green", level: 6 },
        { color: "Blue", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Black", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Blue", level: 6 },
      ],
    },
  ],
  // Whamon — [DNA Digivolve] Blue Lv.4 + Black/Purple Lv.4
  "EX8-025": [
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 4 },
        { color: "Black", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 4 },
        { color: "Purple", level: 4 },
      ],
    },
  ],
  // Pumpkinmon — [DNA Digivolve] Yellow Lv.4 + Purple/Red Lv.4
  "EX8-033": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Purple", level: 4 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 4 },
        { color: "Red", level: 4 },
      ],
    },
  ],
  // Callismon — [DNA Digivolve] Green/Purple Lv.5 + Red/Yellow Lv.5
  "EX8-045": [
    {
      cost: 0,
      materials: [
        { color: "Green", level: 5 },
        { color: "Red", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Green", level: 5 },
        { color: "Yellow", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Purple", level: 5 },
        { color: "Red", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Purple", level: 5 },
        { color: "Yellow", level: 5 },
      ],
    },
  ],
  // Pukumon — [DNA Digivolve] Blue/Black Lv.5 + Purple Lv.5
  "P-171": [
    {
      cost: 0,
      materials: [
        { color: "Blue", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Black", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
  ],
  // Magnadramon — [DNA Digivolve] Yellow/Red Lv.5 + Green/Black Lv.5
  "P-172": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Green", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Black", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Red", level: 5 },
        { color: "Green", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Red", level: 5 },
        { color: "Black", level: 5 },
      ],
    },
  ],
  // Boltmon — [DNA Digivolve] Black/Yellow Lv.5 + Purple/Red Lv.5
  "P-174": [
    {
      cost: 0,
      materials: [
        { color: "Black", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Black", level: 5 },
        { color: "Red", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Purple", level: 5 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 5 },
        { color: "Red", level: 5 },
      ],
    },
  ],
  // Mastemon — [DNA Digivolve] Purple Lv.5 + Yellow Lv.5
  "P-187": [
    {
      cost: 0,
      materials: [
        { color: "Purple", level: 5 },
        { color: "Yellow", level: 5 },
      ],
    },
  ],
  // BT18-019 Millenniummon — [DNA Digivolve] [Kimeramon] + [Machinedramon]
  // The generated record historically misread this named route as Red Lv.5 + Black Lv.6.
  "BT18-019": [
    {
      cost: 0,
      materials: [{ namesExact: ["Kimeramon"] }, { namesExact: ["Machinedramon"] }],
    },
  ],
  // Chaosmon — [DNA Digivolve] Yellow Lv.6 + Purple/Black Lv.6
  "P-221": [
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Purple", level: 6 },
      ],
    },
    {
      cost: 0,
      materials: [
        { color: "Yellow", level: 6 },
        { color: "Black", level: 6 },
      ],
    },
  ],
};

export function dnaDigivolutionRequirementsFor(cardId: string): DnaDigivolveRequirement[] {
  return DNA_DIGIVOLUTION_REQUIREMENT_OVERRIDES[cardId] ?? compiledEffects[cardId]?.dnaDigivolveRequirement ?? [];
}

/**
 * Hand-authored alternate-digivolution-requirement overrides, keyed by the EVOLVING card id.
 * When present, the list REPLACES the requirement the generator compiled into effects.json:
 * the compiler can't express the Tamer-base gate (`baseIsTamer`) or the non-memory
 * `placementCost` some alternate paths need, and its gateless `{cost, isAlternate}` would
 * over-match every base. Kept in @aegis/shared so the SERVER (digivolve legality + cost) and
 * the CLIENT (digivolve-target highlighting + cost labels) read ONE source of truth.
 */
export const ALTERNATE_DIGIVOLUTION_OVERRIDES: Record<string, DigivolutionRequirement[]> = {
  // BT18-101's bracketed [Lucemon: Chaos Mode] source is an exact card name;
  // retain that exactness in the shared legality/highlighting source while the generated
  // effects.json record remains read-only and historically used a substring `names` gate.
  "BT18-101": [{ namesExact: ["Lucemon: Chaos Mode"], cost: 6, isAlternate: true }],
  // BT12-012: the Takuya clause treats that Tamer as a level 3 red Digimon, so it uses
  // Agunimon's ordinary red Lv.3 cost 2. The generated record incorrectly assigned cost 0.
  "BT12-012": [
    { names: ["BurningGreymon"], cost: 1, isAlternate: true },
    { names: ["Takuya Kanbara"], cost: 2, isAlternate: true, baseIsTamer: true },
  ],
  // BT24-059: "[Aqua] or [Sea Animal] in any trait" is substring matching, not exact traits.
  "BT24-059": [
    { level: 4, traitSubstrings: ["Aqua", "Sea Animal"], cost: 3, isAlternate: true },
    { level: 4, traits: ["TS"], cost: 3, isAlternate: true },
  ],
  // BT19-102: the bracketed [Luminamon]/[Nene Amano] paths are exact names; the Nene path
  // also requires the exact [Shademon] name under that Tamer (minNameStackNames is exact).
  "BT19-102": [
    { namesExact: ["Luminamon"], cost: 2, isAlternate: true },
    {
      namesExact: ["Nene Amano"],
      cost: 3,
      isAlternate: true,
      minNameStackCount: 1,
      minNameStackNames: ["Shademon"],
    },
  ],
  // EX12-032 prints two Lv.4 alternate paths: Garurumon in name, or NSo/VB trait.
  "EX12-032": [
    { level: 4, names: ["Garurumon"], cost: 3, isAlternate: true },
    { level: 4, traits: ["NSo", "VB"], cost: 3, isAlternate: true },
  ],
  // EX12-035 prints Lv.5 [Garurumon] in name OR [ME]/[VB] trait: cost 3.
  "EX12-035": [
    { level: 5, names: ["Garurumon"], cost: 3, isAlternate: true },
    { level: 5, traits: ["ME", "VB"], cost: 3, isAlternate: true },
  ],
  "EX12-037": [{ level: 6, traits: ["ME", "VB"], cost: 5, isAlternate: true }],
  // EX11-022: the committed generated fallback predates the compiler's base-color support.
  // Preserve the printed yellow/purple restriction for both server legality and client previews.
  "EX11-022": [{ level: 4, traits: ["Puppet"], cost: 3, isAlternate: true, baseColors: ["Yellow", "Purple"] }],
  // EX11-024 has only its ordinary yellow Lv.5 EvoCost row. The generated IR incorrectly
  // duplicated that row as a printed alternate [Digivolve] requirement.
  "EX11-024": [],
  // EX11-026 prints no [Digivolve] header; its only route is the ordinary green Lv.2 EvoCost
  // row. The earlier entry stripped the printed colour restriction from that route.
  "EX11-026": [],
  // EX11-028 has only its ordinary green Lv.3 EvoCost row; it prints no alternate header.
  "EX11-028": [],
  // EX11-029's only alternate route is the named Maquinamon header; its green Lv.3 row is ordinary.
  "EX11-029": [{ namesExact: ["Maquinamon"], cost: 2, isAlternate: true }],
  // EX11-030's green/black Lv.3 rows are ordinary; only Royal Base is an alternate route.
  "EX11-030": [{ level: 3, traits: ["Royal Base"], cost: 2, isAlternate: true }],
  // Shoto Kazama is a controller board-state gate, not an alternative evolution base.
  "EX11-074": [
    {
      namesExact: ["GrandGalemon"],
      cost: 6,
      isAlternate: true,
      controllerControls: { kind: ["Digimon", "Tamer"], namesExact: ["Shoto Kazama"], min: 1 },
    },
  ],
  // BT12-081: Astamon prints a [Psychemon] route and a Save route restricted to yellow, green, or purple Lv.4 bases.
  "BT12-081": [
    { namesExact: ["Psychemon"], cost: 5, isAlternate: true },
    { cost: 3, isAlternate: true, level: 4, texts: ["Save"], colors: ["Yellow", "Green", "Purple"] },
  ],
  // BT12-083: the Save alternate path is restricted to red, black, or purple Lv.4 bases.
  "BT12-083": [{ cost: 4, isAlternate: true, level: 4, texts: ["Save"], colors: ["Red", "Black", "Purple"] }],
  // RB1-009: a Gammamon with a Gammamon-named digivolution card may evolve into this
  // card from hand for 3, ignoring the ordinary level/color requirement.
  "RB1-009": [
    {
      cost: 3,
      isAlternate: true,
      namesExact: ["Gammamon"],
      minNameStackCount: 1,
      minNameStackNames: ["Gammamon"],
      minNameStackMatch: "contains",
      battleAreaOnly: true,
    },
    { level: 4, names: ["Gammamon"], cost: 3, isAlternate: true },
  ],
  // BT26-074 Cerberusmon: [Digivolve] Lv.4 w/[TS] trait: Cost 3.
  "BT26-074": [{ cost: 3, isAlternate: true, level: 4, traits: ["TS"] }],
  // BT26-082 Ravemon: [Digivolve] [Crowmon] OR Lv.5 w/[DATA SQUAD] trait: Cost 3.
  // The card catalog carries only its ordinary purple Lv.5 cost-4 row.
  "BT26-082": [
    { cost: 3, isAlternate: true, namesExact: ["Crowmon"] },
    { cost: 3, isAlternate: true, level: 5, traits: ["DATA SQUAD"] },
  ],
  "BT11-022": [{ cost: 0, isAlternate: true, namesExact: ["Bebydomon"] }],
  "BT11-031": [{ cost: 2, isAlternate: true, namesExact: ["MetalGreymon"] }],
  "BT11-034": [{ cost: 0, isAlternate: true, level: 2, traits: ["Xros Heart"] }],
  "BT11-041": [{ cost: 3, isAlternate: true, level: 4, names: ["Sukamon"] }],
  "BT11-043": [{ cost: 3, isAlternate: true, level: 4, names: ["Sukamon"] }],
  "BT11-082": [{ cost: 1, isAlternate: true, names: ["Damemon"] }],
  // BT7 beast Hybrids: the historical serialized IR retained only `baseIsTamer` and dropped
  // the printed Tamer color. Keep the current client/server legality source exact while the
  // compiler fix above ensures regenerated artifacts include `baseColors` going forward.
  "BT7-011": [{ cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Red"] }],
  "BT7-022": [{ cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Blue"] }],
  "BT7-036": [{ cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Yellow"] }],
  "BT7-047": [{ cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Green"] }],
  "BT7-073": [{ cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Purple"] }],
  // BT7-112 (Susanoomon): digivolve from hand onto one of your Tamers (treated as a level 6
  // Digimon, cost 7) by placing 10 Tamer and/or [Hybrid]-trait cards from hand+trash at the
  // bottom of the deck. Replaces the gateless generated `{cost:7, isAlternate:true}`. Paying the
  // placement still allows the ordinary level 6 Digimon base (KB Q1685).
  "BT7-112": [
    {
      cost: 7,
      isAlternate: true,
      level: 6,
      sourceZones: ["hand"],
      placementCost: { count: 10, from: ["hand", "trash"], kinds: ["Tamer"], traits: ["Hybrid"] },
    },
    {
      cost: 7,
      isAlternate: true,
      baseIsTamer: true,
      placementCost: { count: 10, from: ["hand", "trash"], kinds: ["Tamer"], traits: ["Hybrid"] },
    },
  ],
  // BT14-101 (WarGreymon): besides its Lv.5 [Greymon] path, [Agumon] may digivolve into it from
  // the hand for 4 while you have a [Tai Kamiya] Tamer and the opponent has a 10000+ DP Digimon.
  // Other digivolve effects may use that route too (KB Q2484).
  "BT14-101": [
    { level: 5, names: ["Greymon"], cost: 4, isAlternate: true },
    {
      cost: 4,
      isAlternate: true,
      namesExact: ["Agumon"],
      sourceZones: ["hand"],
      battleAreaOnly: true,
      opponentDigimonDpMin: 10000,
      controllerControls: { kind: ["Tamer"], names: ["Tai Kamiya"], min: 1 },
    },
  ],
  // BT18-102 (Susanoomon): "[Digivolve] Takuya Kanbara / Koji Minamoto: Cost 6 (if this Digimon
  // has 10 or more [Hybrid]-trait cards in its digivolution stack)". The effects.json entry has the
  // substring `names` gate but lacks `requiredDigivolutionCardCount` and `incompatibleWithBlastDigivolve`
  // (KB Q3055/Q3056). Override here so the server's digivolve-legality validator enforces the
  // 10-[Hybrid] stack count gate and excludes this path from Blast Digivolve candidates.
  "BT18-102": [
    {
      cost: 6,
      isAlternate: true,
      namesExact: ["Takuya Kanbara", "Koji Minamoto"],
      requiredDigivolutionCardCount: { trait: "Hybrid", min: 10 },
      incompatibleWithBlastDigivolve: true,
    },
  ],
  // `TopCard.EqualsCardName("Takuya Kanbara")` plus >=2 [Hybrid] digivolution cards. The generated
  // IR already captured the name gate; this override preserves that gate and adds only the dropped
  // Tamer-base and stack-count gates. Name aliases such as AD1-020's "also treated as
  // [Takuya Kanbara]" are handled by the engine's effective-name matcher.
  "AD1-002": [
    {
      cost: 3,
      isAlternate: true,
      baseIsTamer: true,
      names: ["Takuya Kanbara"],
      minTraitStackCount: 2,
      minTraitStackTraits: ["Hybrid"],
    },
  ],
  // BT16-020 (GaoGamon): [Digivolve] Lv.3 w/[Night Claw]/[Light Fang] trait: Cost 2
  // (documented behavior — PermanentCondition: TopCard.Level == 3 && HasLightFangNightClawTraits).
  // The generator emitted no digivolutionRequirement for this card; this is purely additive.
  "BT16-020": [
    {
      cost: 2,
      isAlternate: true,
      level: 3,
      traits: ["Night Claw", "Light Fang"],
    },
  ],
  // BT19-101 (ZeedMillenniummon): "[Digivolve][MoonMillenniummon]: Cost 2". The generated
  // record was gateless; preserve the bracketed exact-name gate explicitly.
  "BT19-101": [
    {
      cost: 2,
      isAlternate: true,
      namesExact: ["MoonMillenniummon"],
    },
  ],
  // BT22-063/067 may evolve from their named CS Tamers only while their owner has at most
  // three security cards. The historical aggregate retained the name and cost but dropped
  // the live security gate, which made these paths available at four or five security.
  "BT22-063": [
    { level: 5, traits: ["CS"], cost: 3, isAlternate: true },
    {
      names: ["Kyoko Kuremi"],
      cost: 5,
      whileCondition: { kind: "zoneCount", seat: "mine", zone: "security", op: "lte", value: 3 },
      isAlternate: true,
    },
  ],
  "BT22-067": [
    { level: 5, traits: ["CS"], cost: 3, isAlternate: true },
    {
      names: ["Rie Kishibe"],
      cost: 5,
      whileCondition: { kind: "zoneCount", seat: "mine", zone: "security", op: "lte", value: 3 },
      isAlternate: true,
    },
  ],
  // BT23-013's printed alternate recipes are three paths: SaviorHuckmon OR a level-5 CS
  // Digimon for cost 3, plus Huckmon for cost 5 only while the opponent has a 10000-DP-or-higher
  // Digimon. The committed generated entry dropped SaviorHuckmon's level and the live DP gate.
  "BT23-013": [
    { namesExact: ["SaviorHuckmon"], level: 5, cost: 3, isAlternate: true },
    { traits: ["CS"], level: 5, cost: 3, isAlternate: true },
    { namesExact: ["Huckmon"], opponentDigimonDpMin: 10000, cost: 5, isAlternate: true },
  ],
  // BT21-063/066/072 (Gumdramon line): "[Digivolve] Lv.N w/＜Save＞ in text or w/[Hero] trait: Cost C".
  // The ＜Save＞ keyword's full-width angle brackets and the "in text" phrasing defeat the text
  // parser, so it emits a gateless entry. The "or" is a DISJUNCTION (＜Save＞-in-text OR [Hero]
  // trait), but a single requirement's gates are conjunctive — so emit one entry per branch,
  // both gated on the printed level.
  // EX10-015 (Psychemon): "[Digivolve] Lv.2 w/＜Save＞ in text: Cost 0" (documented behavior:
  // TopCard.IsLevel2 && TopCard.HasSaveText; digivolutionCost:0; ignoreDigivolutionRequirement:false).
  "EX10-015": [{ cost: 0, isAlternate: true, level: 2, texts: ["＜Save＞"] }],

  "BT21-063": [
    { cost: 0, isAlternate: true, level: 2, texts: ["＜Save＞"] },
    { cost: 0, isAlternate: true, level: 2, traits: ["Hero"] },
  ],
  "BT21-066": [
    { cost: 2, isAlternate: true, level: 3, texts: ["＜Save＞"] },
    { cost: 2, isAlternate: true, level: 3, traits: ["Hero"] },
  ],
  "BT21-072": [
    { cost: 3, isAlternate: true, level: 4, texts: ["＜Save＞"] },
    { cost: 3, isAlternate: true, level: 4, traits: ["Hero"] },
  ],
  // parser captured, PLUS an unnamed "from one of your <color> Tamers" path it DROPPED (no bracket
  // name to parse, and the compiler can't emit the baseIsTamer/baseColors gate). Every entry below
  // EqualsCardName, exact). Entries are ordered ascending by cost: the legality lookup returns the
  // FIRST matching entry, so the cheapest legal path wins when a base satisfies more than one.
  //
  // BT21-013 (Agunimon, documented behavior): from a red Tamer (cost 2) or BurningGreymon (cost 0).
  "BT21-013": [
    { cost: 0, isAlternate: true, namesExact: ["BurningGreymon"] },
    { cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Red"] },
  ],
  // BT21-014 (BurningGreymon, documented behavior): from a red Tamer (cost 3) or Agunimon (cost 1).
  "BT21-014": [
    { cost: 1, isAlternate: true, namesExact: ["Agunimon"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Red"] },
  ],
  // BT18 Frontier line (documented behavior): the dropped path is "from one of your <colors> Tamers".
  "BT18-011": [
    { cost: 0, isAlternate: true, namesExact: ["BurningGreymon"] },
    { cost: 2, isAlternate: true, namesExact: ["Takuya Kanbara"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Red", "Purple"] },
  ],
  "BT18-012": [
    { cost: 0, isAlternate: true, namesExact: ["Gigasmon"] },
    { cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Red"] },
  ],
  "BT18-014": [
    { cost: 1, isAlternate: true, namesExact: ["Grumblemon"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Red"] },
  ],
  "BT18-022": [
    { cost: 0, isAlternate: true, namesExact: ["Korikakumon"] },
    { cost: 2, isAlternate: true, namesExact: ["Tommy Himi"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Blue", "Red"] },
  ],
  "BT18-023": [
    { cost: 0, isAlternate: true, namesExact: ["Calmaramon"] },
    { cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Blue"] },
  ],
  "BT18-024": [
    { cost: 1, isAlternate: true, namesExact: ["Lanamon"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Blue"] },
  ],
  "BT18-025": [
    { cost: 1, isAlternate: true, namesExact: ["Kumamon"] },
    { cost: 3, isAlternate: true, namesExact: ["Tommy Himi"] },
    { cost: 4, isAlternate: true, baseIsTamer: true, baseColors: ["Blue", "Red"] },
  ],
  "BT18-037": [
    { cost: 0, isAlternate: true, namesExact: ["KendoGarurumon"] },
    { cost: 2, isAlternate: true, namesExact: ["Koji Minamoto"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Yellow", "Blue"] },
  ],
  "BT18-047": [
    { cost: 0, isAlternate: true, namesExact: ["Petaldramon"] },
    { cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Green"] },
  ],
  "BT18-048": [
    { cost: 0, isAlternate: true, namesExact: ["Zephyrmon"] },
    { cost: 2, isAlternate: true, namesExact: ["Zoe Orimoto"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Green", "Red"] },
  ],
  "BT18-049": [
    { cost: 1, isAlternate: true, namesExact: ["Kazemon"] },
    { cost: 3, isAlternate: true, namesExact: ["Zoe Orimoto"] },
    { cost: 4, isAlternate: true, baseIsTamer: true, baseColors: ["Green", "Red"] },
  ],
  "BT18-050": [
    { cost: 1, isAlternate: true, namesExact: ["Arbormon"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Green"] },
  ],
  "BT18-063": [
    { cost: 0, isAlternate: true, namesExact: ["MetalKabuterimon"] },
    { cost: 2, isAlternate: true, namesExact: ["J.P. Shibayama"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Black", "Yellow"] },
  ],
  "BT18-064": [
    { cost: 0, isAlternate: true, namesExact: ["Sephirothmon"] },
    { cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Black"] },
  ],
  "BT18-066": [
    { cost: 1, isAlternate: true, namesExact: ["Mercurymon"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Black"] },
  ],
  "BT18-067": [
    { cost: 1, isAlternate: true, namesExact: ["Beetlemon"] },
    { cost: 3, isAlternate: true, namesExact: ["J.P. Shibayama"] },
    { cost: 4, isAlternate: true, baseIsTamer: true, baseColors: ["Black", "Yellow"] },
  ],
  "BT18-076": [
    { cost: 0, isAlternate: true, namesExact: ["KaiserLeomon"] },
    { cost: 2, isAlternate: true, namesExact: ["Koichi Kimura"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Purple", "Yellow"] },
  ],
  "BT18-077": [
    { cost: 1, isAlternate: true, namesExact: ["Loweemon"] },
    { cost: 3, isAlternate: true, namesExact: ["Koichi Kimura"] },
    { cost: 4, isAlternate: true, baseIsTamer: true, baseColors: ["Purple", "Yellow"] },
  ],
  "BT18-078": [
    { cost: 1, isAlternate: true, namesExact: ["Velgrmon"] },
    { cost: 2, isAlternate: true, namesExact: ["Koichi Kimura"] },
    { cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Purple"] },
  ],
  "BT18-079": [
    { cost: 1, isAlternate: true, namesExact: ["Duskmon"] },
    { cost: 3, isAlternate: true, namesExact: ["Koichi Kimura"] },
    { cost: 4, isAlternate: true, baseIsTamer: true, baseColors: ["Purple"] },
  ],
  // BT4-027 (KendoGarurumon): "digivolve this card from your hand onto one of your blue Tamers as
  // if the Tamer is a level 3 Digimon" (KB Q1189-Q1194 confirm the Tamer-onto path). The compiled
  // entry is gateless (`{cost:0, isAlternate:true, baseIsTamer:true}`, matching a Tamer of any
  // color at cost 0); the real cost is the card's printed level-3/blue evo cost (3).
  "BT4-027": [{ cost: 3, isAlternate: true, baseIsTamer: true, baseColors: ["Blue"] }],
  // BT7-046 (Beetlemon): "digivolve this card from your hand onto one of your green Tamers as if
  // the Tamer is a level 3 green Digimon". Same gateless-compile defect as BT4-027; the real cost
  // is the card's printed level-3/green evo cost (2).
  "BT7-046": [{ cost: 2, isAlternate: true, baseIsTamer: true, baseColors: ["Green"] }],
  // Early named hand-evolution effects use exact bracketed names. Their generated `names`
  // entries are substring gates, which admitted forms such as Lucemon: Chaos Mode onto itself.
  // BT2-111 and EX2-022 also carry live-state availability gates omitted by the compiler.
  "BT2-111": [
    {
      cost: 4,
      isAlternate: true,
      namesExact: ["Impmon"],
      controllerTrashCountMin: 10,
      battleAreaOnly: true,
    },
  ],
  "BT5-014": [{ cost: 4, isAlternate: true, namesExact: ["Shoutmon"], battleAreaOnly: true }],
  "BT5-067": [{ cost: 4, isAlternate: true, namesExact: ["Keramon"], battleAreaOnly: true }],
  // BT5-111's named Omnimon shortcut is explicitly limited to the battle area (KB Q1385).
  "BT5-111": [{ cost: 3, isAlternate: true, names: ["Omnimon"], battleAreaOnly: true }],
  "BT7-017": [{ cost: 1, isAlternate: true, namesExact: ["Machinedramon"] }],
  "BT7-111": [{ cost: 7, isAlternate: true, namesExact: ["Lucemon"], sourceZones: ["hand"] }],
  "EX2-022": [
    {
      cost: 3,
      isAlternate: true,
      namesExact: ["Lopmon"],
      controllerControls: { kind: ["Tamer"], namesExact: ["Shu-Chong Wong"], min: 1 },
    },
  ],
  // P-185 (EmperorGreymon, documented behavior): digivolve from your [Takuya Kanbara] Tamer with 5+ [Hybrid]
  // cards under it, cost 4. The compiled entry kept only the name, dropping baseIsTamer and the
  // 5-[Hybrid] stack gate (enforced on the base permanent's digivolution stack at the digivolve site).
  "P-185": [
    {
      cost: 4,
      isAlternate: true,
      baseIsTamer: true,
      namesExact: ["Takuya Kanbara"],
      minTraitStackCount: 5,
      minTraitStackTraits: ["Hybrid"],
    },
  ],
  // BT22-042 (Chaperomon, documented behavior): digivolve from Chaperomon for cost 6, ONLY while you
  // control a Tamer named [Arisa Kinosaki]. The compiled entry wrongly modeled
  // the controller condition as an alternate BASE name (`names:["Arisa Kinosaki","Chaperomon"]`),
  // which would let you digivolve from an Arisa Kinosaki permanent directly and skip the control
  // gate. Correct: base is Chaperomon; the Arisa Kinosaki Tamer is a `controllerControls` gate.
  "BT22-042": [
    {
      cost: 6,
      isAlternate: true,
      namesExact: ["Chaperomon"],
      controllerControls: { kind: ["Tamer"], namesExact: ["Arisa Kinosaki"], min: 1 },
    },
  ],
  // BT23-101 (documented behavior): two alternate paths.
  //   1. from a Lv.3 [CS]-trait Digimon, cost 4 (already gated correctly by level+trait).
  //   2. from [Erika Mishima] for cost 3, ONLY while you control 4+ [Hudie] Tamers.
  // The compiled entry for path 2 conflated the [Hudie] control condition into a base trait gate
  // (`traits:["Hudie"], names:["Erika Mishima"]`); re-model it as a `controllerControls` gate.
  "BT23-101": [
    {
      cost: 3,
      isAlternate: true,
      namesExact: ["Erika Mishima"],
      controllerControls: { kind: ["Tamer"], traits: ["Hudie"], min: 4 },
    },
    { cost: 4, isAlternate: true, level: 3, traits: ["CS"] },
  ],
  // BT25-084: the cost-2 slide path is only from an exact [Titamon] whose printed card has
  // fewer than three colors. The generated requirement retained the name but lost the negative
  // color-count gate, which allowed the new three-color Titamon to slide onto itself.
  "BT25-084": [
    { namesExact: ["Titamon"], baseColorCountMax: 2, cost: 2, isAlternate: true },
    { level: 5, traits: ["TS"], cost: 4, isAlternate: true },
  ],

  // Special-mechanic digivolves: "Digivolve from [ExactCard]" paths (Armor / X-Antibody / Blast)
  // `PermanentCondition: TopCard.CardNames.Contains("<base>")` + a digivolution cost. The English
  // effectText drops these lines and the runtime record flattened them to a gateless entry, so they
  // base must BE that card — substring would wrongly accept relatives ("Veemon" ⊂ "ExVeemon").
  // Armor digivolve (BT8 [Armor Form] line):
  "BT8-012": [{ cost: 2, isAlternate: true, namesExact: ["Veemon"] }],
  "BT8-032": [{ cost: 2, isAlternate: true, names: ["Dragon Mode"] }],
  "BT8-023": [{ cost: 2, isAlternate: true, namesExact: ["Armadillomon"] }],
  "BT8-026": [{ cost: 2, isAlternate: true, namesExact: ["Hawkmon"] }],
  "BT8-038": [{ cost: 3, isAlternate: true, namesExact: ["Veemon"] }],
  "BT8-039": [{ cost: 3, isAlternate: true, namesExact: ["Terriermon"] }],
  "BT8-048": [{ cost: 2, isAlternate: true, namesExact: ["Hawkmon"] }],
  "BT8-051": [{ cost: 2, isAlternate: true, namesExact: ["Armadillomon"] }],
  "BT8-053": [{ cost: 2, isAlternate: true, namesExact: ["Veemon"] }],
  "BT8-082": [{ cost: 2, isAlternate: true, namesExact: ["Ophanimon"] }],
  // BT9 bracketed "Digivolve: N from [ExactCard]" paths are exact card-name gates.
  // The generated `names` representation uses substring semantics and therefore allowed
  // most X-Antibody forms to digivolve onto themselves. It also absorbed static name aliases
  // into BT9-051/068's base lists, even though their printed paths name only one exact base.
  "BT9-008": [{ cost: 0, isAlternate: true, namesExact: ["Agumon"] }],
  "BT9-009": [{ cost: 0, isAlternate: true, namesExact: ["Guilmon"] }],
  "BT9-011": [{ cost: 0, isAlternate: true, namesExact: ["Growlmon"] }],
  "BT9-012": [{ cost: 0, isAlternate: true, namesExact: ["Greymon"] }],
  "BT9-013": [{ cost: 0, isAlternate: true, namesExact: ["OmniShoutmon"] }],
  "BT9-014": [{ cost: 0, isAlternate: true, namesExact: ["WarGrowlmon"] }],
  "BT9-015": [{ cost: 0, isAlternate: true, namesExact: ["MetalGreymon"] }],
  "BT9-016": [{ cost: 1, isAlternate: true, namesExact: ["WarGreymon"] }],
  "BT9-017": [{ cost: 1, isAlternate: true, namesExact: ["Gallantmon"] }],
  "BT9-020": [{ cost: 0, isAlternate: true, namesExact: ["Gabumon"] }],
  "BT9-023": [{ cost: 2, isAlternate: true, namesExact: ["Gammamon"] }],
  "BT9-024": [{ cost: 0, isAlternate: true, namesExact: ["Garurumon"] }],
  "BT9-028": [{ cost: 0, isAlternate: true, namesExact: ["WereGarurumon"] }],
  "BT9-031": [{ cost: 1, isAlternate: true, namesExact: ["MetalGarurumon"] }],
  "BT9-034": [{ cost: 0, isAlternate: true, namesExact: ["Salamon"] }],
  "BT9-036": [{ cost: 0, isAlternate: true, namesExact: ["Gatomon"] }],
  "BT9-038": [{ cost: 2, isAlternate: true, namesExact: ["Patamon"] }],
  "BT9-040": [{ cost: 0, isAlternate: true, namesExact: ["Angewomon"] }],
  "BT9-041": [{ cost: 1, isAlternate: true, namesExact: ["RizeGreymon"] }],
  "BT9-043": [{ cost: 1, isAlternate: true, namesExact: ["Magnadramon"] }],
  "BT9-044": [{ cost: 4, isAlternate: true, namesExact: ["Magnamon"] }],
  "BT9-046": [{ cost: 0, isAlternate: true, namesExact: ["Kokuwamon"] }],
  "BT9-049": [{ cost: 0, isAlternate: true, namesExact: ["Kuwagamon"] }],
  "BT9-050": [{ cost: 0, isAlternate: true, namesExact: ["Leomon"] }],
  "BT9-051": [{ cost: 0, isAlternate: true, namesExact: ["Panjyamon"] }],
  "BT9-052": [{ cost: 0, isAlternate: true, namesExact: ["Okuwamon"] }],
  "BT9-055": [{ cost: 1, isAlternate: true, namesExact: ["GranKuwagamon"] }],
  "BT9-056": [{ cost: 1, isAlternate: false, namesExact: ["SaberLeomon"] }],
  "BT9-068": [{ cost: 2, isAlternate: true, namesExact: ["BlackWarGreymon"] }],
  "BT9-070": [{ cost: 0, isAlternate: true, namesExact: ["Gazimon"] }],
  "BT9-075": [{ cost: 0, isAlternate: true, namesExact: ["Dorugamon"] }],
  "BT9-078": [{ cost: 1, isAlternate: true, namesExact: ["DoruGreymon"] }],
  "BT9-081": [{ cost: 2, isAlternate: true, namesExact: ["Dorugoramon"] }],
  "BT9-111": [
    {
      cost: 3,
      isAlternate: true,
      namesExact: ["Alphamon"],
      minNameStackCount: 1,
      minNameStackNames: ["Ouryumon"],
    },
  ],
  // BT10 bracketed alternate paths name one exact base. The declarative effect record used the
  // substring `names` gate, which let an X-Antibody/form name evolve onto itself
  // (for example Jesmon (X Antibody) onto Jesmon (X Antibody)). Keep explicit
  // "name contains" cards such as BT10-067 on the substring path.
  "BT10-016": [{ cost: 0, isAlternate: true, namesExact: ["Jesmon"] }],
  "BT10-031": [{ cost: 0, isAlternate: true, namesExact: ["Bibimon"] }],
  "BT10-050": [{ cost: 2, isAlternate: true, namesExact: ["Gammamon"] }],
  "BT10-068": [{ cost: 1, isAlternate: true, namesExact: ["Gankoomon"] }],
  "BT10-078": [{ cost: 2, isAlternate: true, namesExact: ["Gammamon"] }],
  "BT10-086": [{ cost: 3, isAlternate: true, namesExact: ["Omnimon"] }],
  // X-Antibody digivolve (from the same-named non-X base):
  "BT15-021": [{ cost: 0, isAlternate: true, namesExact: ["Gomamon"] }],
  "BT15-032": [{ cost: 2, isAlternate: true, namesExact: ["Plesiomon"] }],
  "BT15-045": [{ cost: 0, isAlternate: true, namesExact: ["Palmon"] }],
  "BT15-048": [{ cost: 0, isAlternate: true, namesExact: ["Togemon"] }],
  "BT15-051": [{ cost: 0, isAlternate: true, namesExact: ["Lillymon"] }],
  "BT15-054": [{ cost: 1, isAlternate: true, namesExact: ["Rosemon"] }],
  "BT15-081": [{ cost: 2, isAlternate: true, namesExact: ["Leviamon"] }],
  "EX5-018": [{ cost: 0, isAlternate: true, namesExact: ["Garurumon"] }],
  "EX5-023": [{ cost: 1, isAlternate: true, namesExact: ["WereGarurumon"] }],
  "EX5-026": [{ cost: 1, isAlternate: true, namesExact: ["MetalGarurumon"] }],
  "EX5-059": [{ cost: 0, isAlternate: true, namesExact: ["Dobermon"] }],
  // Named alternate-form / line-specific digivolves:
  "BT12-034": [{ cost: 0, isAlternate: true, namesExact: ["Koromon"] }],
  "BT15-020": [{ cost: 0, isAlternate: true, namesExact: ["Tsunomon"] }],
  "BT15-056": [{ cost: 0, isAlternate: true, namesExact: ["Kyokyomon"] }],
  "BT20-073": [{ cost: 1, isAlternate: true, namesExact: ["Phantomon"] }],
  "LM-016": [{ cost: 0, isAlternate: true, namesExact: ["Gurimon"] }],
  "P-072": [{ cost: 0, isAlternate: true, namesExact: ["MetalGreymon"] }],
  "P-073": [{ cost: 0, isAlternate: true, namesExact: ["WereGarurumon"] }],
  "P-092": [{ cost: 0, isAlternate: true, namesExact: ["Bebydomon"] }],
  // Blast Digivolve (from either listed material):
  "P-109": [{ cost: 3, isAlternate: true, namesExact: ["Paildramon", "Dinobeemon"] }],
  "P-220": [{ cost: 6, isAlternate: true, namesExact: ["Kimeramon"] }],
  // Burst Digivolve (comprehensive-0040 / §8-3) keeps the base name separate from the
  // Tamer return cost. Combining them in one name list would incorrectly allow a Tamer's
  // name to satisfy the base requirement.
  "BT13-020": [
    {
      cost: 0,
      isAlternate: true,
      namesExact: ["ShineGreymon"],
      burstDigivolve: { returnTamerNamesExact: ["Marcus Damon"] },
    },
  ],
  "BT13-033": [
    {
      cost: 0,
      isAlternate: true,
      namesExact: ["MirageGaogamon"],
      burstDigivolve: { returnTamerNamesExact: ["Thomas H. Norstein"] },
    },
  ],
  "BT13-060": [
    {
      cost: 0,
      isAlternate: true,
      namesExact: ["Rosemon"],
      burstDigivolve: { returnTamerNamesExact: ["Yoshino Fujieda"] },
    },
  ],
  "BT13-092": [
    {
      cost: 0,
      isAlternate: true,
      namesExact: ["Ravemon"],
      burstDigivolve: { returnTamerNamesExact: ["Keenan Crier"] },
    },
  ],
  "BT25-104": [
    { cost: 5, isAlternate: true, level: 6, traits: ["DATA SQUAD"] },
    {
      cost: 0,
      isAlternate: true,
      namesExact: ["ShineGreymon"],
      burstDigivolve: { returnTamerNamesExact: ["Marcus Damon"] },
    },
  ],

  // RB1-036 (Proximamon): the Siriusmon alternate path is legal only when the
  // base already has an [Arcturusmon] card in its digivolution stack (printed
  // "w/[Arcturusmon] digivolution card").
  "RB1-036": [
    {
      cost: 3,
      isAlternate: true,
      namesExact: ["Siriusmon"],
      minNameStackCount: 1,
      minNameStackNames: ["Arcturusmon"],
    },
  ],

  // LM-021/LM-022 print "[Digivolve] [Agumon]/[Gabumon] while you have 2 or fewer security
  // cards: Cost 3". The generated entry kept the name and cost but dropped the live security
  // gate, so the Cost 3 path stood at any security count — KB Q4014/Q4021 say it does not.
  "LM-021": [
    {
      namesExact: ["Agumon"],
      cost: 3,
      whileCondition: { kind: "zoneCount", seat: "mine", zone: "security", op: "lte", value: 2 },
      isAlternate: true,
    },
  ],
  "LM-022": [
    {
      namesExact: ["Gabumon"],
      cost: 3,
      whileCondition: { kind: "zoneCount", seat: "mine", zone: "security", op: "lte", value: 2 },
      isAlternate: true,
    },
  ],

  // BT26-073's bracket-only [Aegiomon] requirement names exactly that card.
  "BT26-073": [{ namesExact: ["Aegiomon"], cost: 3, isAlternate: true }],

  // Bracket-only names in BT26 evolution headers are exact card names. Keep the
  // hand-authored legality SSoT ahead of the generator's historical substring entries.
  "BT26-029": [{ namesExact: ["Aegiomon"], cost: 3, isAlternate: true }],
  "BT26-032": [{ namesExact: ["Ceresmon"], basePlayCost: 12, cost: 2, isAlternate: true }],
  "BT26-049": [
    { namesExact: ["Lilamon"], cost: 3, isAlternate: true },
    { level: 5, traits: ["DATA SQUAD"], cost: 3, isAlternate: true },
  ],
  "BT26-056": [
    { namesExact: ["Cerberusmon"], cost: 1, isAlternate: true },
    { level: 4, traits: ["TS"], cost: 3, isAlternate: true },
  ],
  "BT26-080": [{ namesExact: ["Bacchusmon"], basePlayCost: 12, cost: 2, isAlternate: true }],

  // BT26-079's bracket-only [Plutomon] requirement is an exact name, not a
  // substring match that would also admit ZombiePlutomon.
  "BT26-079": [
    { namesExact: ["Plutomon"], cost: 1, isAlternate: true },
    { level: 5, traits: ["TS"], cost: 3, isAlternate: true },
  ],

  // BT26-081 also names bracket-only [Minervamon] exactly in its alternate route.
  "BT26-081": [
    { namesExact: ["Minervamon"], cost: 2, isAlternate: true },
    { level: 5, traits: ["TS"], cost: 4, isAlternate: true },
  ],

  // BT26-050 combines an ordinary alternate path with a Burst Digivolve clause, so its
  // complete requirements are kept together here instead of in the committed data below.
  "BT26-050": [
    { level: 6, traits: ["DATA SQUAD"], cost: 5, isAlternate: true },
    {
      cost: 0,
      isAlternate: true,
      namesExact: ["Rosemon"],
      burstDigivolve: { returnTamerNamesExact: ["Yoshino Fujieda"] },
    },
  ],
};

/**
 * Committed alternate digivolution requirements for cards whose direct modules do not
 * embed them. Explicit overrides above take precedence on a card ID collision.
 */
const GENERATED_DIGIVOLUTION_OVERRIDES = generatedDigivolveOverridesJson as unknown as Record<
  string,
  DigivolutionRequirement[]
>;

/**
 * The alternate digivolution requirements for a card: the hand-authored override when one
 * exists, else the committed declarative entry, else the compiled card effect.
 * Shared by the server's digivolve legality/cost path and the client's target-highlighting/
 * cost-label projections.
 */
export function digivolutionRequirementsFor(cardId: string): DigivolutionRequirement[] | undefined {
  return (
    ALTERNATE_DIGIVOLUTION_OVERRIDES[cardId] ??
    GENERATED_DIGIVOLUTION_OVERRIDES[cardId] ??
    compiledEffects[cardId]?.digivolutionRequirement
  );
}

export interface TamerOntoDigivolveSpec {
  asLevel: number;
  baseColors?: DigivolutionRequirement["baseColors"];
  costOverride?: number;
}

/**
 * The executable details for a card that may digivolve from hand onto one of your <color>
 * Tamers as if the Tamer is a level-N Digimon (Frontier hybrids: BT4-025, BT17-012, ...), or
 * undefined when the card has no such path. Derived from compiled IR: current modules put the
 * Tamer filter in a `Digivolve` action's `target.filter`; legacy records may carry it in a
 * `TamerOntoDigivolve` action's `onto`. Kept in
 * @aegis/shared so the SERVER (digivolve legality/cost) and the CLIENT (target highlighting +
 * cost labels) can share the level, allowed Tamer colors, and any printed fixed cost. For such
 * cards the compiled `digivolutionRequirement` is a
 * STALE gateless/`baseIsTamer`-only entry to be ignored in favor of this derived path (plus any
 * SPECIFIC named requirement the card also prints, e.g. `[Takuya Kanbara]: Cost 2`).
 */
export function tamerOntoDigivolveSpec(cardId: string): TamerOntoDigivolveSpec | undefined {
  const compiled = compiledEffects[cardId];
  if (!compiled) return undefined;
  for (const effect of compiled.effects ?? []) {
    if (effect.trigger !== "Static") continue;
    for (const action of effect.actions ?? []) {
      const act = action as {
        kind?: unknown;
        asLevel?: unknown;
        costOverride?: unknown;
        target?: { filter?: unknown };
        onto?: unknown;
      };
      if ((act.kind !== "TamerOntoDigivolve" && act.kind !== "Digivolve") || typeof act.asLevel !== "number") {
        continue;
      }
      const targetFilter = act.target?.filter as
        | { kind?: unknown; colors?: DigivolutionRequirement["baseColors"] }
        | undefined;
      const onto = act.onto as
        | {
            filter?: { kind?: unknown; colors?: DigivolutionRequirement["baseColors"] };
            kind?: unknown;
            colors?: DigivolutionRequirement["baseColors"];
          }
        | undefined;
      const ontoFilter = onto?.filter ?? onto;
      const tamerFilter =
        Array.isArray(targetFilter?.kind) && targetFilter.kind.includes("Tamer") ? targetFilter : ontoFilter;
      if (!Array.isArray(tamerFilter?.kind) || !tamerFilter.kind.includes("Tamer")) continue;
      return {
        asLevel: act.asLevel,
        ...(Array.isArray(tamerFilter.colors) && tamerFilter.colors.length > 0
          ? { baseColors: [...tamerFilter.colors] }
          : {}),
        ...(typeof act.costOverride === "number" ? { costOverride: act.costOverride } : {}),
      };
    }
  }
  return undefined;
}

/** The "as if level N" part of {@link tamerOntoDigivolveSpec}. */
export function tamerOntoDigivolveLevel(cardId: string): number | undefined {
  return tamerOntoDigivolveSpec(cardId)?.asLevel;
}

/**
 * Base-GRANTED digivolution paths, keyed by the BASE card id (the Digimon in play that grants the
 * == self` PermanentCondition and a `cardCondition` gating the evolving card; the English text
 * drops the line and the model is keyed by the evolving card, so the data is authored here from the
 * target-highlighting so both agree. See {@link BaseGrantedDigivolve}.
 */
export const BASE_GRANTED_DIGIVOLVE: Record<string, BaseGrantedDigivolve[]> = {
  // BT21-010 / Q5210: this permission can combine with an effect such as Training.
  "BT21-010": [
    {
      target: { namesExact: ["Siriusmon"] },
      cost: 4,
      ignoreRequirements: true,
      sourceZones: ["hand"],
      condition: {
        kind: "anyOf",
        conditions: [
          { kind: "securityAtMost", count: 2 },
          { kind: "distinctNamedTamersWithTrait", trait: "Hero", count: 3 },
        ],
      },
    },
  ],
  // ST7-03 Guilmon: while the opponent has a Lv.6+ Digimon, a [Gallantmon] from hand digivolves
  // onto this Guilmon for 4, ignoring requirements (documented behavior — CardNames.Contains("Gallantmon"),
  // Condition: HasMatchConditionOpponentsPermanent(level >= 6)).
  "ST7-03": [
    {
      target: { namesExact: ["Gallantmon"] },
      cost: 4,
      ignoreRequirements: true,
      sourceZones: ["hand"],
      condition: { kind: "opponentHasDigimonLevelAtLeast", level: 6 },
    },
  ],
  // ST8-04 Veemon: same shape — an [UlforceVeedramon] from hand, cost 4 (documented behavior).
  "ST8-04": [
    {
      target: { namesExact: ["UlforceVeedramon"] },
      cost: 4,
      ignoreRequirements: true,
      sourceZones: ["hand"],
      condition: { kind: "opponentHasDigimonLevelAtLeast", level: 6 },
    },
  ],
  // BT21-040 Agumon: the ST7-03 shape with a second printed alternative — "while your opponent has
  // a level 6 or higher Digimon OR you have 3 or more [Hero] trait Tamers with different names",
  // a [ShineGreymon] from hand digivolves onto this for 4, ignoring requirements.
  "BT21-040": [
    {
      target: { namesExact: ["ShineGreymon"] },
      cost: 4,
      ignoreRequirements: true,
      sourceZones: ["hand"],
      condition: {
        kind: "anyOf",
        conditions: [
          { kind: "opponentHasDigimonLevelAtLeast", level: 6 },
          { kind: "distinctNamedTamersWithTrait", trait: "Hero", count: 3 },
        ],
      },
    },
  ],
  // BT6-060 Deputymon: a Digimon card with the [Three Musketeers] trait from hand digivolves onto
  // this for 6, ignoring requirements — no opponent gate (documented behavior — CardTraits.Contains).
  "BT6-060": [
    {
      target: { traits: ["Three Musketeers"] },
      cost: 6,
      ignoreRequirements: true,
      sourceZones: ["hand"],
    },
  ],
};

/** The base-granted digivolution paths a card in play offers, or undefined when it grants none. */
export function baseGrantedDigivolveFor(cardId: string): BaseGrantedDigivolve[] | undefined {
  return compiledEffects[cardId]?.baseGrantedDigivolve ?? BASE_GRANTED_DIGIVOLVE[cardId];
}

/**
 * Hand-authored DigiXros-requirement overrides, keyed by the played card id. The compiler captures
 * a slot's label verbatim as a single name token ("Blue MetalGreymon"), so a slot that is really
 * "name contains MetalGreymon AND color Blue" cannot be expressed by the generated token alone; the
 * override splits it into `names` + `colors`. Kept in @aegis/shared so the SERVER (DigiXros legality
 * + cost) and CLIENT (material highlighting) read ONE source of truth.
 */
export const DIGIXROS_REQUIREMENT_OVERRIDES: Record<string, DigiXrosRequirement[]> = {
  // BT20-058: [DigiXros -2] requires all three named Machine/Cyborg components. The generated
  // aggregate retained only Raijinmon, rejecting the complete printed recipe.
  "BT20-058": [
    {
      materials: [{ names: ["Raijinmon"] }, { names: ["Fujinmon"] }, { names: ["Suijinmon"] }],
      count: 2,
    },
  ],
  // BT18-065: [DigiXros -1] 4 [Vemmon]. The generated parser consumed the inherited
  // [All Turns][Once Per Turn] header as extra material metadata.
  "BT18-065": [{ materials: [{ names: ["Vemmon"] }], count: 1, maxMaterials: 4 }],
  // AD1-006: DigiXros -2 requires all six distinct named slots. The generated aggregate retained
  // only OmniShoutmon, which made the server accept an incomplete recipe.
  "AD1-006": [
    {
      materials: ["OmniShoutmon", "ZeigGreymon", "Ballistamon", "Dorulumon", "Starmons", "Sparrowmon"].map((name) => ({
        names: [name],
      })),
      count: 2,
    },
  ],
  // BT19-013: Shoutmon X5 requires five distinct named slots. The generated aggregate retained
  // only Shoutmon and a material count, allowing incomplete and duplicate-name recipes.
  "BT19-013": [
    {
      materials: ["Shoutmon", "Ballistamon", "Dorulumon", "Starmons", "Sparrowmon"].map((name) => ({
        names: [name],
      })),
      count: 2,
    },
  ],
  // BT19-014: Shoutmon EX6 requires five distinct named slots; the generated aggregate retained
  // only OmniShoutmon and otherwise accepted an incomplete recipe.
  "BT19-014": [
    {
      materials: ["OmniShoutmon", "ZeigGreymon", "AtlurBallistamon", "JaegerDorulumon", "RaptorSparrowmon"].map(
        (name) => ({ names: [name] }),
      ),
      count: 2,
    },
  ],
  // BT19-025: [DigiXros -2] Blue [Greymon] x [MailBirdramon]. The generated aggregate
  // retained only the first slot, allowing incomplete recipes and breaking Q3085 effect-play DigiXros.
  "BT19-025": [
    {
      materials: [{ names: ["Greymon"], colors: ["Blue"] }, { names: ["MailBirdramon"] }],
      count: 2,
    },
  ],
  // BT19-063: [DigiXros -2] [SkullKnightmon] x [DeadlyAxemon]. The generated aggregate retained
  // only the first named slot, so the server could not accept the complete printed recipe.
  "BT19-063": [{ materials: [{ names: ["SkullKnightmon"] }, { names: ["DeadlyAxemon"] }], count: 2 }],
  // BT19-065: [DigiXros -1] 5 Lv.5-or-lower [Cyborg]/[Composite] Digimon cards with different
  // card numbers. The generated parser retained unrelated header tokens as traits and dropped
  // the five-card cap, while also encoding 1 as the requirement's material-count field.
  "BT19-065": [
    {
      materials: [
        {
          levelComparison: { op: "lte", value: 5 },
          nameOrTrait: [{ tokens: ["Cyborg", "Composite"], match: "trait" }],
          differentCardNumbers: true,
        },
      ],
      count: 1,
      maxMaterials: 5,
    },
  ],
  // ST19-10: [Tyrannomon]/[Raremon] in name plus a Lv.4 [Puppet] Digimon.
  "ST19-10": [
    {
      materials: [
        { nameOrTrait: [{ tokens: ["Tyrannomon", "Raremon"], match: "name" }], level: 4 },
        { traits: ["Puppet"], level: 4 },
      ],
      count: 2,
    },
  ],
  // BT19-102: [Nene Amano] is a Tamer material and the second slot accepts either named Digimon.
  "BT19-102": [
    {
      count: 1,
      materials: [{ names: ["Nene Amano"] }, { names: ["Luminamon", "Shademon"] }],
    },
  ],
  // EX12-029: the printed slot is one Lv.5-or-lower Digimon with [Gokuumon] in its text
  // OR the [SW] trait. The generated aggregate incorrectly made these predicates ANDed and
  // required two materials, so keep server legality and client highlighting on the printed rule.
  "EX12-029": [
    {
      materials: [
        {
          levelMax: 5,
          nameOrTrait: [
            { tokens: ["Gokuumon"], match: "text" },
            { tokens: ["SW"], match: "trait" },
          ],
        },
      ],
      count: 2,
      maxMaterials: 1,
    },
  ],
  // EX12-015 prints the same Lv.5-or-lower Gokuumon-text OR SW slot as EX12-029.
  // The generated aggregate drops the level ceiling and ANDs its split predicates.
  "EX12-015": [
    {
      materials: [
        {
          levelMax: 5,
          nameOrTrait: [
            { tokens: ["Gokuumon"], match: "text" },
            { tokens: ["SW"], match: "trait" },
          ],
        },
      ],
      count: 2,
      maxMaterials: 1,
    },
  ],
  // EX3-014: up to 5 differently named Digimon whose trait CONTAINS Dragon/saur/Ceratopsian.
  // This includes Dragonkin, Rock Dragon and Dinosaur (Q3377), not only exact trait tokens.
  "EX3-014": [
    {
      materials: [
        {
          traitContains: ["Dragon", "saur", "Ceratopsian"],
          differentNames: true,
        },
      ],
      count: 2,
      maxMaterials: 5,
    },
  ],
  "BT11-018": [
    {
      materials: [{ names: ["OmniShoutmon"] }, { names: ["ZeigGreymon"] }],
      count: 3,
    },
  ],
  // BT11-012: the printed three distinct DigiXros slots were collapsed to Shoutmon only.
  "BT11-012": [
    {
      materials: [{ names: ["Shoutmon"] }, { names: ["Ballistamon"] }, { names: ["Dorulumon"] }],
      count: 2,
    },
  ],
  "BT11-019": [
    {
      materials: [
        { names: ["OmniShoutmon"] },
        { names: ["ZeigGreymon"] },
        { names: ["Ballistamon"] },
        { names: ["Dorulumon"] },
        { names: ["Starmons"] },
        { names: ["Sparrowmon"] },
      ],
      count: 2,
    },
  ],
  // BT19-010: the generated aggregate retained only the first of the four printed slots.
  // Preserve the full X4 recipe for the play subsystem and client material projection.
  "BT19-010": [
    {
      materials: [
        { names: ["Shoutmon"] },
        { names: ["Ballistamon"] },
        { names: ["Dorulumon"] },
        { names: ["Starmons"] },
      ],
      count: 2,
    },
  ],
  "BT11-030": [
    {
      materials: [{ names: ["MetalGreymon"] }, { names: ["Cyberdramon"] }],
      count: 2,
    },
  ],
  "BT11-071": [
    {
      materials: [{ names: ["DarkKnightmon"] }, { names: ["Tuwarmon"] }],
      count: 2,
    },
  ],
  "BT11-081": [
    {
      materials: [{ names: ["MadLeomon"] }, { traits: ["Bagra Army"] }],
      count: 2,
    },
  ],
  "BT11-086": [
    {
      materials: [{ traits: ["Xros Heart"] }],
      count: 3,
      maxMaterials: 1,
    },
  ],
  // BT11-009: two distinct printed slots. The compiler kept only Shoutmon and thereby made
  // the two-material conditional On Play branch impossible to reach through a legal DigiXros.
  "BT11-009": [
    {
      materials: [{ names: ["Shoutmon"] }, { names: ["Starmons"] }],
      count: 1,
    },
  ],
  // BT10-111: the printed requirement is any 1 Digimon with [Xros Heart] in its traits.
  // The compiler incorrectly fused the card's (Rule) Shoutmon name alias into the same
  // material slot, narrowing the recipe to Shoutmon AND Xros Heart.
  "BT10-111": [
    {
      materials: [{ traits: ["Xros Heart"] }],
      count: 2,
      maxMaterials: 1,
    },
  ],
  // EX4-021: [DigiXros -2] "Blue MetalGreymon" + "DarkKnightmon" (documented behavior — slot 1 is
  // IsDigimon + name contains "MetalGreymon" + HasCardColor(Blue); slot 2 is name "DarkKnightmon").
  // The compiler flattened slot 1 to the single name token "Blue MetalGreymon"; split it here.
  "EX4-021": [
    {
      materials: [{ names: ["MetalGreymon"], colors: ["Blue"] }, { names: ["DarkKnightmon"] }],
      count: 2,
    },
  ],
  // BT19-070: [DigiXros -1] 3 Lv.4 [Composite] Digimon cards with different card numbers. The
  // generated parser omitted the level/different-number predicates and the three-card cap.
  "BT19-070": [
    {
      materials: [
        {
          levelComparison: { op: "eq", value: 4 },
          nameOrTrait: [{ tokens: ["Composite"], match: "trait" }],
          differentCardNumbers: true,
        },
      ],
      count: 1,
      maxMaterials: 3,
    },
  ],
};

/**
 * Intrinsic conditional trash-source allowances printed on DigiXros cards.
 * The value lists every Digimon name the controller may have while the allowance
 * remains active; an empty battle area also satisfies the condition (Q6014).
 */
export const DIGIXROS_TRASH_NAME_ALLOWANCES: Readonly<Record<string, readonly string[]>> = {
  "BT18-065": ["Vemmon"],
};

export function digiXrosTrashNameAllowanceFor(cardId: string): readonly string[] | undefined {
  return DIGIXROS_TRASH_NAME_ALLOWANCES[cardId];
}

/** Unconditional self allowances, such as Mervamon's, need no Tamer or replacement cost. */
export function digiXrosAllowsTrashWithoutCostFor(cardId: string): boolean {
  return (
    compiledEffects[cardId]?.effects.some(
      (effect) =>
        effect.trigger === "Static" &&
        !effect.isInherited &&
        !effect.isLinked &&
        !effect.isSecurity &&
        effect.condition === undefined &&
        effect.cost === undefined &&
        effect.actions.some(
          (action) =>
            action.kind === "Replacement" &&
            action.event === "wouldBePlayed" &&
            action.condition === undefined &&
            action.cost === undefined &&
            (action.actions?.length ?? 0) === 0 &&
            action.additionalEffects?.some((extra) => extra.kind === "AllowDigiXrosMaterialsFromTrash"),
        ),
    ) ?? false
  );
}

/**
 * The DigiXros requirement(s) for a played card: the hand-authored override when one exists,
 * otherwise whatever the compiler emitted. Read by the server's DigiXros play subsystem and the
 * client's material-highlighting projection.
 */
export function digiXrosRequirementFor(cardId: string): DigiXrosRequirement[] | undefined {
  return DIGIXROS_REQUIREMENT_OVERRIDES[cardId] ?? compiledEffects[cardId]?.digiXrosRequirement;
}

/**
 * The Assembly requirement(s) for a played card (§7-3): whatever the compiler emitted from the
 * card's "[Assembly -N] <materials>" header. Read by the server's Assembly play subsystem
 * (apps/api/src/engine/actions/assembly.ts) and (eventually) the client's material-highlighting
 * projection. Mirrors `digiXrosRequirementFor`, including hand-authored recipes for BT26.
 */
export function assemblyRequirementFor(cardId: string): AssemblyRequirement[] | undefined {
  return ASSEMBLY_REQUIREMENT_OVERRIDES[cardId] ?? compiledEffects[cardId]?.assemblyRequirement;
}

/**
 * App-Fusion legality: can the battle-area Digimon described by `fusingNames` (its top card
 * name followed by its linked-card names) app fuse INTO the fusion-target card `targetCardId`?
 *
 * produced by `the effect factory.AddAppfuseMethodByName(names, cost)`:
 *   - `digimonCondition`: the permanent's top card matches one required name AND a linked card
 *     matches a DIFFERENT required name.
 *   - `linkedCondition`: a linked card matches one required name AND the top card matches a
 *     different required name.
 * Both reduce to "the top card plus the linked cards collectively cover >= 2 DISTINCT names
 * from the target's `appFusionRequirement.names`, including the top card". Returns the
 * app-fusion cost when legal, or `undefined` when the target has no app-fusion requirement
 * or the fusing Digimon does not satisfy it.
 *
 * `topNames` contains the host's current exact names, including active aliases. Linked
 * cards supply their own names; case normalization does not permit substring matches.
 * `topName` remains supported for existing callers with a single host name.
 */
export function appFusionCostFor(
  targetCardId: string,
  fusingNames: { topName?: string; topNames?: readonly string[]; linkedNames: readonly string[] },
): number | undefined {
  const requirements =
    APP_FUSION_REQUIREMENT_OVERRIDES[targetCardId] ?? compiledEffects[targetCardId]?.appFusionRequirement;
  if (requirements === undefined || requirements.length === 0) return undefined;
  for (const requirement of requirements) {
    const required = requirement.names ?? [];
    const requiredNames = required.map((name) => name.toLowerCase());
    const topNames = fusingNames.topNames ?? (fusingNames.topName === undefined ? [] : [fusingNames.topName]);
    for (const topName of topNames.map((name) => name.toLowerCase())) {
      if (!requiredNames.includes(topName)) continue;
      const linkedMatchesOther = fusingNames.linkedNames.some(
        (name) => name.toLowerCase() !== topName && requiredNames.includes(name.toLowerCase()),
      );
      if (linkedMatchesOther) return requirement.cost ?? 0;
    }
  }
  return undefined;
}

/** A paid would-be-played clause changes the material zones; the API must resolve it before selection. */
export function digiXrosRequiresPreparationFor(cardId: string): boolean {
  return (
    compiledEffects[cardId]?.effects.some((effect) =>
      effect.actions.some(
        (action) =>
          action.kind === "Replacement" &&
          action.event === "wouldBePlayed" &&
          (action.actions?.length ?? 0) > 0 &&
          action.additionalEffects?.some((extra) => extra.kind === "AllowDigiXrosMaterialsFromTrash"),
      ),
    ) ?? false
  );
}
