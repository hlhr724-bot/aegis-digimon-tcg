import { expect, it } from "vitest";
import { ownParticipant } from "@/tournaments/ownParticipant";

it("identifies the account even when participants share a display name", () => {
  const participants = [
    {
      id: "one",
      accountId: "a",
      kind: "human" as const,
      displayName: "Twin",
      status: "registered" as const,
      seed: null,
    },
    { id: "two", accountId: "b", kind: "human" as const, displayName: "Twin", status: "dropped" as const, seed: null },
  ];
  expect(ownParticipant({ participants, accountId: "b" })?.id).toBe("two");
  expect(ownParticipant({ participants, accountId: undefined })).toBeUndefined();
  expect(ownParticipant({ participants, accountId: "unknown" })).toBeUndefined();
});
