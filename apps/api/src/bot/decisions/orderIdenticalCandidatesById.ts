type Params = { ordered: readonly string[]; getSignature: (instanceId: string) => string };

export function orderIdenticalCandidatesById({ ordered, getSignature }: Params): string[] {
  const groups = new Map<string, number[]>();
  ordered.forEach((instanceId, position) => {
    const signature = getSignature(instanceId);
    groups.set(signature, [...(groups.get(signature) ?? []), position]);
  });
  const result = [...ordered];
  for (const positions of groups.values()) {
    const members = positions.map((position) => ordered[position]!).sort((left, right) => left.localeCompare(right));
    positions.forEach((position, index) => {
      result[position] = members[index]!;
    });
  }
  return result;
}
