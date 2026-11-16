type GetArchetypeNameParams = {
  name: string;
  locale: string;
  unknownLabel: string;
};

export function getArchetypeName({ name, locale, unknownLabel }: GetArchetypeNameParams): string {
  if (name === "unknown") {
    return unknownLabel;
  }
  if (!/^[a-z0-9_-]+$/.test(name)) {
    return name;
  }
  return name.replace(/[_-]+/g, " ").replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase(locale));
}
