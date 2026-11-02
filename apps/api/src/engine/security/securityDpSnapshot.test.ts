import { EffectDuration } from "@aegis/shared/schema/enums";
import { expect, it, vi } from "vitest";
import { SecurityDpLedger } from "#api/engine/security/securityDp";

it("restores security DP grants and their original expiration boundaries", () => {
  const original = new SecurityDpLedger();
  original.add(0, 1000, { continuous: true });
  original.add(0, 2000, { duration: EffectDuration.UntilOwnerTurnEnd });
  original.add(0, 3000, { duration: EffectDuration.UntilOpponentTurnEnd });
  original.add(1, 4000, { duration: EffectDuration.Permanent });
  const snapshot = original.snapshot();
  const publish = vi.fn<(seat: 0 | 1, delta: number) => void>();
  const restored = new SecurityDpLedger(publish);
  restored.add(1, 9999);
  publish.mockClear();
  restored.restore(JSON.parse(JSON.stringify(snapshot)));
  expect([restored.deltaFor(0), restored.deltaFor(1)]).toEqual([6000, 4000]);
  expect(publish.mock.calls).toEqual([
    [0, 6000],
    [1, 4000],
  ]);
  restored.sweepTurnEnd(0);
  expect([restored.deltaFor(0), restored.deltaFor(1)]).toEqual([4000, 4000]);
  restored.clearContinuous();
  restored.sweepTurnEnd(1);
  expect([restored.deltaFor(0), restored.deltaFor(1)]).toEqual([0, 4000]);
  expect(original.snapshot()).toEqual(snapshot);
});

it("rejects invalid security DP snapshots before changing the ledger", () => {
  const ledger = new SecurityDpLedger();
  ledger.add(0, 1000);
  const snapshot = ledger.snapshot();
  expect(() =>
    ledger.restore({
      continuous: [
        [0, 1],
        [0, 2],
      ],
      triggered: [],
    }),
  ).toThrow("continuous");
  expect(() => ledger.restore({ continuous: [[0, NaN]], triggered: [] })).toThrow("continuous");
  expect(() =>
    ledger.restore({ continuous: [], triggered: [{ seat: 0, delta: Infinity, duration: EffectDuration.Permanent }] }),
  ).toThrow("triggered");
  expect(ledger.snapshot()).toEqual(snapshot);
});
