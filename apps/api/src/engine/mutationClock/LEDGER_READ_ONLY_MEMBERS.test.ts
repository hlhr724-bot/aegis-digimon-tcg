import { expect, it } from "vitest";
import { LEDGER_READ_ONLY_MEMBERS } from "#api/engine/mutationClock/LEDGER_READ_ONLY_MEMBERS";

it("lists only members that exist on their ledger", () => {
  const missing = [...LEDGER_READ_ONLY_MEMBERS].flatMap(([ledgerClass, members]) =>
    members
      .filter((member) => Object.getOwnPropertyDescriptor(ledgerClass.prototype, member) === undefined)
      .map((member) => `${ledgerClass.name}.${member}`),
  );
  expect(missing).toEqual([]);
});
