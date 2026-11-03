# Rules knowledge base

The canonical normalized data lives in `data/kb/`:

- `rules-index.json` and `rules/` contain the official rules corpus;
- `qa.json` contains official card rulings;
- `errata.json` contains official corrections;
- `banlist.json` contains restriction history used by the runtime.

Useful commands:

```bash
node tools/kb/query.mjs card BT1-001
node tools/kb/query.mjs rules <term>
node tools/kb/scrape.mjs all
node tools/kb/index-rules.mjs
node tools/kb/check-rules-freshness.mjs
node tools/kb/check-conformance-citations.mjs
```

The freshness command reads the official downloads page and PDF, then compares
the PDF's extracted version and full text with the committed Markdown and all
comprehensive-rules index chunks. It requires `pdftotext` from Poppler. It
returns exit code 1 for a stale corpus and 2 when source parsing or the network
fails. It does not refresh or rewrite any knowledge-base files. A newer official
manual requires a reviewed rule and citation reconciliation before refreshing
`data/kb/rules/` and `data/kb/rules-index.json`.

The citation checker scans conformance tests and every card test containing a
`cite()` call under `apps/api/src/cards`. It verifies IDs, exact chunk hashes,
and review notes; it does not infer behavioral proof from those citations.

Card modules under `apps/api/src/cards/` are maintained directly. Knowledge-base
tools collect and query official material; they do not generate card behavior.

# Rule obligation inventory

`node tools/kb/rule-obligations.mjs --refresh` extracts each numbered clause in
the committed Comprehensive Rules index, deduplicates local Card Q&A by Q number
and exact ruling fingerprint, and records each local errata change in
`data/kb/rule-obligations.json`. `--check` verifies source version, exact text,
card IDs, corpus hashes, record completeness, status fields, and the four
explicit cross-mechanism review targets. Refresh the rules index and local
Q&A/errata first after an official source change.

Every new or changed clause starts as `gap`. A source version change clears all
reviewed statuses, even if some clauses have identical wording. An unchanged
refresh keeps reviewed fields. `proven` requires a reviewed observable
precondition, expected result, and existing behavioral test path; a `cite()` call
or a passing test filename alone never changes the status. Reviewers must
inspect the assertion and its branches before marking a record proven. `gap`
and `not-testable` require a reason and owner; the latter is reserved for
non-normative headings, definitions, or metadata after review. The checker
validates record shape and source freshness, not the semantic strength of a
human proof claim.

The inventory includes 1,119 unique hyphenated comprehensive clauses, four
explicit interactions, 6,622 distinct local Card Q&A rulings, and 92 local
errata changes. The trigger matrix links 31 numbered clauses to named engine and UI scenarios.
The effect-play route scope additionally links 14 obligations. Together with
the UI action/mechanic reviews and legacy reviews, 67 records are classified as proven; 7,770 remain explicit gaps. These scoped scenarios
do not certify every possible interaction of their clauses. The Q&A and errata corpora retain their
August 19 full-crawl timestamps and unverified currency metadata; the later
scoped Q5331 correction does not establish September completeness. The official
manual, Glossary, Rule Q&A, unrecorded Card Q&A/errata changes, individual
branches inside a ruling, and further cross-mechanism combinations remain
outside this inventory. Each needs its own review before a completeness claim.
The counts printed by `--check` are inventory classifications, not a coverage
percentage or proof that the simulator implements the rules.

## Executable scenario scopes

Reviewed obligations can additionally declare `scope` and a nonempty `scenarios`
array. Each scenario has a stable ID, precondition, decisions, expected result,
`layer` (`engine` or `ui`), exact repository-relative `testPath`, exact Vitest
`testName` (full name including suite titles), status, and reason. Every required
scenario must be reviewed before the obligation can be classified as `proven`.
Legacy single-path records remain supported and are not automatically upgraded.
On source drift, scenario definitions and scope membership remain present, but
all scenario proofs are reset to gaps. A refresh cannot silently shrink the
selected scope and leave an apparently complete partial result.

The root `scenarioScopes` manifest fixes the required obligation IDs independently
of the extracted records. `scenarioGroups` combines scopes; a removed or renumbered
source obligation fails validation until its membership is explicitly reconciled.
The `trigger-matrix` group includes simultaneous, rule-check, derived, pending,
optional, prevention/immunity, and Once Per Turn trigger scopes.

