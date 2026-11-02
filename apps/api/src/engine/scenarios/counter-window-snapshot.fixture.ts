import type { PermanentSpec, ScenarioFixture } from "../scenario/types.js";

type DefenderSetup = { hand: string[]; battleArea: PermanentSpec[] };

const BLAST_DIGIVOLVE_BASES: Readonly<Record<string, string>> = {
  "AD1-005": "BT1-020",
  "BT14-014": "BT1-014",
  "BT14-026": "BT1-037",
  "BT14-037": "BT1-051",
  "BT14-049": "BT1-071",
  "BT15-014": "BT1-014",
  "BT15-026": "BT1-037",
  "BT15-038": "BT1-051",
  "BT15-049": "BT1-071",
  "BT16-013": "BT1-020",
  "BT16-026": "BT1-038",
  "BT16-027": "BT1-038",
  "BT16-046": "BT10-079",
  "BT17-018": "BT8-017",
  "BT17-041": "BT10-055",
  "BT17-077": "BT1-080",
  "BT18-040": "BT1-020",
  "BT18-071": "BT1-057",
  "BT18-083": "BT10-022",
  "BT18-102": "BT1-080",
  "BT19-011": "BT1-014",
  "BT19-037": "BT1-051",
  "BT19-050": "BT1-071",
  "BT19-064": "BT10-022",
  "BT19-074": "BT3-089",
  "BT20-021": "BT2-064",
  "BT20-077": "BT1-020",
  "BT20-101": "BT11-053",
  "BT21-051": "BT10-022",
  "BT22-025": "BT1-038",
  "BT22-052": "BT11-053",
  "BT22-066": "BT10-022",
  "BT23-045": "BT10-022",
  "EX10-010": "BT1-020",
  "EX10-023": "BT1-080",
  "EX10-074": "BT10-022",
  "EX12-059": "BT10-022",
  "EX5-013": "BT1-020",
  "EX5-024": "BT1-038",
  "EX5-041": "BT10-079",
  "EX5-053": "BT1-057",
  "EX6-027": "BT1-020",
  "EX6-028": "BT1-038",
  "EX6-035": "BT1-057",
  "EX7-029": "BT1-057",
  "EX7-059": "BT10-079",
  "EX8-026": "BT1-038",
  "EX8-044": "BT11-053",
  "EX8-062": "BT1-057",
  "EX9-013": "BT1-020",
  "EX9-020": "BT1-038",
  "EX9-056": "BT1-057",
  "EX9-065": "BT10-079",
  "LM-001": "BT1-020",
  "LM-005": "BT1-038",
  "LM-013": "BT11-053",
  "LM-017": "BT3-083",
  "LM-021": "BT8-017",
  "LM-022": "BT8-030",
  "LM-023": "BT1-057",
  "LM-024": "BT11-053",
  "LM-025": "BT10-062",
  "LM-026": "BT1-020",
  "LM-043": "BT10-022",
  "LM-044": "BT10-079",
  "P-109": "BT1-038",
  "P-113": "BT11-053",
  "P-114": "BT10-022",
  "P-191": "BT1-020",
  "ST15-12": "BT10-022",
  "ST16-12": "BT10-079",
  "ST17-08": "BT10-022",
  "ST20-11": "BT1-020",
  "ST21-11": "BT1-038",
  "ST22-05": "BT1-057",
};

