# Reactivated effect provenance

When an effect activates another permanent's effect, the activated effect resolves with that permanent's source kinds and controller. The initiating card does not lend its own kinds to the activated effect. Digivolution-card effects use their host's effective kinds (Comprehensive Rules 15-3-2); the existing `effectProvenanceKinds` helper also handles linked effects, DUAL faces and Tamers treated as Digimon.

`reactivateOnPlay` now enters an effect-resolution frame for each activated candidate and restores the previous frame in `finally`. This applies both to selecting one effect and activating every matching effect. It preserves candidate eligibility, activation limits and the initiating effect's continuation. The frame supplies mutation guards with the activated effect's controller, kinds and host permanent, matching normal effect resolution.

The shared path covers On Play, When Digivolving and Main reactivation. Self-reactivation and borrowed-effect interpreter actions already establish their own nested frames and require no change.

## Behavioral evidence

GitHub #6355 reported Jimmy KEN BT22-092 activating a Flame level 6's Main effect and deleting an immune Bearcatmon. The private report contains no match ID or replay, so the regression reproduces the reported interaction synthetically rather than claiming to reconstruct the original match.

`tamer-reactivates-digimon-immunity` evolves Bearcatmon BT26-057 and pays its face-down Tamer-card cost to establish opponent-Digimon-effect immunity through the following turn. On that turn, SkullMeramon BT22-074 evolves into Boltmon BT22-078. Jimmy KEN suspends to activate SkullMeramon's gained Main effect, pays 3 memory, attempts deletion and gains 1 memory after resolution. Bearcatmon survives, both turns finish and the full stack resolves. Without the nested frame, the mutation sees Jimmy KEN's Tamer provenance and deletes Bearcatmon; this survival assertion failed before the correction.

A comparative case supplies a face-up Tamer card, leaving Bearcatmon unprotected. The same activated Main effect deletes it. Both cases assert the immunity cost, final zones, evolution sources and memory. Printed card text and local rulings Q4961–Q4963 and Q7060–Q7062 support the interaction.

The same protected stack was exercised through Orca Browser in the real GameScreen. The opponent evolved Bearcatmon and paid its face-down cost; the player evolved SkullMeramon into Boltmon for 4 memory, accepted Jimmy KEN and declined the optional attack. Bearcatmon remained on the field when the next turn began, Jimmy KEN was suspended and memory was 3.
