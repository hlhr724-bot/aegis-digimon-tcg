type Params = { raw: string | null };

export function normalizeDeckGuide({ raw }: Params): string | null {
  return (
    raw
      ?.normalize("NFKC")
      .replace(/\r\n?/g, "\n")
      .replace(/[^\S\n]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || null
  );
}