const BLAST_DNA_MATERIALS: Readonly<Record<string, readonly [field: string, hand: string]>> = {
  "BT17-078": ["BT1-025", "BT1-044"],
  "BT20-045": ["BT20-044", "BT20-027"],
  "BT20-060": ["BT13-075", "BT20-018"],
  "BT20-076": ["BT16-077", "BT20-016"],
  "BT20-081": ["BT14-081", "BT17-040"],
  "EX6-011": ["BT3-016", "BT3-072"],
  "EX6-029": ["BT11-042", "BT11-083"],
};
const COUNTER_EFFECT_SETUPS: Readonly<Record<string, DefenderSetup>> = {
  "BT15-076": { hand: ["BT15-076", "BT15-076"], battleArea: [{ card: "BT3-083" }, { card: "BT3-083" }] },
  "BT25-085": {
    hand: ["BT1-009"],
    battleArea: [{ card: "BT25-085", under: ["BT10-079", "BT10-107"], suspended: true }],
  },
  "BT25-103": { hand: ["BT1-009"], battleArea: [{ card: "BT25-103", under: ["BT1-080", "BT1-020"] }] },
  "BT26-055": { hand: ["BT1-009", "BT1-009"], battleArea: [{ card: "BT26-055", under: ["BT26-040"] }] },
  "EX12-017": {
    hand: ["BT17-078"],
    battleArea: [
      { card: "EX12-017", under: ["BT1-020"] },
      { card: "EX12-035", under: ["BT1-038"] },
    ],
  },
  "EX12-033": { hand: ["BT1-009", "BT1-009", "BT1-009"], battleArea: [{ card: "EX12-033", under: ["BT1-038"] }] },
  "EX12-052": { hand: ["BT1-009"], battleArea: [{ card: "EX12-052", under: ["BT1-071"] }] },
  "EX12-055": {
    hand: ["EX12-058"],
    battleArea: [{ card: "EX12-055", under: ["BT1-051"] }, { card: "BT10-022" }],
  },
  "EX12-057": { hand: ["BT1-009"], battleArea: [{ card: "EX12-057", under: ["BT1-057"] }] },
  "EX12-077": { hand: ["BT1-009"], battleArea: [{ card: "EX12-077", under: ["BT21-019", "BT21-019"] }] },
  "EX13-015": { hand: ["BT1-009"], battleArea: [{ card: "EX13-015", under: ["BT1-020"] }] },
};

const ATTACKERS = ["BT1-080", "BT2-064", "BT3-089"] as const;
const FILLER = "BT1-009";

export const COUNTER_WINDOW_SNAPSHOT_CARDS = {
  blastDigivolve: Object.keys(BLAST_DIGIVOLVE_BASES),
  blastDnaDigivolve: Object.keys(BLAST_DNA_MATERIALS),
  counterEffect: Object.keys(COUNTER_EFFECT_SETUPS),
} as const;

function defenderSetup(counterCard: string): DefenderSetup {
  const base = BLAST_DIGIVOLVE_BASES[counterCard];
  if (base !== undefined) {
    return { hand: [counterCard, counterCard, FILLER], battleArea: [{ card: base }, { card: base }] };
  }
  const materials = BLAST_DNA_MATERIALS[counterCard];
  if (materials !== undefined) {
    const [field, hand] = materials;
    return {
      hand: [counterCard, counterCard, hand, hand],
      battleArea: [
        { card: field, suspended: true },
        { card: field, suspended: true },
      ],
    };
  }
  const setup = COUNTER_EFFECT_SETUPS[counterCard];
  if (setup === undefined) {
    throw new Error(`No Counter window setup for ${counterCard}`);
  }
  return setup;
}

export function counterWindowSnapshotFixture({ counterCard }: { counterCard: string }): ScenarioFixture {
  const defender = defenderSetup(counterCard);
  return {
    name: "counter-window-snapshot",
    memory: 4,
    turnSeat: 0,
    turnCount: 4,
    isFirstPlayersFirstTurn: false,
    board: {
      0: {
        battleArea: ATTACKERS.map((card) => ({ card, under: [FILLER] })),
        hand: [FILLER, FILLER],
        deck: Array<string>(20).fill(FILLER),
        eggDeck: ["BT1-001"],
        security: 4,
      },
      1: {
        battleArea: defender.battleArea,
        hand: defender.hand,
        deck: Array<string>(20).fill(FILLER),
        eggDeck: ["BT1-001"],
        security: 4,
      },
    },
  };
}

export default counterWindowSnapshotFixture({ counterCard: "BT19-011" });
