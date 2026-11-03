# Hand selection for effect plays

Filtered effect plays permit an empty selection when every eligible candidate is
in the resolving player's hand. This applies to `PlayWithoutCost`, `PlayFromZone`
and budgeted `PlayMultiple`, including a single eligible card. Candidate locations
determine privacy, so a hand/trash search with matches only in hand also permits
refusal. Mandatory searches with eligible public trash cards retain their minimum.
Opponent-chosen targets and previously identified self-plays retain their existing
selection rules.

[Official Q2488](https://world.digimoncard.com/rule/?card_no=BT14-102) establishes
that a qualified target in a private area may be declined. A processing cost paid
before this selection remains paid. Refusal of its payload also preserves an
already consumed once-per-turn activation. Later unconditional processing continues.

## GitHub verification

- [Issue #6508](https://github.com/vinicius3333/aegis-digimon-tcg/issues/6508),
  private feedback #833: all 42 recorded inputs reproduced without divergence.
  That recording ends before the reported Murasamemon interaction. Synthetic
  regressions reproduce the forced selection and automatic single-card play,
  then verify refusal after either security-to-hand or bottom-Tamer-card payment,
  retained payment, shared evolution/attack OPT, legal trait filtering and turn
  progression. The mechanism tests cover all three play actions, private-only
  mixed-zone searches, paid suspension and mandatory public targets.
- [Issue #6509](https://github.com/vinicius3333/aegis-digimon-tcg/issues/6509),
  private feedback #834: no match reference was supplied. A bounded read-only
  correlation recovered the reporter's most recent finished match, immediately
  before the report. Its 76 inputs reproduced without divergence; its Examon DNA
  evolution and attack use EX13-045. No BT23-047 evolution occurs in that match.
  This association does not establish the reported BT23 defect. Additional BT23
  evidence is needed. Synthetic normal/DNA regressions verify five mixed targets
  before the optional attack, merged evolution sources, payment and the opponent's
  next unsuspend phase. Tamers can unsuspend; the Digimon restriction expires after
  that phase, matching the [printed BT23-047 text](https://world.digimoncard.com/cards/?card_no=BT23-047&search=true).

Private evidence remains in ignored local storage. Both issues remain open;
these corrections and checks do not establish production deployment.

## Historical regression records

Existing regression input records now include explicit hand choices where the old
engine automatically played every eligible candidate. Their original card choices,
deck order, game intents and regression outcomes are preserved. Decision IDs, event
counts, state versions and test boundaries were refreshed for the added decisions.
Existing intentionally rejected inputs remain rejected; these normalized test
records are distinct from untouched private production evidence.

Focused checks:

```sh
pnpm --filter @aegis/api exec vitest run src/engine/scenarios/paid-hand-play-can-be-declined.test.ts src/engine/scenarios/examon-suspends-before-attacking.test.ts src/engine/effects/interpreter/actions/handPlaySelection.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism
```

## Validation

- Engine and affected card suites: 1,318 files and 12,928 tests passed with one worker.
- `pnpm typecheck` passed for shared, API and web.
- The full API test typecheck exceeded the 1,536 MiB RSS guard (exit 137). A reduced
  program containing all 25 changed test modules and their imports passed under the
  same guard, peaking at 767 MiB.
- `pnpm check` and `git diff --check` passed; existing warnings remain in unrelated
  files. Independent code review found no remaining material issues.
- Orca Browser verified that Murasamemon can pay with security, pass its single-card
  hand selection and return to play with the card retained and memory unchanged.

Card IR and shared contracts are unchanged; no effect snapshot synchronization or
persistence migration is required.
