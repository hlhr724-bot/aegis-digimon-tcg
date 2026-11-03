type Params = {
  assignments: readonly (readonly string[])[];
  required: boolean;
  confirm: (assignment: readonly string[]) => Promise<boolean>;
  choose: (assignments: readonly (readonly string[])[], min: number) => Promise<readonly string[]>;
};

function hasSameCards(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((instanceId) => right.includes(instanceId));
}

export async function askPartitionMaterials({
  assignments,
  required,
  confirm,
  choose,
}: Params): Promise<string[] | undefined> {
  const first = assignments[0];
  if (first === undefined) {
    return undefined;
  }
  if (assignments.length === 1) {
    return required || (await confirm(first)) ? [...first] : undefined;
  }
  const chosen = await choose(assignments, required ? first.length : 0);
  const match = assignments.find((assignment) => hasSameCards(assignment, chosen));
  return match === undefined ? undefined : [...match];
}
