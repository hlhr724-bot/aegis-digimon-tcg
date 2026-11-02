# GEPA heuristic evolution

## Difficulty and style measurement

`level_panel.py` runs all 15 difficulty/style combinations against random-legal,
legacy Balanced, certified residual, human-panel-v2 and the turn planner. It also
runs each adjacent difficulty pair in every style. Each comparison uses independent
four-game blocks with both seats and both deck orientations. The committed
`holdout-pool.json` freezes eight test-only deck compositions and a reserved seed
range. Four blocks per comparison rotate through all eight lists.

```sh
pnpm --filter @aegis/shared build
pnpm --filter @aegis/api build
tools/bot-evolution/.venv/bin/python tools/bot-evolution/level_panel.py \
  --run-dir .local/level-panel --node /path/to/node26 --blocks 4 --workers 2 \
  --timeout-seconds 120
```

Level-panel requests default to a 120-second worker timeout because searched games
can exceed the 60-second default used by other panel tools. Values from 60 to 600
seconds are accepted and recorded in the run manifest.

`--seed-block-offset` reserves fresh four-game seed blocks when a prior campaign was
interrupted or invalidated. A four-block screen allocates 348 independent blocks, so
the next non-overlapping run starts at offset 348. Never resume a campaign after its
compiled runtime or worker protocol changes; use a fresh offset and run directory.
For parameter calibration, pass a separate development-pool JSON with `--pool-file`
and `--usage training`. Its deck compositions and seeds must remain outside the
reserved holdout pool. Keep those development results out of final holdout claims.
Use `--adjacent-only` to focus a longer development run on all level-to-level
separations, or `--transition expert` to isolate one adjacent level pair without
spending jobs against the five reference bots. Use `--reference legacy-balanced`
to run every difficulty and style against one fixed reference, for top-level
strength and style-cost checks. Filtered runs keep the seed offsets of the full
panel, so they never reuse the seeds of another comparison.

Each comparison in the summary reports its complete blocks, points rate and a
95% interval over block means (normal approximation). The interval is
screening evidence; promotion decisions still use the sequential tests.

Do not rebuild the compiled runtime during a panel. `PanelBatch` records the
runtime identity, job digest, usage and holdout pool hash, checkpoints results and
rejects incompatible resumes. `PanelPool` and `PanelBatch` reject reserved seeds
or deck compositions for training/tuning. Only explicit `usage="holdout-evaluation"`
allows evaluation on this pool. Held-out outcomes must not be fed back into GEPA
or parameter selection; parameter calibration needs a separate development pool.
The composition test checks the full current pilot pool and DigiLab training lists;
this does not retroactively prove independence from every historical experiment.

The summary includes complete-block win rates, style metrics, local Main policy
latencies and a reference-anchored ladder. Invalid games exclude their entire block
from ratings and remain listed as failures. The report always has `certified: false`:
a small screen is not a promotion, level-separation proof or production latency
measurement. Read the invalid block list before interpreting a ranking.

