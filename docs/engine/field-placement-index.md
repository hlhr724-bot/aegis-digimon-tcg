# Field placement index

`createCardStateLookup` (`apps/api/src/engine/effects/context.ts`) answers which
permanent holds a card instance. It is called for every effect context, so it does
not scan the field on each call. It keeps an index from instance ID to permanent and
rebuilds it only when the field changes.

## How it detects a change

- Every function in the mutation seam (`apps/api/src/engine/state/access.ts`) that
  changes a battle area, a breeding slot, a top card, a digivolution stack, or linked
  cards calls `fieldRevision.bump()` (`apps/api/src/engine/state/fieldRevision.ts`).
- The index also rebuilds when a player, battle area, or breeding slot object is
  replaced as a whole, as scenario setup does.
- A permanent's `inBreeding` flag is read live, so it needs no bump.

## Rule for new code

Change the field only through the seam. A direct `stack.push`, `topCard = …`, or a
generic helper that splices a field array outside `access.ts` leaves the index stale,
and effects then see a card where it no longer is. Tests that move cards between
permanents must use the seam functions too (`pushOnStack`, `setTopCard`,
`popFromStack`, `linkCard`, `extractLinkedById`).
