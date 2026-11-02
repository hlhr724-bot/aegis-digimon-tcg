type Params<T> = { dictionary?: Readonly<Record<string, T>>; key: string };

export function getDictionaryValue<T>({ dictionary, key }: Params<T>): T | undefined {
  if (!dictionary || !Object.hasOwn(dictionary, key)) {
    return undefined;
  }
  return dictionary[key];
}
