# Single-bullet scaled activation

A scaled `Modal` ("for every N, activate 1 of the effects below") snapshots its
activation count, then asks which bullet to run for each activation. That
question has no meaning when the card prints a single bullet.

`runModal` now runs the lone bullet of a scaled `Modal` without an option
prompt. The activation count is still snapshotted once. Availability is still
rechecked before each activation, so the loop stops when the bullet has no
legal target. A scaled `Modal` with two or more printed bullets keeps its
prompt, even when only one bullet is available.

BT27-018 Rubeusdramon is the first user: "For every 8000 DP this Digimon has,
you may activate the effect below: Delete 1 of your opponent's lowest DP
Digimon." Its bullet is an optional `Delete`, so each activation raises one
target prompt that the player may decline. The lowest DP is re-evaluated after
each deletion.

`BT27-018.test.ts` covers one activation at 12000 DP and at 15999 DP, two
sequential deletions at 16000 DP with two target prompts and no option prompt,
and declining every activation.
