const MAIN_TIMING = /^\[Main\]/;
const SECTION_START = /^(?:\[[^\]]+\]|[＜<]Arts Digivolve[＞>])/i;

export function getOptionMainEffect(optionEffect: string): string {
  const lines = optionEffect.split("\n").map((line) => line.trim());
  const mainIndex = lines.findIndex((line) => MAIN_TIMING.test(line));
  if (mainIndex === -1) return optionEffect.trim();
  const sectionEnd = lines.findIndex((line, index) => index > mainIndex && SECTION_START.test(line));
  return lines
    .slice(mainIndex, sectionEnd === -1 ? undefined : sectionEnd)
    .filter((line) => line.length > 0)
    .join("\n");
}