Run the complete trigger matrix locally with a 2 GB Node heap:

```bash
NODE_OPTIONS=--max-old-space-size=2048 node tools/kb/verify-rule-scenarios.mjs trigger-matrix
```

The runner validates the inventory, builds shared code, and executes the linked
API and web test files sequentially with one worker and 2 GB heaps. It requires
exactly one passing result for each reviewed scenario. Missing, skipped, failed,
duplicate, and expected-failure evidence is rejected; conservatively, a selected
file containing an expected-failure declaration cannot serve as evidence.
Any remaining gap makes the command fail. It prints source identity, test hashes,
revision, dirty-worktree status, commands, and separate engine/UI results.
Temporary Vitest reports are removed after the run; no evidence status is changed
automatically. Human review is still needed to judge the assertions' meaning.

UI evidence here uses jsdom, React, and the existing real-room/WebSocket scenario
harness. It proves rendered choices and responses through the client/server flow;
it does not prove browser layout, clipping, touch geometry, or visual appearance.
Those require a separate real-browser verification. Audit conclusions for this
scope belong in `docs/engine/trigger-ordering.md`.

## Play and digivolution route matrix

```bash
NODE_OPTIONS=--max-old-space-size=2048 node tools/kb/verify-rule-scenarios.mjs effect-play-routes
```

This scope reviews Assembly, DigiXros, DNA, App Fusion, Burst, and alternate
requirements across manual hand, effect hand, trash, security, and deck-reveal
routes. It links 14 obligations to 30 scenario links and 28 distinct tests,
including the real-room UI DigiXros selection/cancellation scenario.
The tests cover 22 of the 30 cells plus the Biting Crush follow-up and two
DigiXros source-zone ordering regressions, plus two play-completion/pass cases.

`effectPlayRouteMatrix` records all 30 cells separately from obligation status.
The remaining eight cells have `no-printed-provider` reviews, not passing tests
or a claim that their source zones are forbidden. Each review states its catalog
search, relevant candidate IDs and disposition. The validator checks complete
cell membership, applicable rule references, scenario links and review structure.
Catalog and rules-index fingerprints invalidate these reviews after input changes;
refresh preserves the old fingerprints and cannot recertify them automatically.
Semantic absence still requires reviewing the full printed actions and target
zones; a regex or matching hash alone cannot prove it.

The runner includes the matrix in its report. Its source-zone columns refer to the
card being played/digivolved, not the location or timing of the effect's source:
a Security effect playing from hand belongs to `effect-hand`. Cross-set evidence
and the reviewed exclusion rationale live in
`docs/engine/effect-play-route-matrix.md`.

## UI rule flows

```bash
NODE_OPTIONS=--max-old-space-size=2048 node tools/kb/verify-rule-scenarios.mjs ui-flows
```

The group combines `ui-main-actions`, `simultaneous-triggers`, `optional-triggers`,
`effect-play-routes` and `ui-mechanics`. It verifies both engine and UI evidence, retaining the
existing source fingerprints and exact runtime test-name checks. Seven additional
main-action clauses link play cost/placement, passing, target selection, security
checks, Digimon battle and blocking to real-room UI scenarios. DigiXros adds a UI
scenario to its existing engine obligation. The expanded mechanics cover normal
and alternate evolution, DNA, Burst, App Fusion, Assembly, both Link origins,
two-material DigiXros, activated Main and an Option with deferred memory loss.
Exact card identities and source order are checked alongside costs and rendered
results; passing counts alone are insufficient evidence. Complex decisions add
zero/required-minimum/maximum selections, exact duplicate-name instance handling
and attack-target invalidation. The group has 41 obligations, 95 scenario links
and 78 distinct tests; these are scoped evidence counts, not a parity percentage.

Desktop and phone reconnect scenarios answer the preserved decision and check
paid cards, memory and the rendered result. Reconnection is a transport condition
under which the optional processing is tested, not a new comprehensive rule.
Cancellation, acceptance, refusal and trigger order remain separately described
in their scenario records.

Run the wider existing scenario regression locally with:

```bash
cd apps/web
NODE_OPTIONS=--max-old-space-size=2048 TEST_MAX_THREADS=1 pnpm exec vitest run test/*.scenario.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism
```

This suite uses jsdom and reduced motion; it does not prove physical browser
layout or animation timing. The reviewed evidence and remaining gaps live in
`docs/engine/ui-rule-flows.md`.
