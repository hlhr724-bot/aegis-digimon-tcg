const printedNames: Readonly<Record<string, string>> = {
  DeDigivolve: "De-Digivolve",
  DigiBurst: "Digi-Burst",
  BlastDNADigivolve: "Blast DNA Digivolve",
  SecurityAttack: "Security A.",
  UseReq: "Use Req.",
  Link: "Link +",
};

export function getKeywordName(key: string): string {
  return printedNames[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
}