`rating_ladder.py` accepts an array of `{ first, second, scores }` records, each with
four scores in `{0, 0.5, 1}`. It fits a regularized Bradley-Terry model, fixes the
reference at 1500, and reports approximate 95% curvature intervals. It conservatively
uses one bounded mean-score observation per block instead of four independent game
observations. Disconnected comparison graphs are rejected. Ridge regularization is
reported explicitly; perfect records are finite estimates with uncertainty.
See [Turner and Firth's model reference](https://www.jstatsoft.org/article/view/v048i09).

`pentanomial_sprt.py` accepts an array of four-game score arrays and `--elo0` /
`--elo1`. It returns `accept`, `reject` or `continue` using a constrained multinomial
profile likelihood and approximate Wald boundaries. Four games with draws require
nine score bins, extending the five-bin paired-game method described in
[the primary pentanomial reference](https://github.com/vdbergh/pentanomial).
No pseudo-games are added to empty bins. Blocks must be independent and complete;
invalid games cannot be converted to losses. The boundary approximation has not been
calibrated for discrete overshoot, so retain `certify_balanced.py` as the final gate.

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/rating_ladder.py \
  .local/rating-blocks.json --reference legacy-balanced
tools/bot-evolution/.venv/bin/python tools/bot-evolution/pentanomial_sprt.py \
  .local/score-blocks.json --elo0 0 --elo1 10
```

Panel worker game responses include `style` for both seats: security attacks per
turn, completed-turn memory handovers per turn, blocks declared, seat turns and game
length. Attack redirects do not count as fresh declarations. The final partial turn
counts in the turn denominator; only a completed turn contributes handed-over memory.
An input `{ id, measureStyle: replayRecord }` also reconstructs a recorder replay and
returns the same metrics, refusing any replay divergence. The standalone
`measureStyleEvents` function uses public events and never needs hidden card identities.

## Conditional deck pilots

`learn_pilots.py` uses the official GEPA custom-proposer interface without a model
or API calls. The desktop worker's `--describe-pilots` response discovers every
known, legal, implemented preset and reports excluded recipes with their reasons.
The generator preserves every rule of the certified generic policy and appends
one bounded preference scoped to actual cards in the deck: boss development,
boss security pressure, early Tamer development, or rookie development. These are
frozen hypotheses based on card kind and level, not claims about unmodeled effects.
Their advice states the exact hand, turn, security and memory conditions.

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/learn_pilots.py \
  --run-dir artifacts/bot-evolution/deck-pilots-v1 \
  --deck-pool artifacts/bot-evolution/gepa-balanced-v6/deck-pool.json \
  --desktop-host desktop \
  --node /home/vinicius/aegis-bot-lab/toolchain/node-v26.10.0-linux-x64/bin/node \
  --worker /path/to/frozen/checkout/apps/api/dist/bot/evolution/evaluateCli.js \
  --pairs 48 --gate-pairs 96 --held-out-pairs 2400 --attempt 1
```

The manifest freezes the entire deck and hypothesis family before any games.
Each block has two games, placing the pilot's own deck in each player seat; the
opponent directly uses the certified generic residual. A matched control arm
uses that same generic policy on the same seeds, decks and seats. This controls
for differing inherent deck strength. Train, validation and held-out opponent
decks are disjoint; mirrors are excluded. The gate uses fresh seeds outside the
training and validation splits. The approximate paired Wilson screen corrects
for all frozen hypotheses across the shared family's maximum three waves. Fresh
held-out activation uses a conservative empirical Bernstein lower bound on paired
seed-block differences in [-1, 1], with sample variance and the range-scaled
Maurer–Pontil correction. The lower bound must exceed zero. Its error budget is
`0.05/(3*number_of_decks)`. Before games, the manifest records uniformly sampled
held-out seeds without replacement from a reserved 100-million-seed domain.
The bound adjusts its delta by each deck's probability of unique independent seed
draws. The shared registry retains failed reservations and requires disjoint
held-out domains between waves. These are scoped pilot/control and opponent-split
results, not a new aggregate strength certificate or MCTS guide publication gate.

GEPA must finish every reserved hypothesis. Invalid games and transport timeouts
stop selection and retain their artifacts. Completed stages can be resumed only
with identical inputs; partial stages require diagnosis and a new run directory.
`--only-deck` executes a subset of the already frozen family without reducing its
multiple-comparison budget. `catalog.json` includes only distinct GEPA selections
that also pass the held-out bound. Resume and catalog assembly reconstruct every
completed GEPA selection, raw validation score, proposal gate, held-out score and
activation decision; altered summaries cannot enable a pilot. Rejected decks and custom lists continue to
use the unchanged certified generic fallback. Live catalogs route pilots by the
exact main-deck and egg-deck card multisets, reject unavailable presets, and refuse
two aliases that would overwrite the same multiset. A later wave needs a new run
directory, `--attempt 2` or `3`, and a disjoint `--seed-offset`, such as 100000000
or 200000000. Its family budgets stay fixed rather than resetting after rejection.

## Learning against the current balanced bot

`learn_balanced.py` evolves bounded score adjustments on top of the current
projected balanced policy. A neutral residual reproduces the control's actions,
seeded tie jitter, readiness guard, legal-action search and driver limits. Only
public observations and the learner's own visible cards reach learned rules.
The deterministic numeric pass precedes official GEPA API reflection. Reflection
edits conditions/card scopes; code owns numeric calibration and activation advice.

Run the orchestration locally with API credentials in the local environment;
all games execute on the desktop. Use a fresh run directory after engine or runner
changes. Balanced evaluations batch up to 32 isolated games per SSH process,
preserving each game's full-task cache identity, result and audit record.

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/learn_balanced.py \
  --run-dir artifacts/bot-evolution/gepa-balanced-v4 \
  --deck-pool artifacts/bot-evolution/gepa-balanced-v4/deck-pool.json \
  --node /home/vinicius/aegis-bot-lab/toolchain/node-v26.10.0-linux-x64/bin/node \
  --worker /home/vinicius/aegis-bot-lab/checkouts/gepa-delivery-68ed0fef6d/apps/api/dist/bot/evolution/evaluateCli.js \
  --pairs 96 --metric-calls 6144 --numeric-proposals 24
```

The 24-deck pool is a JSON array of legal, implemented repository deck IDs.
Each seed contributes four games: both deck assignments and both learner seats.
Train and selection use different opponent pairings. Certification excludes both
pairings in either orientation and uses fresh seeds. Invalid or timed-out games
remain unscored and prevent acceptance. The pinned GPT-4.1 snapshot uses a 4,096
completion-token limit and a conservative US$5 ledger shared across run directories.
The explicitly priced `--model gemini/gemini-3.1-pro-preview` alternative uses 8,192
tokens including thinking, medium reasoning, and conservative upper-context rates
from the [official pricing table](https://ai.google.dev/gemini-api/docs/pricing).
Switching providers preserves every reservation and the same total cap. Provider
failure stops the optimizer after one failed request and never selects a policy.
Before tuning, all validation seed blocks must pass a neutral-control seat-swap audit.
Neutral numeric rules explore both coefficient directions with code-authored advice.

When paid reflection is intentionally skipped, `--model deterministic` uses the
official GEPA custom-proposer interface with no model calls. Supply a frozen JSON
`--proposal-plan`, use `--numeric-proposals 0`, and reserve enough `--metric-calls`
for the entire plan. The plan records `origin: "deterministic-numeric"`, the pinned
`engineSha256`, `initialPolicySha256`, and a list of distinct `programs`. Only
bounded weights, authored advice and titles may change; features, conditions and
card scopes remain fixed. Record the training screen and construction method in
the plan for reproducibility. `--gate-pairs 384` supplies 1,536 fresh paired games
per hypothesis; the approximate Wilson screen corrects for the whole frozen plan.
GEPA additionally compares full training batches and selects on separate validation.
It stops after the last proposal completes, reports the attempted/completed count,
and refuses selection after a gate failure. Partial deterministic stages require a
fresh directory; exact-task game cache entries remain reusable.

`certify_balanced.py` requires the selected policy to reconstruct from an accepted
GEPA proposal and the actual GEPA validation result. API proposals reconstruct from
their pinned prompt/response after code calibration; deterministic proposals
reconstruct from their frozen numerical plan and a recomputed fresh paired gate.
The certificate records their different origins explicitly. It freezes
the program, engine, worker, evaluator, task list and lineage before execution.
One shared registry permits at most five candidate attempts and three fixed looks
at 1,200, 2,400 and 4,800 complete seed blocks. It accepts only when every game is
valid and the sole preregistered lower confidence bound exceeds 50% against the
current balanced control. Use `--attempt` once per frozen candidate; changed inputs
cannot reuse a reservation.

The certification bound is the empirical Bernstein bound in
[Maurer–Pontil (2009), Theorem 11](https://arxiv.org/pdf/0907.3740#page=4), applied
to one minus the mean score of each four-game block. It uses sample variance with
denominator `n-1` and permits differing deck distributions. Its per-look error
budget is `0.05/(5*3)`, further multiplied by the probability that all 4,800
independent seeds would be unique. That conditioning correction covers the actual
sampling without replacement. The protocol records the amendment from the training
manifest's provisional Hoeffding plan before any held-out candidate games. This
certificate concerns direct strength against current balanced; high-budget MCTS
guide publication remains a separate gate.

## Certified numeric policy

The delivered `programs/certified-balanced.json` catalog contains the actual GEPA
v6 selection: the projected balanced policy with a `sourceDp` residual weight of
`0.2`. The frozen numerical proposal plan used the official GEPA custom proposer
and made no model calls. Independent attempt 2 passed at the second preregistered
look: 5,036 wins and 4,564 losses in 9,600 valid games across 2,400 independent
four-game seed blocks. The family- and unique-seed-adjusted empirical Bernstein
lower bound is 50.5706%, with an observed win rate of 52.4583% against the current
projected balanced control. There were no invalid games, timeouts, rejections,
engine errors or inference fallbacks. The first 1,200-block look did not pass;
attempt 1 remains consumed and invalid due to its repaired projection defect.

The ordinary production app bot uses the legacy evaluation policy. The certified
generic policy is available through `defaultBotOptions` and the opt-in practice
experiment; certification against the projected control does not establish a win
rate against production legacy. Explicit policies and custom profile weight sets
keep their own choices. An explicit catalog can still override startup, with
validation before room admission:

```sh
AEGIS_BOT_HEURISTIC="$PWD/apps/api/src/bot/evolution/programs/certified-balanced.json" pnpm dev
```

This historical catalog is generic. Its result establishes
aggregate strength on the frozen 24-deck distribution, not superiority for every
deck, aggressive/defensive profiles, tournaments or high-budget MCTS. It does not
authorize strict guide publication. The certificate describes its pinned historical
engine; integrating later main changes does not create a new certificate.

The committed [strength evidence](../../apps/api/src/bot/evolution/strength-evidence.json)
pins the policy, merged source/runtime, certifier, protocol, statistics and raw
batch hashes. [proof.tgz](evidence/balanced-v6/proof.tgz) contains the original
protocols, both fixed-look results, all 60 raw game batches and inputs, GEPA
selection/plan/gate evidence, provenance records and independent audits. The full
source/runtime archives remain in the local run directory with their hashes
pinned in those records.

The practice room now forwards the engine match seed to the configured policy;
this wiring was added after the frozen certificate without changing its decision
function. Desktop regressions verify actual startup, seeded policy selection,
accepted main actions and exact catalog/evaluator event equality in both seats.
The benchmark and ordinary default policy now seed decisions by match and seat.
Human opponents and real-time presentation differ from the benchmark.

### Validated Chronomon pilot

`programs/certified-pilots.json` now selects `sourceDp=0.25` for the exact main
and egg card multisets of `bt26-dgo-2026-08-28-7-chronomon@1`. Other decks retain
the generic `0.2` policy. The global `0.25` proposal failed confirmation; its
exploratory Chronomon result selected this separate, deck-specific hypothesis.

A frozen screen used eight new opponents and 960 games. Confirmation used twelve
different opponents, 1,440 fresh seed blocks, both seats, and 2,880 games per arm.
The incumbent won 1,894 games (65.7639%); the pilot won 2,042 (70.9028%). The paired
gain was 5.1389 percentage points, with an empirical Bernstein lower bound of
1.6757 points at alpha 0.01. Only the confirmation games count toward acceptance;
this consumes reservation 3 of the existing five-candidate family.

[Chronomon strength evidence](../../apps/api/src/bot/evolution/chronomon-strength-evidence.json)
pins the scope, engine, protocol and statistics.
[The proof archive](evidence/chronomon-quarter-v1/proof.tgz) includes all 6,720 raw
games, frozen inputs, independent audits, runner sources and resource evidence.
Full-game tests compare the normal default policy with the evaluated policy in
both seats. These results concern the fixed opponent distribution using the
incumbent policy; they do not establish superiority against humans or all decks.
No production deployment or strict guide publication is implied.

## Historical matchups and identities

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/matchup_report.py \
  --proof tools/bot-evolution/evidence/balanced-v6/proof.tgz \
  --output-dir tools/bot-evolution/evidence/balanced-v6
```

The report verifies the pinned proof archive, certificate protocol, accepted fixed
look and all raw batch counts before writing `matchups.json` and the interactive
`matchups.html`. Both are generated and not committed. Its rows cover the historical 24-deck certificate distribution;
they describe candidate performance against the frozen balanced control rather
than certifying uplift for every deck. Matchup groups have their own sample sizes,
and uncertain rows remain inconclusive. Later main integration needs fresh games
before making new strength claims.

Names and portraits are independent of policy strength. The server resolves the
actual deck to a shared persona, and the lobby and game present that same identity.
See the [persona mapping and source rationale](../../packages/shared/src/bot/personas/README.md)
for Rina/Ulforce, other printed Tamer associations, Digimon portraits and fallback
behavior for custom or substituted recipes.

## Residual MCTS experiments

The compiled `evaluateCli.js` accepts `learnerMctsSimulations` to put real-engine
search on the residual learner. With `opponent: "mcts"`, it instead searches for
the opponent. These modes cannot be combined in one comparison. A zero learner
budget preserves the current residual policy's choices and game events.

Search runs at settled Main windows. The current policy's preferred intent is
the first root candidate; other affordable legal declarations are shuffled with
the recorded search seed. Activation-effect choices stay with the current policy
to preserve its per-turn activation tracking. Breeding, combat responses and
private selections also retain that policy. Rollouts reconstruct every recorded
intent, advance the original policy's RNG and guards, verify the visible root and
offered intents, then sample hidden zones with the existing open-decklist belief.
Future rollout choices use the same residual policies. Search reports include
completed/invalid rollouts, the searched seat and elapsed milliseconds. Captured
residual traces are explicitly baseline traces, rather than searched choices.

`mctsMaxSearches` and `mctsStartAfterDecisions` support latency and restoration
probes. A capped-search probe is not a full-game strength result. Strength tests
should freeze their scheduling policy, compare matched seeds and seats against
the same control, and keep invalid games and timeouts unscored. The local
experiment uses one Docker container with a shared 4 GiB RAM ceiling and zero
additional swap; this covers the coordinator and evaluation workers together.
This interface does not establish a new strength certificate. Expert and Master
practice bots now use the worker-backed snapshot search described below; benchmark
results from this experiment do not certify that live configuration.

## Guarded MCTS prefix acceleration

Replay-based MCTS can reuse recorded Main-action catalogs while reconstructing the
exact, unsampled prefix. It checks the expected seat, public information key and
selected action key; a mismatch invalidates that rollout. At the sampled root and
beyond the prefix, the authoritative engine enumerates actions. This reduces action
enumeration work without changing hidden-information access or cloning runtime state.

## Snapshot-based MCTS continuation

Each searched Main position captures the settled engine once. Expert and Master
practice bots use this snapshot path through a bounded worker pool. Expert runs 6
simulations with a 900 ms search budget; Master runs 20 simulations with a
1,450 ms budget. The Standard evaluator supplies root priors, rollout decisions for
both seats and timeout fallback. Style weights affect root scoring and leaf
evaluation. Worker execution has passed a local compiled-runtime smoke check, but
production p95 latency and calibrated strength have not been established. A
10-repetition Node 26.12
snapshot-restoration benchmark over eight roots measured 10.95× aggregate speedup.
This covers restoration, not complete search simulation or production decision
latency.

The extended benchmark pairs identical two-turn rollouts from replay prefixes and
restored snapshots. On the default-deck replay (46 recorded inputs), eight roots and
five repetitions measured 10.4× restoration speed but 2.0× simulation speed. On an
independent 65-input replay, it measured 11.1× restoration and 1.9× simulation speed.
All compared rollout outcomes matched; the 10× per-simulation target remains unmet.
These are short local replay samples, not production latency evidence.

Each searched Main position captures the settled engine once. Every simulation
restores that runtime snapshot, samples hidden zones, applies the selected root
action and continues both seats through the authoritative engine. Rollouts stop
after the requested opponent-turn horizon or decision budget and evaluate the
resulting public position. This avoids replaying the match prefix for every
simulation. The snapshot graph preserves engine callbacks and aliases; a missing
runtime descriptor or an unclassified schema symbol rejects the simulation.
Opponent hidden identities are sampled from complete famous and DigiLab decklists,
weighted by currently public cards and archetype meta share. The sampler receives
only public card identities and hidden-zone sizes, so changing the true hidden
card identities does not change the selected belief sample.

Replay-prefix search remains available for historical replay studies. That path
reconstructs the exact unsampled prefix, verifies the expected public information
key, and invalidates a rollout on a prefix mismatch. It does not participate in the
snapshot-based evolution runner.

The compiled `replayAccelerationBenchmark.js` accepts JSON on stdin. Benchmark
budgets 8, 32, 128 and 256 in `mode: "single-search-after-prefix"` with
`startAfterDecisions: 16` and paired enabled/disabled runs. Each measured game
contains exactly one search after the prefix; warm-up searches are excluded from
timing. Every rollout must complete, the recorded catalog path must execute, and
seeded events, actions and search reports must match. This mode measures the cost
of a bounded search inside a real game. `mode: "full-game"` searches every MCTS
decision and measures a different, more expensive workload. Neither benchmark
establishes playing strength; timings from an earlier runtime do not establish
speedup after a main integration.

## MCTS and pilot evolution

The official GEPA package evolves bounded JSON heuristics; the TypeScript
interpreter scores legal engine actions. Each rule contains plain English advice
for future strategy-guide publication. Candidate code is never executed.

The runner first trains a generic policy on composed random decks, then
coevolves Glowing Dawn and Toho Braves pilots. Each generation freezes an archive
of the other pilots; pilots face both that archive and an information-set MCTS
opponent. Training, model selection, and final evaluation use disjoint seeds.
Final evaluations compare the selected and initial policies on the same tasks.
Training adaptively screens search budgets up to 8 completed real-engine rollouts
per main choice by default. Strict publication requires a separate final budget of
at least 128 completed rollouts.
Incomplete search budgets, policy fallbacks, rejected intents, and truncated
games cannot produce valid fitness results.

MCTS reconstructs the engine by exact replay, then samples hidden copies uniformly
over unknown deck/hand/security slots under an open-decklist assumption. The
observer's hand, public zones, and face-up security stay fixed. Future shuffle
streams are resampled. This belief discards remembered hidden locations and
ordered-deck knowledge, rather than pinning cards to privileged server locations.
The other seat uses the candidate heuristic during rollouts. Search expands one
new edge per rollout and uses UCT and terminal-game reward backpropagation.
Each rollout receives a turn horizon measured from its search root: the root turn
plus the configured match turn limit (60 by default). The outer match retains its
original absolute turn limit. Reaching either limit without a terminal result
remains invalid; a cutoff is never scored as a draw. Late searches therefore do
not lose their rollout horizon merely because the outer game is near turn 60.

The late-terminal-rollout regression restores recorded MCTS choices from a random
deck match, verifies root information hashes and offered action counts, and runs
one real determinized rollout. That rollout previously stopped at turn 61 and
now reaches a security win at turn 62, with both prefix replay modes. Its forced
search choices are regression data, not strength or publication evidence.
Bot decision-policy changes later moved the match path, so the fixture was
re-recorded with the same seed and decks. The first 31 roots use 16-simulation
MCTS choices; later roots use the rollout heuristic, and the outer game ends by
security at turn 60. Root 37 (turn 58) with simulation 2 gives the regression
rollout: five recorded heuristic choices that end in a security win at turn 62.
Engine rule fixes merged from `develop` later changed the window at root 35. The
fixture keeps the first 35 roots and takes the rollout-heuristic action at roots
35 to 39; the outer game still ends by security at turn 60. Root 37 is now at turn
60, so its simulation 2 rollout forces action 0 as its first choice, records the
next four heuristic choices, and wins by security at turn 62.

Search is currently applied to settled Main windows; other windows use the
rollout heuristic. Full engine replay is expensive. Logs report actual completed
and rejected simulations, and the run directory pins the compiled engine hash.
A low-budget smoke run is development evidence, not a validated strategy guide.

## Multi-fidelity campaigns

Replay-based campaign runners reconstruct every simulation from the seed because
they need the complete historical prefix. Local snapshot continuation is available
for settled engine states, but cannot replace that replay path for arbitrary replay
roots. Earlier replay-based measurements found prefix replay at 40–75% of rollout
time at mid-game roots, with full rollouts played to the end of the game. Glowing
Dawn matches cost about 7–10 ms per engine decision, about five times the
random-deck cost.

These options define a new experiment. They are off by default, and a run that uses
them is not equivalent to a full 128-simulation campaign:

| Option                    | Effect                                                                         |
| ------------------------- | ------------------------------------------------------------------------------ |
| `--screen-simulations`    | GEPA training, selection and reflection screening use this MCTS budget.        |
| `--screen-rollout-turns`  | Screening rollouts stop at that turn and score `evaluateSearchPosition`.       |
| `--selection-pairs`       | GEPA's selection set uses only the first N validation seed blocks.             |
| `--gate-simulations`      | Proposal gates use this MCTS budget instead of `--simulations`.                |
| `--gate-rollout-turns`    | Proposal gate rollouts stop at that turn and score `evaluateSearchPosition`.   |
| `--sequential-looks`      | Gates and stage confirmation play one look of seed blocks at a time.           |
| `--teacher-simulations`   | Traced training games add advisory searches from the learner's seat.           |
| `--final-control generic` | Held-out pilot results use the accepted generic policy as control.             |
| `--heuristic-batch-size`  | Heuristic-opponent games share one worker process; search games stay isolated. |

A heuristic-opponent pilot game costs about 6.6 s alone, and about 2 s of that is the
engine fingerprint plus module loading. Three batched games took 9.1 s instead of about
20 s, with outputs identical to separate runs apart from latency samples.

Multi-fidelity screening requires `--fixed-opponent`. The proposal count follows
the selection set size, so a smaller set yields more proposals per stage.

The sequential gate uses an exact one-sided sign test on one task-hash
representative per seed block. Each look spends `0.05 / proposals / looks`, so the
familywise error stays bounded for any stopping time. A gate stops for futility when
the control leads or when even all remaining blocks could not reach the threshold.
Those stops are non-binding and only lower acceptance. Gates for the same parent
reuse one set of fresh gate blocks, so the parent's control games come from the cache.
Bonferroni over proposals holds under that dependence. More proposals make each gate
stricter, so a stage that wants several proposals may need more `--pairs`.

With `--gate-simulations`, a campaign has three tiers. GEPA screens at the screening
budget, proposal gates run at the gate budget, and the stage winner must then beat its
starting policy at `--simulations` without rollout bounds. Confirmation uses fresh seed
blocks, the same looks and its own 0.05 error budget. If confirmation fails, the stage
keeps its starting policy; `selected.json` records the gate winner and the evidence.
Held-out final evaluation always runs at `--simulations` without rollout bounds.

Measured on Examon against Toho Braves, a full game at 128 simulations with full
rollouts took 37–46 minutes and about 125 s per search. A screening game at 16
simulations with two-turn rollouts took 33–38 s and about 3.7 s per search, including
worker startup. The games diverged, so these are cost figures, not paired outcomes.

Teacher searches run after the learner has chosen its action and never change the
played game; a test checks that results, decisions and opponent searches match.
Reflection receives up to six `teacherDisagreements` per game where the search's top
action had more than twice the visits of the played action. Those are noisy hints from
short searches against a heuristic opponent, not ground truth. Validation and held-out
games never capture traces, so teacher data stays in the training split.

In one-sample measurements at 16 simulations, two-turn rollouts cut rollout time 2–11×
early in the game. Late roots gain less because prefix replay dominates. Examon
against Toho Braves fell from 7.0 s to 1.2 s per search after 16 decisions; Glowing
Dawn against Examon fell from 10.4 s to 8.1 s after 40 decisions.

## Desktop execution

The user's Windows desktop is SSH host `desktop`, reached through Tailscale.
Run engine tests and simulations inside its WSL checkout with the provisioned
Node 26 environment `/home/vinicius/aegis-bot-lab/env.sh`. Keep each SSH/WSL job
attached until completion. Use one Vitest worker and a bounded Node heap.

LLM reflection can remain on the local machine while complete evaluations run on
the desktop. This keeps API credentials local, and sends one JSON configuration
per game over SSH, rather than transferring every action over the network.

Install Python dependencies with `uv sync --group dev` in this directory. For
the current isolated desktop checkout:

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/evolve.py \
  --run-dir artifacts/bot-evolution/desktop-gepa-smoke-8 \
  --desktop-host desktop \
  --node /home/vinicius/aegis-bot-lab/toolchain/node-v26.10.0-linux-x64/bin/node \
  --worker /home/vinicius/aegis-bot-lab/checkouts/gepa-2026-10-10-v2/apps/api/dist/bot/evolution/evaluateCli.js \
  --simulations 8 --metric-calls 512 --pairs 24 --generations 2 \
  --evaluation-timeout 21600 \
  --evaluation-workers 4 \
  --reflection-model session
```

The configured reflection model defaults to `openai/gpt-4.1`. Its credentials
are supplied through the local environment. A run directory can be resumed only
with the same engine and parameters; completed stage artifacts are reused and
GEPA retains its own checkpoint state. Use a fresh directory after code changes.
GEPA 0.0.27 does not checkpoint its random-number generator or shuffled batch
sampler. Restarting the same command can therefore change later optimization
choices even when it reuses completed evaluations. Keep a controlled run
uninterrupted; if interruption is unavoidable, record the resume in its evidence
instead of claiming an identical optimization trajectory.
Four bounded desktop workers evaluate independent games while preserving batch order.
A complete random-deck game exceeded the two-hour default deadline at 256
rollouts per search, so certification at high budgets needs a separate measured runtime budget.
The deadline is recorded in the run manifest. An execution timeout aborts
evaluation; it does not count as a heuristic loss. Valid exact-task games remain
reusable from the adapter cache when a fresh run uses a longer deadline.
A shared cache reuses only valid games with identical policy, task, engine, and
search budget; reflection additionally requires recorded traces. GEPA's internal
candidate/example-ID cache is disabled because list loaders reuse integer IDs
across training and validation. The adapter cache uses the full task instead.
After changing the optimizer protocol, reuse only valid exact-task game outputs
in a fresh run; do not migrate old optimizer checkpoints or selected stages.
Official GEPA
callbacks record proposed policies separately from the retained candidate pool.
Raw games, stderr logs, selected pilots, lineage, and held-out results remain
under the ignored run directory.

The training action and material-selection modules were adapted from
`feat/bot-bt26-chronomon` at `a2692dcbdf`. Its deployment changes were not imported.

## Research and current limits

- [GEPA adapter protocol](https://gepa-ai.github.io/gepa/guides/adapters/) and
  [official implementation](https://github.com/gepa-ai/gepa).
- [Information Set Monte Carlo Tree Search](https://pure.york.ac.uk/portal/en/publications/information-set-monte-carlo-tree-search/).
- [DCG Nexus](https://dcg-nexus.com/) lists Toho Braves and Glowing Dawn among
  its tracked archetypes for 27 September–4 October 2026 (checked 10 October).
  The exact pilot decks are pinned repository tournament lists, not claims that
  these lists are the strongest current builds.

A local experimental preview can use a completed low-budget run. It does not
establish improved playing strength. High-budget evaluation is still required
for ordinary guide publication.

## Experimental preview and live practice

For a completed paired run with at least eight simulations per search:

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/preview.py \
  --run-dir artifacts/bot-evolution/desktop-gepa-timeboxed-preview-8 \
  --base-url http://localhost:5173

AEGIS_BOT_HEURISTIC="$PWD/apps/api/src/bot/evolution/programs/preview.json" pnpm dev
```

Preview pages explicitly identify the limited evaluation and use `noindex`.
The preview renderer checks complete paired games, both player seats, matching
selected and control policies, and pinned engine and runner fingerprints. The
strict publisher below retains its minimum of 128 simulations.

The live catalog contains `schemaVersion: 1`, a `generic` heuristic and `pilots`
keyed by the exact supported deck version. A deck pilot is selected only when
the actual main and Digi-Egg card multisets match; other decks use the generic
policy. `AEGIS_BOT_HEURISTIC` and `AEGIS_BOT_CHECKPOINT` are mutually exclusive.
Restart the API after changing the catalog. Rejected actions disable the policy
for that match and use the standard bot fallback. Live games retain the normal
bot action cap and presentation pacing; the benchmark uses a pinned evaluation
engine and removes think delays. The live app is not an identical benchmark run.

To compare bot policies against real players instead, use the opt-in
[bot A/B experiment](../../internal-docs/ai/bot-ab-experiment.md). It stays
off while either explicit policy above is configured.

## Guide publication

After the high-budget run completes, publish its selected policies and paired
held-out results to static HTML (crawlable without JavaScript):

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/publish.py \
  --run-dir artifacts/bot-evolution/desktop-gepa-isolated-256 \
  --base-url https://aegis-digi.online
```

The publisher requires matching engine/policy fingerprints, both player seats,
valid final games, explicit zero invalid simulations in every search, and complete
search budgets of at least 128 rollouts. It
refuses low-budget smoke results and requires an alternative policy evaluated
in completed games. The selected policy must differ semantically from the original baseline and beat its
paired held-out control with a positive confidence lower bound. Publication
preserves every active rule's
exact advice and conditions, exposes benchmark denominators and the paired
starting-policy control, and links to Aegis practice. Generated pages live in
`apps/web/public/strategy-guides/`; deploying those pages is a separate delivery
step. No raw game traces or hidden observations are published.

The EX13-era DigiLab campaign has separate guide routes for Examon, Jupitermon,
UlforceVeedramon, TS Mervamon, Toho Braves, and Glowing Dawn. These routes support
the exact deck versions in the campaign; adding a route does not publish a guide
or relax the held-out evidence requirements.

If an external reflection provider is unavailable, `--reflection-model session`
uses the active coding session as the proposer. GEPA writes each exact prompt
under the stage's `reflections/` directory and waits for a matching response
fingerprint. The coding session reviews the real feedback and supplies a fenced
JSON candidate. These prompt/response records make the provenance explicit;
this mode does not claim an external API model produced the candidate. The
same GEPA selection and real-engine evaluations still apply. Session runs can pass
strict publication when each selected stage includes an audited prompt/response
archive frozen with its selection. The publisher verifies both file hashes, prompt
fingerprints, complete response coverage, and the exact selected stage. Missing or
modified archives are rejected. Public evidence identifies session reflection and
includes archive hashes, but does not expose private prompts or responses. This
records provenance; it does not claim an independent API model authored the proposals.

## Numeric selection and publication gates

`learn_combo_pilots.py` freezes 18 finite public-state hypotheses for the exact
Ulforce `ex4-dgo-2022-06-25-1-ulforceveedramon@1`, Mirage
`ex6-dgo-2024-07-06-1-miragegaogamon@2`, and Shine
`bt25-dgo-2026-06-06-4-shinegreymon@1` versions. Each preserves the certified generic
rules and appends one authored, card-scoped Main rule, using own board/hand predicates
and weights 4, 8, or 12. The 24-deck opponent pool remains separate from these three
targets. Unsupported intentions are frozen as metadata, outside the scored program.

The launcher requires `--run-root`, `--amendment`, `--prior-registry`, `--prior-run`,
`--deck-pool`, `--node`, and `--worker`. `--freeze-only` closes and allocates the family
without launching games. `--attempt 1` uses 96 training/validation, 384 gate, and
2400 held-out seed blocks per deck; attempt 2 prospectively uses 192, 768, and 9600.
Both waves' counts, hypotheses, runtime, runner, opponent partitions, and unique
held-out seed plans are frozen before either runs. `--only-deck` can select a subset
of the three targets without changing their allocated confidence budget. Completed
selections are reconstructed from raw games before their catalog is assembled.
`--desktop-system` freezes the exact WSL prefix `--system -d Ubuntu` for descriptor,
process capture and every match, supporting a verified runtime built in desktop RAM.
Omitting it retains ordinary WSL transport. Changing the prefix prevents resume.

The append-only amendment retains the full original wave-one alpha charge of
0.05/3, retires original waves two and three permanently, and divides the remaining
0.05×2/3 over three targets and two waves. Activation uses the existing conservative
paired seed-block empirical Bernstein bound at alpha 0.0055555556 per target/wave.
Training screens retain their explicitly approximate corrected Wilson gate. Failure
does not refund either budget. The original registry and every run artifact retain
their bytes and hashes, including stale summaries, partial reservations and raw
invalid games. Separate immutable closure records authorize the new family.

If the original wave ended in a non-resumable infrastructure failure,
`--prior-failure <record.json>` accepts `kind: infrastructure-failure-abandonment`,
the nonzero `orchestratorExitCode`, the absolute immutable failure `log`, and its
byte `logSha256`. The launcher captures local and desktop process snapshots and
refuses closure while any worker or orchestrator is live. It verifies the original
source/runtime archives, completed raw selections, partial frozen reservations,
and a disk/I/O failure in the log. Its terminal audit records completed, partial,
and unstarted decks explicitly. Invalid games keep null scores and do not become
losses. This abandonment authorizes a prospective family; it makes no strength claim.

Independent balanced certification preserves the GEPA selection's original engine
and policy identities. `certify_balanced.py --runtime-amendment <record.json>` can
pin a repaired certification runtime without rewriting the selection. A
`projection-repair` record permits only the declared visibility/verifier changes.
A `main-integration` record additionally verifies the merge parents and ancestry,
the complete source archive against the commit's Git blobs and file modes, and
the actual desktop build record with source checks before and after compilation.
All runtime changes are declared, and every production bot module must retain its
membership and bytes; only test modules and the previously reviewed projection
verifier are exempt. The worker binds the live API, shared runtime and dependency
lock to that archive before and after games. Historical selection scores continue
to describe the original runtime. Strength on the integrated engine requires a
fresh reserved certification attempt with the existing seeds, family budget and
confidence gates.

Run `tune.py --manifest <run>/manifest.json --program <program.json> --tasks <tasks.json>
--output <selection-dir>` before paying for reflection. It evaluates fixed, reproducible
single-weight neighbors through `HeuristicAdapter` and the same compiled worker as GEPA.
Conditions and authored advice stay fixed; weights retain their signs. Each candidate
faces the frozen initial control on the same seeds. At least 48 distinct games are
required, rechecks add no samples, and paired confidence calculations group seats and
opponents by engine seed. Numeric selection uses an approximate paired Wilson win test with one task-hash
representative per seed and corrects for the number of predeclared proposals. The
strict publisher retains the more conservative Hoeffding bound on complete seed blocks.
The MCTS-only subset must independently pass that same paired improvement gate;
archive wins cannot compensate for no demonstrated gain against MCTS. Its output is selection evidence: freeze the winner
and evaluate new held-out seed blocks before claiming improved strength.

Each structural proposal is screened on at least 48 fresh same-seed games against
its parent before admission to GEPA. Seeds are separate from training, validation
and final testing, and the gate corrects for the predeclared proposal limit.

Reflection defaults to thin feedback (the final eight recorded decisions, without the
card-text dump). `feedbackMode: "rich"` enables the longer diagnostic dataset. A
`blockedIntents` list records ideas unavailable in the grammar without changing policy
identity or scores. Exact score ties use seeded randomness derived from the public
window, preserving deterministic prefix replay; traces report tied actions per window.

Invalid games and timeouts have null fitness. An incomplete GEPA batch stops with its
audit artifacts rather than supplying artificial losses. Strict publication requires a
policy distinct from the seed, at least 48 valid paired held-out games, and a positive
95% seed-block Hoeffding lower bound against control. Duplicate cached games never add
independent evidence. A weight sign change with unchanged advice also blocks publication.
Pilot test matchups exclude mirrors; larger deck pools rotate opponents across splits.

Preview catalogs set `strictVerified: false`, so Home exposes the guides link only after
strict publication. Pilots identical to generic have no deck page. Preview sitemaps
contain no noindex URLs; canonical origins come from the required `--base-url` option.

API reflection requires `--dollar-cap`, `--input-usd-per-million` and
`--output-usd-per-million` with prices checked for the chosen model. The runner sends
`--completion-tokens` (4096 by default) on the wire, disables automatic paid retries,
and reserves a conservative upper cost before each call across all stages. Reservations
are never refunded for missing usage or unknown library pricing. Prompts, raw API
responses and the shared budget ledger are saved with the run. Session reflection incurs no reflection API charges. Its audited provenance is
required for strict publication; the same high-budget MCTS and held-out improvement
gates apply regardless of reflection origin. Existing session runs without frozen
reflection records remain ineligible; do not retroactively certify their provenance.

Settled engine snapshots are implemented for bot search, including runtime ledgers,
usage tracking, RNG state, and rebuilt callbacks. They reject unsupported runtime
state and preserve the existing replay path for arbitrary historical roots. Current
evidence includes snapshot round-trip tests and a compiled worker smoke check.
Fuzzer-seeded Main-position continuation now matches every suffix event and final
state across 1,000 randomized cases. Mid-resolution, combat-window and full
random-action-trace conformance remain unverified. The restoration benchmark clears
its 10× target, but complete search-simulation speed is still unverified. Snapshot
support does not by itself certify live-search strength or production latency.

Training selects a search rung adaptively by default (`--fixed-opponent` disables it).
The seed first faces a seeded random legal-action control, then progressively larger
MCTS budgets up to `--simulations`. A rung advances after its approximate Wilson win
lower bound clears 50%; the first blocked interval is bisected to find an intermediate
budget. This is a heuristic bracket: larger MCTS budgets are not guaranteed to be
monotonically stronger. Each rung records played games, independent seed blocks and its mastery result.
Archive opponents remain frozen while the search budget changes. These are training
screens; the final held-out report uses the independently configured search budget.

### Independent campaign seed allocation

`evolve.py --seed-offset <integer>` offsets game seeds, search seeds, and random
composition seeds across training, validation, and final testing. The default zero
preserves existing task generation. Choose an unused range before starting a new
campaign; the offset is frozen in its manifest and cannot change on resume.
Changing the offset does not by itself prove that a range is unused: check prior
experiment manifests before allocation. Runtime calibration games must remain
outside the campaign's training, selection, proposal-gate, and final-test ranges.

`--turn-limit` fixes the outer match horizon for every training, selection, and
held-out task, including both selected policies and controls. It defaults to 60
and accepts 1–200 turns. The manifest pins this value, and task cache keys include
it; changing it requires a new campaign. Use a prospectively chosen longer limit
when random-deck matches need more turns to reach a terminal result. A cutoff
remains invalid and never becomes a draw or a fitness loss.

`--final-pairs` independently fixes the number of reserved seed blocks per pilot
for final evaluation (24–1000). When omitted, it inherits `--pairs`. Training and
validation sizes remain controlled by `--pairs`; the manifest records both values.
Choose the final sample size before running the campaign and do not increase it
in response to an unfavorable confidence bound. Both seats are played for every
block, and archive opponents do not replace the required MCTS comparisons.

### Paired reflection batches

`evolve.py --reflection-pairs 4` samples four complete training seed blocks per
GEPA reflection. Generic batches contain eight games; pilot batches additionally
include the frozen archive opponent in both seats. Blocks rotate deterministically
without replacement within an epoch, and the final short batch is not padded with
duplicate games. Incomplete or duplicated seat pairs are rejected. The setting is
pinned in both campaign and stage fingerprints; changing it requires a new run.

This reduces feedback collection per proposal while preserving the full initial
validation, fresh proposal gates, and final held-out sample. It does not accelerate
the initial validation or establish a strength gain. The strong MCTS reference,
invalid-game rejection, and strict publication criteria remain applicable.
The [TCG bot comparison](../../docs/tcg-bot-training-comparison.md) records the
sources and limits motivating shorter reflection cycles and future opponent
diversity. Four pairs is an engineering starting point, not a proven optimum.

## Structural rules from panel games

`panel_evolve.py` lets GEPA change the structure of a tuned heuristic program. It
plays cheap panel games (about 0.2–3 seconds each) instead of MCTS searches.

How it works:

- The candidate has two components, `main_rules` and `other_rules`. Each one is a
  JSON object `{"scope": "...", "rules": [...]}`. Main rules all carry
  `when.kind = "main"`; other rules never do. Two components let GEPA merge
  improvements from separate lines.
- The adapter assembles the full program (schema version 1, at most 100 rules)
  and validates it in Python and in the real engine parser before any game. An
  invalid program scores 0 on every block, and the feedback names the error.
- One data item is a block: one human deck matchup against one opponent bot, in
  four games (both deck orientations, both seats, fixed seeds). The score is the
  block mean. The objective score is `opponent:<name>`, so GEPA keeps a Pareto
  front per opponent (`frontier_type="objective"`).
- Blocks balance who moves first. In each deck orientation the candidate moves
  first in one game and second in the other. `block_games` sets an explicit
  `firstSeat`, which `panel_worker.mjs` passes to `runBotMatch`. Before this, the
  engine derived the first seat from seed parity, which always equalled the
  candidate seat, so earlier panel runs measured the candidate only when moving
  first. Their results are not comparable with later runs for (orientation 0,
  seat 1) and (orientation 1, seat 0).
- A panel job with `recordReplay: true` returns a `replay` record
  (`aegis-replay-inputs/1`) that `runReplay` reproduces exactly. With
  `diagnosticBaseline` as well, the result lists `changedPositions`: each main
  window where the candidate and baseline choices differ, with `inputIndex`,
  `seat`, `information`, `turn`, `candidateAction` and `baselineAction` numbered
  in the restored search window. Pass an entry to `replayContinuation` to compare
  both branches. Activation choices cannot be mapped to that window and are
  counted in `changedPositionSkips`.
- Game results are cached on disk by the full job payload and a fingerprint of
  the compiled engine, so validation and held-out games are never replayed.
- The reflective dataset shows each block's outcomes. For lost games it shows a
  few close decisions: the chosen action, its score, the top alternatives with
  their action features, and the printed text of the cards involved.
- Splits reuse the bot-lab split of `pairs.json`. Training uses the fitness
  matchups, validation uses 24 blocks per opponent, and the test matchups stay
  untouched until the final comparison.

Run it from this directory with the compiled API in `apps/api/dist`:

```sh
uv run --offline python panel_evolve.py \
  --start-program ../../.local/bot-lab/best-program.json \
  --pairs ../../.local/bot-lab/pairs.json \
  --run-dir ../../.local/bot-lab/gepa-panel-v1 \
  --node ~/.nvm/versions/node/v26.12.0/bin/node \
  --workers 4 --deadline-minutes 75
```

The run uses session reflection: it writes `reflections/NNNN-<sha>.prompt.json`
and waits for a matching `.response.json`. Re-running the same command resumes
from `gepa/`. At the end it writes `selected-program.json`, `summary.json`
(proposals, accepted candidates, merges, scores), and `held-out.json`. The
held-out comparison plays the start and selected programs on the same test games
(150 matchups against `legacy`, 75 against `certified`, 600 and 300 games) and
reports win rates with 95% intervals and the paired difference.

`--planner` turns on the main-phase turn planner. It is off by default because it
makes games slower.

Panel workers have a 120-second request timeout, including incomplete responses.
A timeout terminates the worker and records an invalid game; later games start a
fresh process. Crashes and malformed responses receive one retry. `PanelPool.run`
accepts an `on_result` callback, serialized across workers, for saving each result
before dispatch continues. Persistence failures stop dispatch and propagate to the
caller.
`PanelPool.cancel` also stops active requests promptly, allowing an independent
resource monitor to enforce memory limits without waiting for game completion.

`PanelCheckpoint` stores an input/runtime manifest and appends each result to
`results.jsonl`, flushing it to disk before acknowledging it. Reopening the same
directory loads completed game IDs so the caller can skip them. Changed manifests,
duplicate IDs, corrupted complete records, and simultaneous writers are rejected.
An interrupted final JSON line is discarded so only that game needs rerunning.
The caller owns the manifest, missing-job selection, and resource limits. Do not
rebuild the API or shared package while evaluating a frozen runtime.

## Diagnosis and numeric tuning on human deck pairs

`panel_diagnose.py` reproduces a deterministic sample of distinct certified-bot
losses from a completed paired validation. It verifies the original outcome,
termination reason and turn before analyzing traces. Its counts describe the
selected losses and the recorded top-three alternatives; they do not establish
that an alternative would have won.

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/panel_diagnose.py \
  --validation-run .local/bot-lab/fresh/validation-final-v1-v2 \
  --run-dir .local/bot-lab/v3-diagnosis \
  --node ~/.nvm/versions/node/v26.12.0/bin/node
```

`panel_tune.py` preserves the starting program's conditional rules, card scopes,
rule order and interpreter settings. It changes only 29 generic main-phase
weights. The initial six-hypothesis screen also tests a bounded additional
condition discouraging excessive hand activations, finishing pressure and
favorable board attacks. A diagonal CMA-ES pass then tunes the selected anchor.
All proposal generation is local and deterministic, without model API calls or
MCTS.

Run from the repository root with Node 26 and a built, frozen API/shared runtime:

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/panel_tune.py \
  --start-program apps/api/src/bot/evolution/programs/human-panel-v2.json \
  --pairs .local/bot-lab/pairs.json \
  --run-dir .local/bot-lab/v3-tuning \
  --node ~/.nvm/versions/node/v26.12.0/bin/node
```

The screen uses 32 original fitness matchups, followed by four generations of
eight candidates on 16 new fitness matchups each. Each matchup contributes both
deck orientations and both learner seats. Training allocates 50% of matchups to
`certified`, 25% to `legacy`, and 25% to the frozen starting program. Candidate
selection reuses 96 separate original validation matchups with equal opponent
counts and the same 50/25/25 objective weights. Selection requires an improvement
over the starting program, no opponent regression above two percentage points,
and no increase in invalid games. Invalid games score zero. These are development
scores, not independent strength evidence.

`PanelBatch` limits execution to four workers, 512 MiB Node heaps, 60-second
requests and a 2,560 MiB aggregate worker RSS ceiling. A monitor checks memory
independently of game completion and cancels active requests on a violation.
Compiled-runtime changes stop execution. Source, runtime, inputs, settings and
full job payloads are hashed into locked manifests; completed results and
generation state support an exact resume using the same command. A different
protocol requires a new directory.

Freeze one selected candidate before using independently reserved matchups:

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/panel_confirm.py \
  --candidate .local/bot-lab/v3-tuning/selected-program.json \
  --baseline .local/bot-lab/v3-tuning/start-program.json \
  --pairs .local/bot-lab/v3-confirmation-reserve/pairs.json \
  --run-dir .local/bot-lab/v3-confirmation \
  --node ~/.nvm/versions/node/v26.12.0/bin/node
```

Confirmation assigns reserved matchups 50/25/25 across the same opponents. Both
arms use identical seeds, deck orientations and seats. The primary metric is the
paired matchup point difference, with invalid games scoring zero. Its approximate
95% normal interval clusters four games by matchup and combines opponent strata
with the frozen weights. Acceptance requires at least 20 matchups per opponent,
a positive weighted lower bound, a positive certified point estimate, no opponent
drop above two points, and no increase in invalid games. Complete valid blocks and
valid-only arm rates are secondary diagnostics. This comparison describes bot
opponents on the reserved deck distribution; it does not measure wins against
humans or meet the separate strict MCTS guide-publication gate.

A locked `confirmation-attempt` manifest beside the reserved pair file prevents
testing another candidate on that reserve, including from another output
directory. Keep reserved pairs out of training and selection, and retain rejected
confirmation evidence. Neither command changes the application default or deploys
a program.

The standalone [human-panel-v3 catalog](../../apps/api/src/bot/evolution/programs/human-panel-v3.json)
contains the candidate selected by this procedure. It preserves all 42 v2 rules,
changes the generic finishing-attack and favorable-battle weights, and appends
one hand-activation condition. Four generations of numeric proposals did not
displace that initial combined hypothesis under the selection guards.

Independent confirmation used 240 new human deck pairs and 1,920 games. The
weighted paired gain over v2 was 2.1875 percentage points, with an approximate
95% interval of 0.5112 to 3.8638 points. The valid-game win rates were 44.6764%
to 46.5553% against `certified`, 55.4167% to 59.5833% against `legacy`, and
51.6667% to 52.5000% against frozen v2. Each arm had one invalid game on the same
certified pairing. The certified-only and frozen-v2 intervals include zero;
the aggregate and legacy intervals exclude zero.

[The aggregate evidence](evidence/human-panel-v3/summary.json) pins the program,
protocol, baseline, runtime and results. Production-derived raw decks and games
remain in ignored local evidence. The catalog retains v2 planner parameters for
compatibility, but this confirmation used the heuristic alone. The existing
experiment loader still selects v2; v3 is available for review without activating
an experiment or changing the default bot.

## Activation memory costs

Registered IR effects expose a conservative range of declared immediate memory
spending. A maximum of `null` means unknown, while a maximum of zero establishes
that the effect has no declared immediate memory payment. Fixed payments, optional
payments and supported nested costs contribute to the range. Paid plays,
evolutions, borrowed effects and unsupported operations remain uncertain.

This projection describes gross spending. Memory refunds, triggered responses and
future end-of-turn payments are outside its scope. The `handover` feature therefore
estimates payment risk rather than predicting the final memory gauge. The
`costUncertain` feature identifies unresolved ranges; `freeActivation` applies
only when the upper bound is zero. A paid activation that fits the current memory
budget does not qualify for the free-effect bonus.

`panel_activation_costs.py` compares historical v3, projection alone, a corrected
free-effect bonus, and two bounded uncertainty penalties. Only the three programs
with the corrected bonus are eligible for selection. Its 64 FITNESS matchups and
96 VALIDATION matchups produce 2,048 development games; original TEST matchups and
independent confirmation pairs stay unused during selection.

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/panel_activation_costs.py \
  --baseline apps/api/src/bot/evolution/programs/human-panel-v3.json \
  --pairs .local/bot-lab/pairs.json \
  --run-dir .local/bot-lab/v4-development \
  --node ~/.nvm/versions/node/v26.12.0/bin/node
```

For a historical v3 control, confirmation accepts `--frozen-opponent v3
--no-baseline-activation-costs --seed-base 31000000`. The scoring adapter removes
only the new activation cost fields from the historical learner and frozen v3
opponent. Candidate scoring keeps them. Certified opponents use the current
default scorer in both arms, so absolute rates from older runtimes are not an
equivalent comparison. The helper source participates in the runtime fingerprint.

The corrected-bonus candidate gained 0.78125 percentage points on development
selection, but independent confirmation on 320 unseen matchups and 2,560 games
did not establish a strength gain. Its weighted paired difference from historical
v3 was -0.46875 points, approximate 95% interval [-1.44010, +0.50260]. Each arm
had eight invalid games on the same tasks. The candidate failed the frozen
acceptance criteria and is retained as rejected evidence, without a v4 catalog
promotion. The declared-cost information remains a separate correctness change.

[The activation-cost evidence](evidence/activation-memory-costs/summary.json)
preserves the candidate, frozen protocol, comparison, diagnostic counts and
artifact hashes. Raw production-derived inputs stay in ignored local storage.

## Losses by archetype

`panel_archetypes.py` groups a completed paired confirmation by learner and
opponent archetype, using deck orientation independently of player seat.

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/panel_archetypes.py \
  --comparison .local/bot-lab/v4-confirmation \
  --pairs .local/bot-lab/v4-confirmation-reserve/pairs.json \
  --references .local/bot-lab/archetype-references.json \
  --output .local/bot-lab/v4-archetypes
```

References are frozen famous-deck recipes with `deckId`, `archetype`, `mainDeck` and
`eggDeck` fields. Classification compares main-deck multisets, discounts cards
common across archetypes, and requires sufficient overlap and separation from
the next family. Ambiguous lists remain `Unclassified`. Reports pin the reference
snapshot, input pairs, raw results and analysis sources by SHA-256.

Priority tables require at least 20 valid candidate games, eight matchups and
three distinct lists. Rates are descriptive and unadjusted for opponent mix;
the paired changes and opponent breakdowns guide replay inspection. They do not
establish per-archetype strength or a rules defect. Reproduce the exact outcome
before drawing mechanical conclusions from any selected loss.

In the activation-cost confirmation, 53.4375% of learner exposures could be
classified. Plutomon won 8/34 valid games and Omnimon 15/38 with the candidate.
These rates combine the three opponent strata and are exploratory. Sixteen
selected losses across four weak learner groups reproduced exactly and yielded
558 decisions. Scores rounded to three decimals in traces tied in 64/122 card selections, all nine effect
option choices and all 46 trigger-order choices. Some choices, such as evolving
versus deleting a target, had identical feature vectors. This identifies useful
places to add decision context; it does not prove that another choice would win.

### Structured decision context

The interpreter now provides optional, bounded summaries of declared immediate
resources, actions and spending for effect options and trigger ordering. Summaries
follow offered option indices and generated trigger keys, including explicit null
entries for decline and unsupported effects. Deferred watcher bodies are summarized
when they trigger; installing them does not advertise their future rewards.
Selection goals distinguish gaining, discarding, playing, evolving and materials.
Ambiguous recipients remain unknown. These fields describe declarations rather
than guaranteed outcomes and never evaluate conditions against hidden state.

`selectionGoal`, `effectControllerSeat`, `effectSummary`, `choiceSummaries`,
`triggerSummaries` and `triggerControllerSeats` are automated-seat metadata. They
introduce no human pick constraint or presentation requirement; the web contract
therefore registers them with null consumers. Existing candidates, ownership
checks and private decision delivery still govern every response.

`panel_decision_context.py` keeps all 43 v3 rules and compares fixed selection,
effect-choice, trigger-order and combined additions. Its control strips only the
new decision metadata before scoring and tie-breaking. Both arms retain the
current activation-cost projection. The certified and legacy opponents run the
same current runtime in both arms; the frozen v3 opponent separately disables
new decision context. This comparison is against v3 scoring on the current
runtime, not a claim of reproducing the original v3 binary or human win rate.

Development uses 64 FITNESS matchups for screening and 96 disjoint VALIDATION
matchups for selection, with all five programs evaluated at each stage. Candidate
selection requires a positive weighted change, no additional invalid games and no
opponent decline above two percentage points. A selected program still requires
one independent, frozen confirmation using `panel_confirm.py` with
`--frozen-opponent v3 --no-baseline-decision-context`; development scores alone
are insufficient for promotion.

The decision-context experiment completed 3,200 development games. The selected
ordering policy preserves all 43 v3 rules and adds nine trigger-order rules. It
was the only variant that passed development guards; the combined variant's
larger screening gain did not hold on validation.

The frozen independent comparison used 128 new unordered deck pairs and 1,024
games. The primary rate, counting invalids as zero, was 50.9765625% for the control
and 52.5390625% for the candidate: +1.5625 percentage points, approximate clustered
95% interval [-2.08793, +5.21293]. It did not meet the positive lower-bound guard,
so no catalog was promoted. Against certified the change was +1.953125 points;
against legacy +3.90625; against frozen v3 -1.5625. Baseline had two invalid games
and candidate one. This reserve was consumed once and must not select another
candidate.

Development is separated by match ID. The selected FITNESS64 and VALIDATION96
subsets also have zero exact deck-pair overlap; FITNESS has 63 distinct
compositions and VALIDATION 96. Original TEST IDs and outcomes were unused, but
four exact deck pairs from each development subset also occur in the original
TEST partition. Only the newly excluded reserve supports the independent
matchup-composition claim.

Sixteen selected candidate losses reproduced validity, winner, reason and turn,
recording 596 decisions. Recorded top alternatives tied after rounding in 15/40
trigger-order decisions, 12/12 effect-option decisions and 64/113 card selections.
The selected policy adds weights only for trigger ordering. These tasks differ
from earlier loss samples, so the tie counts are descriptive. Plutomon scored
7/22 versus 5/22 and Omnimon 7/16 versus 7/16 in exploratory grouping; those small,
mixed-opponent samples do not establish archetype strength.

The next hypothesis is to value the benefit of paying an optional cost against
declining it, while distinguishing which cards to spend within an accepted
payment. No weights were adjusted after independent confirmation. Aggregate
results, program, limits and hashes are in
`evidence/decision-context/summary.json`; private raw evidence stays under
`.local/bot-lab/decision-context/`. The existing v2 catalog remains selected and
nothing was deployed. Deploying newly added request metadata can still alter
deterministic tie-breaking with an old catalog.

### Optional single-card payments

`panel_optional_costs.py` compares fixed balanced and conservative additions with
the unchanged 43-rule v3 control on the current runtime. All arms and the frozen
v3 opponent retain current decision metadata and activation-cost projection.
The seven new features value resource gains, the discarded card, the only level 3
starting line, and duplicates. They apply only to the initial choice of exactly
one own-hand card; completing or declining the payment gains no new score.

The automated-only `singleHandCostBenefit` request field certifies a narrow static
IR shape: one own-hand discard and unconditional immediate draw, memory or recovery,
with no memory payment, additional costs or unresolved modifiers. The closed
whitelist rejects unknown shapes, conditional or scaled benefits, and optional
follow-up actions. It describes declared resources, not guaranteed outcomes after
replacement effects. Public deck size and memory headroom limit the valuation;
mixed draw/recovery is ignored when the deck cannot cover both. Human clients
consume this field with a null contract handler.

Development evaluates three programs on 32 FITNESS matchups and 64 VALIDATION
matchups, with four paired games per matchup: 1,152 games. IDs are disjoint, but
one exact deck-pair composition occurs in both subsets. Original training and
validation data are reused; previously consumed independent reserves are excluded
by ID and composition. A positive development result still requires new data for
independent confirmation. No default catalog is changed by this experiment.

The optional-payment experiment selected the conservative policy. On the 64
validation matchups, invalids counted as zero, control scored 120/256 (46.875%)
and the candidate 122/256 (47.65625%): +0.78125 percentage points. Certified was
unchanged, legacy improved by 4.6875 points, and frozen v3 declined by 1.5625.
Each program shared the same one invalid game at each stage. The small result
passes development guards but has no fresh independent confirmation.

Eight paired development matchups reproduced all 16 outcomes and turn counts.
Among captured valued payment opportunities, control declined 15/15; the
conservative policy paid 11/14 and declined three. The runs reached different
states, so these diagnostic counts do not measure global payment coverage or
causal win-rate improvement. No trace reached its recording limit. Aggregate
results and provenance are in `evidence/optional-costs/summary.json`. No catalog
was promoted or deployed; the configured default remains v2.

## Replay teacher campaign on the local PC

`replay_teacher.py` runs the offline replay/search/GEPA experiment without changing
application defaults or experiment arms. It starts from the standalone v3 program,
preserves its rule order, and permits up to eight appended main-phase rules. Other
windows retain v3 behavior. Reflection uses the active coding session through the
existing prompt/response files; no paid model endpoint is required.

Collect inputs with `collect_replay_teacher.py`. Each invocation reads at most a
ten-minute replay modification window, 128 files, 1 MiB per replay and 32 MiB of
replay contents. Supply up to three explicit API log basenames covering those
matches. The collector runs sequentially through `aegis-safe`, streams the selected
API logs, and transfers only replay inputs and matching terminal evidence. It reads
the host instructions first and never changes production files or containers.
Missing terminal evidence excludes a replay. Collection paths must remain ignored.

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/collect_replay_teacher.py \
  --after 2026-10-20T18:50:00+00:00 --before 2026-10-20T19:00:00+00:00 \
  --api-log api-2026-10-20-SEGMENT.jsonl \
  --output .local/bot-lab/replay-teacher/collection/batch-01.json

tools/bot-evolution/.venv/bin/python tools/bot-evolution/replay_teacher.py \
  --inputs .local/bot-lab/replay-teacher/collection/inputs.json \
  --run-dir .local/bot-lab/replay-teacher/campaign-01 \
  --node /Users/viniciusluiz/.nvm/versions/node/v26.12.0/bin/node
```

`inputs.json` is a JSON array of collected rows, deduplicated by `matchId` when
combining batches. Each row contains `matchId`, `observedAt`, `lines`, and `expected`
with `winnerSeat` (null for a draw), `reason`, and `turn`. An optional `roomId`
records provenance only. All raw rows stay local. Additional historical inventories
can be supplied with repeated `--exclude` arguments. The required original, fresh,
v3, activation-cost and decision-context inventories are automatically included;
missing inventories stop execution rather than silently weakening exclusions.

The campaign first reproduces every complete result and checks deck legality.
Only then does it deduplicate unordered main/egg deck compositions, exclude prior
IDs/compositions, and freeze 32 FITNESS, 64 VALIDATION and 320 CONFIRMATION matchups.
The newest eligible matches form confirmation; development ordering is hashed.
It extracts decision examples only from FITNESS after this split is frozen. A
repository-local registry reserves all three splits across output directories.
Fewer than 416 eligible compositions produces an `insufficient-data` report, with
no tuning or reuse of historical confirmation data. Player identities are not
collected, so player-level independence is not established.

The professor selects up to four positions per FITNESS match and 100 total,
prioritizing human/v3 disagreement, attack-versus-development alternatives and
small heuristic margins. It excludes root activations and conservatively excludes
prefixes with public reveals, private visible-card decisions, or moves that can
preserve hidden identities/order. This first version therefore covers early and
simple states; it does not model all remembered information. Search assumes open
decklists, keeps the observer's hand fixed and samples unknown zones without using
the replay's future. All effect decisions use the ordinary training policies.

Each position receives up to 32 completed ISMCTS rollouts, with a three-minute
search deadline and a 190-second worker envelope. Its separate comparison runs 32
fresh paired samples, half with v3 continuations and half with v2, each continuation
checkpointed independently and limited to 60 seconds. Incomplete searches and any
invalid comparison produce no label. A preference requires at least ten percentage
points of aggregate gain and positive means under both continuation policies. The
reported intervals are exploratory, not individual action certificates.

A root that passes this screen is replicated with 208 fresh-seed pairs, half v3
and half v2, in `teacher/<index>/replication`. It becomes a `preference` only when
the lower 95% bound of the mean paired difference is above zero over valid pairs,
and at most 5% of pairs are invalid. Cases keep `preferred` for the screen and add
`replication` and `replicated`. Only replicated preferences reach development, the
alignment audit and the reflection prompt. A diagnostic replication found that only
3 of 11 screen preferences kept a positive lower bound; the mean gain fell from
0.179 to 0.040. Parent runs without `replicated` end inconclusive when refined.

GEPA sees every teacher case once per reflection, including negative, inconclusive
and invalid comparisons. All legal competing actions and a shared card glossary
are included; this avoids repeating a fixed subset or duplicating the full dataset
in every fitness record. A deterministic alignment gate rejects a proposal before
play unless a valid preferred alternative becomes uniquely top-scoring under the
production scorer. Identical hand Tamer copies with the same card ID and complete
feature vector count as the same strategic choice. Other tied alternatives do not
establish alignment.

Each GEPA screen covers all 32 FITNESS matchups (128 games), with the same seats,
orientations and seeds for every proposal. Controlled-seat counters record decision
windows, nonzero added contributions and changed action indices against v3 in the
same state. A zero-change proposal is marked `unexercised`, not certified ineffective.
`candidate-diagnostics/` preserves alignment scores, exposure, missing counters and
full-game scores. Before VALIDATION, every returned candidate must again show a
strict full-FITNESS gain, actual changed choices and no increase in invalid games.
The unchanged baseline is never selected as a candidate.

Development screens use a local paired estimate instead of full-game points. Each
GEPA screen plays its blocks with replay recording, then runs 826 paired
continuations from the positions where the proposal's choice differs from v3. Both
arms share a sample seed, continue with v3 through the panel scoring window, and
face the block's own opponent. Pairs are spread evenly over at most 64 usable
positions, with at least 8 pairs each. In all-bot replays the recorded hidden state
is kept and only each library is reshuffled; a root is refused only when a
library's top card is known. With fewer than 8 usable positions, up to three extra
plays with fresh seeds supply positions but never scores. A block scores 0.5 plus
the estimated per-game change in game points, clipped to [0, 1]; invalid pairs count
as −1. A candidate reaches VALIDATION only if the lower 95% bound of its local
difference is above zero over at least 8 positions, with no extra invalid games.
The protocol is recorded in the manifest, and older run directories are rejected.

Selection and confirmation remain full-game points.
Invalid games count as zero. It allows eight reflections and two merges, selects
only on VALIDATION, and sends one candidate to the frozen confirmation. Both arms
use the same runtime, metadata, seeds and seats. Confirmation contains 2,560 games
and uses the existing paired approximate normal 95% interval: weighted lower bound
above zero, positive certified mean, no opponent mean drop over two points, and no
increase in invalid games. Weights are certified 50%, legacy 25%, frozen v3 25%.
These are bot-opponent results, not evidence of a live-human win-rate improvement.

Run required builds and checks before the campaign, then stop owned watchers.
A source/runtime archive, input hashes, checkpoints and English report remain in
the run directory. No rebuilds or executable edits are allowed while it is running.
Limits are four workers, 512 MiB heap each and 2,560 MiB aggregate RSS. Persisted
wall-clock deadlines cap inspection at two hours, teacher work at eight, evolution
and selection at six, confirmation at eight, and the whole campaign at 24 hours.
Downtime also consumes those deadlines, conservatively preventing hard restarts
from replenishing budgets. Resume only with identical inputs, tools and runtime.

A rejected development campaign whose confirmation was never opened can be refined
in a new directory using `--refine-from`. This reuses its frozen development data
and exploratory teacher results; it does not provide a fresh independent test.
The runner checks original inputs, hashed completed stages, exact split counts,
ID/composition disjointness, deck fingerprints and the global reservation before
proceeding. New provenance, tools and runtime are frozen separately. Confirmation
is claimed globally for one run and candidate across all refinements of that
parent, so it cannot be reused after inspecting an outcome.

```sh
tools/bot-evolution/.venv/bin/python tools/bot-evolution/replay_teacher.py \
  --inputs .local/bot-lab/replay-teacher/collection/inputs-expanded.json \
  --refine-from .local/bot-lab/replay-teacher/campaign-02 \
  --run-dir .local/bot-lab/replay-teacher/refinement-01 \
  --node /Users/viniciusluiz/.nvm/versions/node/v26.12.0/bin/node
```
