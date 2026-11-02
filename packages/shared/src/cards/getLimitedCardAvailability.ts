type CardDate = `${number}-${number}-${number}`;

interface LimitedProduct {
  cardNumbers: string;
  releaseDate: CardDate;
  legalDate?: CardDate;
}

const products: readonly LimitedProduct[] = [
  {
    cardNumbers: "001 002 003 004 005 006 007 008 009 010 011 012 013 014 015 016 017 018 019 020",
    releaseDate: "2024-02-16",
  },
  { cardNumbers: "021 022 023 024 025 026 027 028 029 030 031 032 033 034 035 036 037 038", releaseDate: "2024-12-13" },
  { cardNumbers: "039 040 041 042 043 044", releaseDate: "2025-04-25" },
  { cardNumbers: "045 046 047 048 049 050", releaseDate: "2025-10-24" },
  { cardNumbers: "051 052 053 054 055 056", releaseDate: "2026-03-27" },
  { cardNumbers: "057 058 059 060 061 062", releaseDate: "2026-08-28", legalDate: "2026-09-04" },
  { cardNumbers: "063 064 065 066 067 068", releaseDate: "2026-11-27", legalDate: "2026-12-11" },
];

const availabilityByCard: Readonly<Record<string, Readonly<{ releaseDate: CardDate; legalDate: CardDate }>>> =
  Object.fromEntries(
    products.flatMap(({ cardNumbers, releaseDate, legalDate = releaseDate }) =>
      cardNumbers.split(" ").map((number) => [`LM-${number}`, { releaseDate, legalDate }]),
    ),
  );

export function getLimitedCardAvailability(
  cardId: string,
): Readonly<{ releaseDate: CardDate; legalDate: CardDate }> | undefined {
  return availabilityByCard[cardId];
}
