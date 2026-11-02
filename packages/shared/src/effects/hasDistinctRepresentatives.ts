function augment(
  member: number,
  valueSets: readonly (readonly string[])[],
  visited: Set<string>,
  valueToMember: Map<string, number>,
): boolean {
  for (const value of valueSets[member] ?? []) {
    if (visited.has(value)) continue;
    visited.add(value);
    const holder = valueToMember.get(value);
    if (holder === undefined || augment(holder, valueSets, visited, valueToMember)) {
      valueToMember.set(value, member);
      return true;
    }
  }
  return false;
}

export function hasDistinctRepresentatives(valueSets: readonly (readonly string[])[]): boolean {
  const valueToMember = new Map<string, number>();
  for (let member = 0; member < valueSets.length; member += 1) {
    if (!augment(member, valueSets, new Set<string>(), valueToMember)) return false;
  }
  return true;
}
