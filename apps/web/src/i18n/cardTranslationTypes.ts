export interface CardTranslationData {
  names: Readonly<Record<string, string>>;
  text: Readonly<Record<string, string>>;
  byCard?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  keywords: Readonly<Record<string, string>>;
  reminders: Readonly<Record<string, { zhName: string; text: string }>>;
  meta: {
    forms: Readonly<Record<string, string>>;
    attributes: Readonly<Record<string, string>>;
    traits: Readonly<Record<string, string>>;
  };
}
