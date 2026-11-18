import { PrivateTurnOrder } from "#shared/protocol/PrivateTurnOrder";

type Params = {
  turnOrder: unknown;
};

export function getPrivateTurnOrderEntry({
  turnOrder,
}: Params): (typeof PrivateTurnOrder)[keyof typeof PrivateTurnOrder] {
  return Object.values(PrivateTurnOrder).find((entry) => entry.value === turnOrder) ?? PrivateTurnOrder.RANDOM;
}
