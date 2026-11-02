import type { CardInstance } from "@aegis/shared/schema/CardInstance";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import { ResolutionCandidateKind } from "#api/engine/effects/resolution/ResolutionCandidateKind";

export type ResolutionCandidateScope =
  | { kind: typeof ResolutionCandidateKind.ALL.value | typeof ResolutionCandidateKind.NONE.value }
  | { kind: typeof ResolutionCandidateKind.INSTANCES.value; instanceIds: readonly string[] }
  | { kind: typeof ResolutionCandidateKind.BOUNDARY.value; locations: ReadonlyMap<string, string | undefined> }
  | {
      kind: typeof ResolutionCandidateKind.PERMANENT.value;
      permanentId: string;
      instanceIds: readonly string[];
      resident: boolean;
    };

export type ResolutionCandidatePayload = {
  scope: ResolutionCandidateScope;
  permanent?: Permanent;
  transientCandidates?: readonly CardInstance[];
};
