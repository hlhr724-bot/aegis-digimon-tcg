type GetArchetypeNameParams = {
  name: string;
  locale: string;
  unknownLabel: string;
};

export function getArchetypeName({ name, locale, unknownLabel }: GetArchetypeNameParams): string {
  if (name === "unknown") {
    return unknownLabel;
  }
  return name.replace(/[_-]+/g, " ").replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase(locale));
}
