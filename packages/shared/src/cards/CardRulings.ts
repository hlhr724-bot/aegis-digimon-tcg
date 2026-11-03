export type CardRulingQuestion = {
  qno: string;
  question: string;
  answer: string;
  date: string;
  related: string[];
};

export type CardErrataChange = {
  before: string;
  after: string;
};

export type CardErrata = {
  date: string;
  changes: CardErrataChange[];
};

export type CardRulings = {
  cardId: string;
  errata: CardErrata | null;
  questions: CardRulingQuestion[];
};
