# English name standardization audit

Status: in progress. Baseline `33053bf14`. Standardized English name-token
references are implemented at the shared predicate and every production
substring reader found by the bounded server/client inventory. Complete
positive consumer coverage, live alias priority and card/collection proof
remain open. No card, collection or engine mechanism is certified.

## Contract and source identity

The complete committed comprehensive-0034 (§2-3-1, Name) was read: bracket-only
references identify full names; “with [XX] in its name” identifies a substring.
UTF-8 text SHA-256:
`c0ee1524e24827189e2dcfae2543a217540028723a55d660c84d63e4f29505f2`.

The current official [Language Standardization reference list](https://world.digimoncard.com/rule/pdf/lang-standardization-01.pdf)
was downloaded and its complete thirteen-page layout text read. Physical
pages 2, 3, 4, 10 and 12 were additionally rendered and visually inspected
because the columns distinguish English, Chinese, Japanese and Korean
exceptions. Downloaded PDF SHA-256:
`fd8f08ccb8fe13f9c0044eb1d3a19877d45951e306036657431e32594bbae94b`.
The web screenshot tool failed to fetch its cache; local Poppler rendering
supplied visual inspection. No PDF, screenshot or extracted log is stored
under the audit directory. This external file pin records reviewed evidence;
it is not an automated source-drift check.

Eight English excluded-token groups yield twelve name/token pairs and forty
committed physical card definitions at this baseline. The PDF also supplies
an English positive Kimeramon inclusion for MarineChimairamon; the shared
predicate now encodes that inclusion, and BT4-031 carries that errata-corrected
name in the committed catalog. Chinese/Japanese/Korean token mappings do not redefine the committed
English-name gates; complete multilingual support is outside this bounded
proof and does not receive credit.

| Excluded English token | Printed names                               | Committed definitions                                                                          |
| ---------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Agumon                 | Pagumon                                     | BT19-006, BT2-007, BT25-005, BT26-004, BT6-005, BT9-006, EX10-005, EX9-006, ST6-01             |
| Vee and Veemon         | DemiVeemon                                  | BT12-002, BT16-002, BT2-002, BT20-001, BT3-002, EX13-002, P-188, ST8-01                        |
| Garurumon              | KendoGarurumon                              | BT17-023, BT4-027, BT7-022                                                                     |
| Greymon                | BurningGreymon, DoruGreymon, DexDoruGreymon | BT12-013, BT17-012, BT21-014, BT4-013, BT7-011; BT13-072, BT16-061, BT7-064; BT17-067, BT9-078 |
| Dramon                 | Indramon                                    | EX5-009                                                                                        |
| Starmon                | BeelStarmon, BeelStarmon (X Antibody)       | BT25-085, BT6-112, EX7-059, ST14-09; EX7-073                                                   |
| Impmon                 | Blimpmon, MasterBlimpmon                    | BT20-049, BT24-058, BT4-069; BT24-062                                                          |

The EX13-002 exact catalog contract was read, including blue Digi-Egg level
two, no play/evolution cost, four-copy limit, Baby Dragon trait, the printed
Vee exclusion and optional owner-turn once-per-turn blue-Tamer-triggered
Veedramon-host unsuspend. `node tools/kb/query.mjs card EX13-002` returns no
card-specific entries. The general standardization supplies its name rule
without inventing an EX13-specific ruling. P-009, BT7-011, P-010, ST1-01 and
BT1-037 printed fields and relevant direct modules were inspected for the
public evolution/combat controls.

## Implementation trace

`shared/cards/effectiveNames.ts::nameIncludesToken` normalizes case and name
punctuation, rejects empty tokens and applies the exact standardized excluded
token before ordinary substring matching. Full names remain available in
both existing exact and substring identity lists. No name is truncated or
renamed to remove the excluded letters.

The engine definition name matcher, name component of name/trait/text unions,
and `excludeNames` use this helper. Exact-name branches remain exact. Alternate
name-gated evolution, stack-name requirements, base-granted evolution, DNA
material gates, continuous name overrides, condition readers, and the server
and client Assembly/board projections use the same helper. The DigiXros client
definition matcher mirrors the engine branch.
Plain recipe `names` remain full-name slots in `digiXrosSlotMatches` and are
not treated as substring gates. Literal effect text and traits can still
satisfy their own union branches: name exclusion is not a blanket text ban.

EX13-002's inherited behavior remains exclusively compiled IR through
`registerIrCard`. Only its resolved coverage/residual metadata changes in
persisted IR. The direct P-009 compiled module is unchanged; its inherited
self-name Aura now reads the corrected shared predicate.

## Behavioral obligations

| Obligation                                                                               | Proof and observable result                                                                                                                              | Status                                                                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Twelve standardized excluded name/token pairs                                            | Shared test finds every committed printing of each of eleven names and refuses its excluded tokens                                                       | Verified static name layer                                              |
| Full identity is preserved                                                               | Every affected printing still answers its full name; exact DemiVeemon and exact DigiXros BurningGreymon gates remain true                                | Verified bounded channels                                               |
| Ordinary family names continue matching                                                  | Eight token families accept their ordinary and Mega-prefixed controls                                                                                    | Verified static controls                                                |
| Case/punctuation and empty references                                                    | Case/punctuation normalize, full X Antibody name remains and whitespace-only token is refused                                                            | Verified static boundaries                                              |
| Matcher OR and negation                                                                  | EX13-002 refuses Vee/Veemon, accepts exact DemiVeemon and OR-full-name, and satisfies negated Vee                                                        | Verified production definition matcher                                  |
| Public inherited DP through legal final evolution                                        | ST1-01 → seeded P-009 evolves publicly to BT7-011 for three memory/draw; 6000 DP ties Gorillamon and exact egg/rookie/top are trashed                    | Verified bounded public final step                                      |
| Comparative included name                                                                | Same source evolves to P-010 for two memory/draw, gets 7000 DP and wins Gorillamon battle; exact source stack remains                                    | Verified public control                                                 |
| Client DigiXros substring/exact distinction                                              | Actual BurningGreymon and Greymon candidates offer only Greymon for substring and only BurningGreymon for its exact full slot                            | Verified candidate projection                                           |
| Positive Kimeramon standardization                                                       | Official PDF inclusion is encoded by `nameIncludesToken`; synthetic MarineChimairamon definition and exact-gate negative are covered by shared/API tests | Verified shared/definition seam; live card queued                       |
| All name-gated evolution consumers and other raw substring readers                       | Bounded production inventory routes server/client substring readers through `nameIncludesToken`; exact-name and recipe slots remain exact                | Verified bounded consumer inventory; distinct public card shapes queued |
| Full initial egg-to-rookie route, all excluded peer interactions and live alias priority | Seeded initial legal stack is not a public full evolution-line proof                                                                                     | Queued                                                                  |

The initial public fixture used an incorrect digivolve permanent field and
was corrected before genuine baseline evidence. Genuine baseline: two failed,
thirteen passed; DemiVeemon matcher incorrectly accepts Vee and BurningGreymon
has 8000 rather than 6000 DP, while ordinary Greymon passes. Restored corrected
implementation passes fifteen focused cases. Shared name tests pass thirty
cases. Web board/DigiXros tests pass two files and 123 cases after correcting
the initial candidate payload shape and using actual Digimon candidates
instead of a Digi-Egg, which cannot satisfy this recipe kind gate.

Public final evolution checks exact draw, costs and source identities. Battle
checks exact live/trash IDs on both sides, no security check and no pending
choice. BurningGreymon's conditional evolution deletion cannot activate with
ST1-01/P-009 sources (no Hybrid/Takuya); P-010's Security Attack has no impact
on the ordinary target battle. ST1-01's four-source inherited DP condition
is false. No synthetic card registrations are added.

## Gates and remaining scope

Focused: `pnpm --filter @aegis/api exec vitest run src/cards/P/P-009.test.ts src/cards/EX13/EX13-002.test.ts --maxWorkers=1 --no-file-parallelism`.
Shared: `pnpm --filter @aegis/shared exec vitest run src/cards/effectiveNames.test.ts`.
Web: `pnpm --filter @aegis/web exec vitest run src/game/digiXrosMaterialSelection.test.ts src/game/boardModel.test.ts`.

EX13 sync/check against `33053bf14` aligns sixty records, one semantic change,
zero out-of-set semantic or byte changes. The resolved EX13-002 snapshot
metadata does not certify its whole card. P's sole collection ledger is
reopened because P-009's historical ten omitted this name exception, with
current provisional cap eight. EX13 remains incomplete with provisional
card scope; three other expected engine residuals remain (020, 043, 063).
Broader regression, workspace types, final style/layout/index, review and
delivery results follow. Complete generic engine/keyword plan remains open.

The actual shared exclusion guard was temporarily removed, the shared package
rebuilt and all three proof lanes executed. Shared reproduced thirteen failed /
seventeen passed tests (twelve exclusion pairs and case-normalized exception);
API reproduced two failed / thirteen passed (DemiVeemon name and BurningGreymon
DP); web reproduced one failed / 122 passed (extra BurningGreymon candidate).
The source was restored in `finally` and shared rebuilt from the restored
source. No passing mutation is presented as red evidence.

Broader command `pnpm --filter @aegis/api exec vitest run src/engine/ src/cards/P/ src/cards/EX13/ src/cards/BT7/ --maxWorkers=1 --no-file-parallelism`
passed 728 files / 10157 tests with three declared expected EX13 failures
(10160 total), in 35.95 seconds. `pnpm typecheck` passed shared, API and web.
Complete full API and restored final proofs follow; broad gates run only
after mutation restoration.

Restored final gates passed three API files / nineteen tests (fifteen cards,
four layout), thirty shared cases, and two web files / 123 tests. The current
raw-consumer correction additionally passes three API engine files / 221 tests
and two web projection files / 111 tests. Persisted
JSON semantic inspection finds only EX13-002 changed; its executable effects
are identical and only coverage/residual metadata differs. Independent
read-only review found no introduced exclusion/predicate/registration,
client/server matching, legal final evolution or proof-scope blocker.

The first full API run completed with only an introduced P-009 missing module
link failure (42261 passed, one failed, three expected failures; 42265 total,
5108 files, 165.49 seconds). Both exact links were restored. The old score
verifier then rejected a legitimate five-part current eight; that verifier
has since been removed with the audit ledgers.
Final corrected card/layout/score selection passes four files / forty tests.
The previous failed full run is not a green gate. Final full confirmation
after all score changes passed 5108 files, 42279 tests and three declared
expected failures (42282 total), in 165.79 seconds. No executable name/engine input changed during
the first full run; ledger links/scores were corrected after their failure
was observed. Final workspace typecheck passed shared, API and web. Scoped
Oxlint and Oxfmt checks passed all changed TypeScript and all 22 changed files;
`git diff --check` is clean.

## Live original-name rewrites (issue #4869)

The definition-level matcher remains authoritative for loose cards, but a
battle-area permanent's identity can be replaced by an active original-card
information grant. `permanentMatchesFilter` now resolves `name` and
`nameExact` references against `GameAccess.effectiveNames`. A successful live
name branch satisfies the `nameOrTrait` union; a failed live name branch is
removed before static trait/text alternatives are evaluated, so the replaced
printed name cannot incorrectly remain visible.

EX13-031 proves that deleting an opponent's Digimon after its name is changed
to Sukamon fires the inherited all-player deletion watcher and free-plays the
eligible reveal. EX13-035 proves that the same live opponent Sukamon counts
toward its three-name condition: the aura applies -3000 DP to the rewritten
3000-DP Digimon, rule-deletes it, and then naturally lapses when the board
falls below three matching Digimon. Both regressions use the public play flow
that pays EX13-031's printed trash cost; neither injects an override directly.

The rule-deletion follow-up now also carries effective names captured before
movement, keyed by permanent identity. Deferred `onDeletionOf` filters use
that snapshot when the deleted permanent is no longer live, and simultaneous
rule-deletion pools merge the maps with their existing color and identity
snapshots. This closes the gap where the EX13-035 aura correctly deleted a
rewritten Sukamon at 0 DP but EX13-031's inherited watcher later saw only the
printed MetalGreymon definition. The focused EX13-031 regression fails at the
missing free play on the prior implementation and passes all 26 direct tests
with the snapshot correction.

The baseline focused command failed both new cases while the preceding 52
tests passed. With the matcher correction, the same command passes 54 tests.
