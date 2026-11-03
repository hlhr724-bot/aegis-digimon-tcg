type Params = {
  assignments: readonly (readonly string[])[];
  chooseOne: (candidateInstanceIds: string[]) => Promise<string | undefined>;
};

function hasSameCards(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((instanceId) => right.includes(instanceId));
}

export async function choosePartitionMaterials({ assignments, chooseOne }: Params): Promise<string[] | undefined> {
  const picks: string[] = [];
  for (;;) {
    const remaining = assignments.filter((assignment) => picks.every((pick) => assignment.includes(pick)));
    const first = remaining[0];
    if (first === undefined) {
      return undefined;
    }
    if (remaining.every((assignment) => hasSameCards(assignment, first))) {
      return [...first];
    }
    const candidates = [...new Set(remaining.flat())].filter((instanceId) => !picks.includes(instanceId));
    const pick = await chooseOne(candidates);
    if (pick === undefined || !candidates.includes(pick)) {
      return undefined;
    }
    picks.push(pick);
  }
}
