import type { Permanent } from "@aegis/shared";
import { partitionClauseMatches, type PartitionClause } from "#api/engine/combat/keywords";

type Params = {
  clauses: readonly PartitionClause[];
  sources: readonly Permanent["stack"][number][];
};

function collectAssignments({ clauses, sources }: Params): string[][] {
  if (clauses.length === 0) {
    return [[]];
  }
  const [clause, ...remainingClauses] = clauses;
  return [...sources].flatMap((source, index) => {
    if (!partitionClauseMatches(clause!, source.cardId)) {
      return [];
    }
    const remainingSources = sources.filter((_, sourceIndex) => sourceIndex !== index);
    return collectAssignments({ clauses: remainingClauses, sources: remainingSources }).map((rest) => [
      source.instanceId,
      ...rest,
    ]);
  });
}

export function listPartitionAssignments(params: Params): string[][] {
  const unique = new Map<string, string[]>();
  for (const assignment of collectAssignments(params)) {
    const key = [...assignment].sort().join("\u0000");
    if (!unique.has(key)) {
      unique.set(key, assignment);
    }
  }
  return [...unique.values()];
}
