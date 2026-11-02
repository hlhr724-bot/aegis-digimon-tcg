type Params = {
  setId: string;
};

export interface PackPullRates {
  superRare: number;
  ultimateRare: number;
  secretRare: number;
  alternateArt: number;
  label: string;
  limitation: string;
}

export function getPackPullRates({ setId }: Params): PackPullRates {
  const extraSet = /^EX(\d+)$/.exec(setId);
  const boosterSet = /^BT(\d+)$/.exec(setId);
  const hasUltimateRare =
    (boosterSet !== null && Number(boosterSet[1]) >= 25) || (extraSet !== null && Number(extraSet[1]) >= 12);
  let alternateArtsPerBox = 1.5;
  let superRaresPerBox = 7;
  let secretRaresPerBox = 0.5;
  let label = "BT estimate";
  let limitation = "Family estimate; individual sets and print runs may differ.";

  if (extraSet) {
    superRaresPerBox = 6;
    label = "EX estimate";
    alternateArtsPerBox = Number(extraSet[1]) <= 6 ? 3 : 2.5;
  }
  if (setId === "RB1") {
    alternateArtsPerBox = 2;
    superRaresPerBox = 2;
    secretRaresPerBox = 1;
    label = "RB1 approximation";
    limitation = "Includes the English RB-01 reprints; promo-rarity reprints and box promotion slots are omitted.";
  }
  if (hasUltimateRare) {
    label = `${setId} estimate`;
    limitation = "Uses the observed two-UR box model; other rates follow the set family.";
  }

  return {
    alternateArt: alternateArtsPerBox / 24,
    superRare: superRaresPerBox / 24,
    ultimateRare: hasUltimateRare ? 2 / 24 : 0,
    secretRare: secretRaresPerBox / 24,
    label,
    limitation,
  };
}
