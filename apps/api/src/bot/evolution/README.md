# Heuristic evolution engine

This directory implements bounded JSON heuristics, deterministic legal random
decks, exact engine replay, and information-set MCTS evaluation for the official
GEPA adapter. See [the runner documentation](../../../../../tools/bot-evolution/README.md)
for training, desktop execution, provenance, and current limitations.

Build shared and API packages before invoking `evaluateCli.js`. The worker
accepts one JSON game configuration on stdin and emits one result on stdout;
application logs and MCTS progress go to stderr. `--describe` returns the
compiled engine fingerprint, supported features, seed policy, and pinned decks.

Valid fitness requires a completed game, projection verification, no rejected
intents or policy fallbacks, and every fixed-budget search completing its requested rollout
budget. Time-budgeted residual searches may stop early after at least one valid
rollout, with no invalid rollouts and explicit budget-exhaustion evidence. Invalid games and timeouts have null fitness; incomplete batches stop training. Traces retain actual chosen actions,
source cards, public features, and rule contributions for GEPA reflection.

## Optional benefit selections

A `projected-balanced` program can set `preferBeneficialSelections: true` to
prefer higher-level, higher-cost, higher-DP cards when selecting an accepted
free-play or return-from-trash benefit. It also accepts single-card optional
free-play selections and visible reveal-and-free-play selections whose requests
have no purpose marker. Cost selections, board targets and unrecognized effects
retain their existing behavior. Recognition uses the effect text supplied in the
request and only card identities visible to the acting bot.

The flag is optional and boolean. Omitted or false preserves the previous policy;
standalone rule-only programs reject it. The default live program remains unchanged.
Include the flag in experiment manifests and rebuild the API before comparing the
compiled policy with an earlier runtime. This option does not enable MCTS or
certify a deck's win rate.

## Optional free Option selections

A `projected-balanced` program can independently enable
`preferFreeOptionSelections: true`. It selects the first offered visible Option
when a single-card, zero-minimum request explicitly allows using an Option without
paying its cost and has no purpose marker. It requires visible catalog identities
for every candidate and excludes cards currently on either board or in the bot's
breeding area. The current effect fragment takes precedence over the full text.

Omitted or false preserves the previous policy. Cost selections, required
selections, multi-card requests, unknown effects and hidden identities keep their
existing answers. The flag does not rank Option effects or enable MCTS; combine
it explicitly with other experimental preferences when comparing configurations.
The default live program remains unchanged.

## Residual search tuning

The evaluation worker accepts `mctsExploration` (finite, nonnegative; default
`sqrt(2)`) and `mctsMaxSearchTimeMs` (finite and positive) for residual MCTS.
Other evaluation modes reject these options. Omitting them preserves fixed-count
search selection behavior. Residual match fitness now also requires zero invalid
simulations, including when retries eventually reach the requested count.
`learnerMctsSimulations` remains the maximum completed rollout
count when a time budget is present.

Time is checked between simulations. The first simulation is always attempted;
a running simulation may exceed the requested time. This is a soft search budget,
not a hard deadline. External cancellation still invalidates the search.
Reports include `timeBudget.requestedMs`, `elapsedMs`, and `exhausted`; consumers
must preserve these fields and distinguish time-budgeted evidence from fixed-count
experiments. A search with no valid samples fails instead of fabricating a score.

Compare settings on identical deck pairs, seeds, seats, and engine fingerprints.
Report actual time, completed simulations, invalid simulations, and match outcomes.
Use reserved seeds for confirmation after selecting settings. Concurrent work
confounds timing; speed comparisons require an isolated measurement window.
These controls do not enable production search or train a learned policy.

`mctsRolloutTurns` optionally cuts residual and generic MCTS opponent simulations
at a later turn's first
main-phase choice without pending decisions or combat. It must be an integer from
1 to 200. The actual evaluated match still runs to completion. Terminal outcomes
use the exact game result; healthy cutoffs use `evaluateSearchPosition`. External
cancellation, engine errors, rejected actions, and policy fallbacks remain invalid.
`leafEvaluations` counts accepted heuristic cutoffs in each search report.

Turn-limited rollouts also default to a soft limit of 64 decision callbacks after
the replayed prefix, counting both seats and the root choice. The cutoff is checked
after the root, at the next stable main-phase choice, so pending effects and combat
can exceed the limit. This prevents repeated choices within one turn from bypassing
the turn horizon. Direct `runMctsResidualMatch` callers can override this limit with
`maxRolloutDecisions`, an integer from 1 to 10000, or use it without a turn horizon.
The decision limit does not truncate the live match or provide a wall-clock deadline.

The initial position evaluator is hand-authored, not trained or calibrated as a
win probability. It applies a bounded logistic transform to the difference in
security count (0.65 each), hand count (0.08), permanent levels (0.12), DP (0.10 per
10000), attack readiness (0.15), and observer-relative memory (0.04). Breeding
permanents contribute material too. It reads only the filtered observation and
does not inspect hidden identities or deck order. Its weights require validation
across decks and reserved seeds; short-rollout results are a separate experiment
from full terminal rollouts. Omitting both cutoff controls retains full-game simulations.

`mctsMoveOrderingProgram` accepts a standalone heuristic program validated by the
same parser as other evaluation programs. The baseline action remains first;
all other legal candidates are ranked by rule score, preserving seeded shuffle
order for ties. No actions are pruned. Features and card conditions use only the
search observer's filtered window. Residual programs with a `basePolicy` are
rejected because this ranking evaluates rule scores, not the base policy's
projected action scores. Supply an explicit program; there is no default learned
ordering and no claim that the seed heuristic improves strength. The complete
program must be included in experiment manifests alongside search parameters.

## Local experimental evidence

The October 2026 local screens are exploratory, with no production activation.
Their raw inputs, engine fingerprints, outputs and audits are retained under the
ignored `artifacts/bot-evolution/local-mcts-v1/` directory. These artifacts are
local evidence, not files distributed with this repository.

`regression-decks-budget-screen-v2` completed all 32 searched games across four
decks, two seed blocks and both seats. On the 16 paired cases the no-search
control scored 5 wins, 16 terminal simulations scored 8, and 32 scored 6. This
screen does not establish a monotonic relationship between budget and strength;
the six reserved blocks per deck have not been evaluated with these settings.

`learned-value-confirmation-v1` evaluated a frozen six-feature logistic model
through an experimental runtime hook. Across 24 fresh-seed paired comparisons,
the control won 10 and learned one-turn search won 12, with five gained games and
three lost games. The descriptive paired-seed-block sign-flip p-value was 0.765625.
Results varied by deck and do not establish superiority. The learned model is
not the hand-authored evaluator shipped here and is not enabled by a CLI option.
Its provenance includes the model and hook hashes as well as the engine hash.

`policy-target-dataset-v1` contains 24 valid full matches with 32-simulation
search targets. Both seats of each seed stay together: 12 games supply training
and 12 supply validation. `policy-ordering-model-v1` fits a linear softmax model
to visit frequencies among non-baseline alternatives, with game-equal weighting
and scales fitted on training data only. Validation cross entropy decreased from
2.25285034 for uniform probabilities to 2.25170267. This small imitation gain is
not evidence of stronger play. Exported heuristic scores were checked on 3471
alternatives. The resulting program is frozen before fresh-seed match testing;
it remains an experimental artifact, not a default policy.

`learned-ordering-confirmation-v1` completed 48 valid games: 24 paired
comparisons across six decks, two fresh seed blocks and both seats. Both arms
used 16 simulations and the same frozen learned value model; only ordering
differed. The control won 14/24 and learned ordering won 9/24, with one gained
game and six lost games. The descriptive paired-seed-block sign-flip p-value was
0.125. Observed regressions affected Plutomon, Alphamon, Mamemon and Chronomon;
Craniamon gained one game and Glowing Dawn retained its outcomes. Do not adopt
this ordering model on this evidence. The independent audit recalculates pairs
from raw results and rejects stale summaries; this rejection has a regression
check using deliberately changed raw outcomes.

`ordering-regression-diagnosis-v1` reproduced both arms of all six losses,
including every non-timing output. The first changed decision in each pair had
identical observed information and legal intent sets. The twelve isolated roots
in `ordering-root-reproduction-v2` reproduce the archived choices and search
statistics in seconds. At these decisions, the selected action had only one or
two visits. In 36 healthy root probes, holding the sampled world fixed made both
orderings choose the same intent in all six pairs; increasing only the budget
from 16 to 64 simulations did so in five pairs; increasing only the rollout
horizon from one to two turns did so in none. These are decision-level
mechanisms, not proof that the first changed move caused the eventual loss or
that fixed-world sampling improves play. Fixed-world sampling sacrifices hidden
state diversity and is not an adoption candidate.

`paired-root-worlds-v1` compares independent simulation seeds with seeds indexed
by each root action's visit ordinal. Alternative actions therefore share a
sequence of sampled hidden worlds, while later visits can sample other worlds.
All 48 isolated searches completed successfully. Independent controls reproduced
the archived choices and statistics. At 16 simulations, agreement between the
two action orderings rose from 0/6 to 6/6; at 64, it rose from 5/6 to 6/6.
Audits compare realized hidden-world fingerprints, not only seed identities.
The 16-simulation version can collapse to one world when there are 16 actions,
so it is diagnostic only. The protected version enables pairing only when the
budget is at least twice the number of root actions; otherwise it preserves the
independent seed schedule. This threshold permits, but does not guarantee, two
visits per action under adaptive tree selection.

`paired-tactical-interventions-v1` completed 15 valid full-match replays of the
six exposed ordering losses. All six original-action controls reproduced their
archived non-timing results. Each intervention changes only the first divergent
action, then resumes the original learned-ordering policy. The unguarded
16-simulation paired choice recovered four losses: one Plutomon case, both
Mamemon cases and the Chronomon case. The other Plutomon case and Alphamon
remained losses. The alternative action from the old winning arm recovered
Alphamon but did not recover Chronomon under the ordered continuation. These
results identify helpful interventions in specific replays; they do not show
optimal actions or establish fresh-seed playing strength. Duplicate action
interventions were collapsed, yielding 15 rather than 18 games.

`paired-root-worlds-v2` completed 48 protected-root searches. All twelve
independent 32-simulation controls reproduced the unmodified runtime, and all
twelve 16-simulation fallback controls reproduced the archived independent
search. At 32 simulations, ordering agreement was 3/6 for independent sampling
and 6/6 for paired sampling. Every paired root retained multiple realized hidden
worlds, and its selected action matched the successful one-action intervention
in all four recovered cases. This passed the screening criteria recorded before
the experiment and justified a fresh-seed comparison. It does not establish a
win-rate improvement. Both confirmation arms use 32 simulations per decision,
the same frozen six-feature value model and no learned ordering; only the
sampling mode changes. Equal per-decision budgets need not yield equal total
match CPU consumption.

`paired-world-confirmation-v1` finished all 48 planned executions: 46 valid games
and two paired-sampling games interrupted at the 900-second process deadline,
on Plutomon and Mamemon. Interrupted games retain null scores. Among the 22
complete valid pairs, independent sampling won 10 and paired sampling won 12,
with four gains and two regressions. The descriptive complete-case seed-block
sign-flip p-value was 0.6875; outcome-dependent timeouts limit this comparison.
Allowing either possible result for each missing game leaves the full planned
score difference between +1 and +3. This small exploratory advantage does not
justify default activation, especially with two deadline failures in the new
arm. The original strict audit correctly fails its requirement for 24 valid
pairs. A separate coverage audit verifies raw results, sampling and missing-data
bounds without weakening that requirement or scoring failures as losses.

`paired-timeout-replays-v1` reran only those two interrupted inputs, one worker
at a time with a 3600-second deadline and the same frozen model and sampling
hooks. Plutomon won in 569.577 seconds and Mamemon lost in 106.843 seconds. Their
26 and 19 available original search reports, respectively, matched the replay
prefixes exactly. Both replays passed game-health and sampling audits. They
completed below the original deadline in isolation, but this does not identify
the precise cause of the concurrent-run slowdowns. Original failure files and
their hashes remain unchanged.

Including these separately identified supplemental outcomes yields 13/24 wins
for paired sampling versus 11/24 for independent sampling, with five gains and
three regressions. The descriptive seed-block sign-flip p-value is 0.7265625.
Glowing Dawn, Plutomon and Craniamon each gained one game; Alphamon lost one;
Mamemon and Chronomon each exchanged one gain and one loss. Keep the candidate
experimental: this small screen shows better ordering consistency and a modest
observed aggregate gain, with deck regressions and unresolved concurrent-run
latency. It does not establish a reliable strength improvement. The primary
22-pair analysis and the supplemental 24-pair analysis remain distinct.

`tactical-value-model-v1` tested six additional public-observation features:
unblocked security pressure, unblocked finishing potential, material exposed to
legal opposing attacks, potential next-turn attackers, breeding growth and a
public trash recovery pool. These are approximate signals, not exact tactical
solvers. Combined validation log loss was 0.50138749, worse than the incumbent
six-feature model's 0.49587461. A development ablation over threat, vulnerability,
resources and combined groups selected vulnerability alone at 0.49417245.
`tactical-value-ablation-v1` retains every candidate and the frozen selected
model. Training uses 48 games and validation 24; both seats remain in the same
seed group. The previously exposed test split was excluded. An independent
runtime audit checked all 1546 development positions. Small validation gains
require fresh-seed full-match confirmation before adoption.

`tactical-value-confirmation-v1` completed 48 valid games on 24 fresh paired
cases, using 16 simulations and a one-turn cutoff in both arms. The incumbent
value model won 13/24 and the vulnerability candidate won 12/24: no gained games
and one regression, on Glowing Dawn. The other five decks retained their paired
outcomes. The descriptive paired-seed-block sign-flip p-value was 1. The raw
results and model identities passed an independent audit. Do not adopt this
candidate: its small development validation improvement did not translate into
improved playing strength in this screen.

`search-cpu-match-smoke-v1` exercises an experimental runtime hook for a shared
20-second process-CPU search budget per match. Fixed allocation allows one
second per decision; adaptive allocation allows 0.25 to two seconds and can
stop when every action has at least two visits and the top mean rewards differ
by at least 0.12. Both modes retain the incumbent value model. CPU is measured
between simulations, so the final simulation can overshoot the ceiling; wall
time and actual CPU consumption must also be reported. The full-match smoke
used 20.505 seconds, completed without invalid simulations and returned to the
baseline policy after exhausting the budget. Six of its nine searched decisions
left some actions unvisited, and none stopped for separated values. This is
integration evidence, not evidence of stronger play or effective early stopping
in representative matches. The allocation remains an ignored experimental
hook, not a production CLI option.

`search-cpu-confirmation-v1` completed 48 valid games on 24 fresh paired cases.
Fixed allocation won 9/24 and adaptive allocation won 7/24, with two gained
games and four regressions. The descriptive paired-seed-block sign-flip p-value
was 0.625. The equal 20-second ceilings did not imply equal realized consumption:
fixed allocation used 338.35 seconds of search CPU in total (14.10 per game),
and adaptive used 457.15 seconds (19.05 per game). Summed game wall times were
313.21 and 412.74 seconds; these are not batch elapsed times, and process CPU can
exceed wall time through runtime worker threads. Adaptive search stopped early
for separated values in 7 of 228 decisions. It left actions unvisited in 79/228
decisions, versus 206/298 for fixed allocation, but the improved coverage did
not produce an aggregate strength gain. Both modes fell back to the residual
policy after exhausting their match budget. The raw-result audit verifies CPU
accounting, per-decision caps, stopping conditions and reported overshoot. Do not
adopt this allocation: it consumed more CPU and did not improve paired outcomes.
This screen does not rule out other allocation rules or larger budgets.

`search-concurrency-full-v1` compares one, two and four independent match workers
over the same four deck/seed cases, with a reversed second pass. Mean batch times
were 85.04, 58.96 and 46.13 seconds respectively, including process startup.
Four workers achieved 1.84 times the one-worker throughput, with identical
non-timing outputs and a sampled peak of 1.50 GiB. The shared cgroup enforced
4 GiB RAM and zero swap, with no memory-limit events. This is local batch
throughput evidence, not parallelization of an individual search tree.

The first-decision `ordering-exploration-pilot-v1` diagnostic did not recover the
manual short-value evaluator's failure by switching from shuffled to heuristic
ordering or reducing exploration from `sqrt(2)` to 0.1. Its two-seat sample is
too small to select a general exploration constant. A residual scoring
optimization was also removed after paired CPU measurements found no consistent
improvement.

Production support for adaptive allocation, shared-tree parallelism and an
AlphaZero-style self-play training loop remain unimplemented. The
[OpenSpiel AlphaZero documentation](https://github.com/google-deepmind/open_spiel/blob/master/docs/alpha_zero.md)
describes learned policy/value guidance and self-play for perfect-information
games. Our experiments borrow the policy/value separation while retaining
filtered observations and information-set search for hidden cards; they are
not a direct AlphaZero implementation.

### Reconstruction cost investigation

`mcts-cost-profile-v1` replays the previously completed Mamemon and Plutomon
confirmation cases with 32 simulations, paired root worlds, the incumbent value
model and a one-turn cutoff. Both full-match outputs match their archived
references after excluding timing fields. One worker runs inside the shared
4 GiB, zero-swap cgroup. Instrumentation and V8 sampling make these runs unsuitable
for speedup claims.

| Case     | Simulations | Reconstruction CPU | Determinization CPU | Rollout CPU | Leaf evaluation CPU |
| -------- | ----------: | -----------------: | ------------------: | ----------: | ------------------: |
| Mamemon  |         640 |           85.235 s |             0.379 s |    12.550 s |             0.039 s |
| Plutomon |         960 |          343.709 s |             0.822 s |    37.568 s |             0.053 s |

Reconstruction accounts for 86.8% and 89.9% of measured simulation CPU.
Sampled caller stacks locate much of the card-location scan cost in continuous
effect context creation and eligibility guards. Changing collection iteration
or indexing only projection publication did not yield a consistent two-deck
improvement in the exploratory root pilots; these candidates were not adopted.

`effect-preparation-location-cache-diagnostic-v1` tests a narrower experimental
cache around synchronous context creation, eligibility guards and provenance
setup for one continuous effect. The scope ends before invoking effect
resolution, and restores its predecessor on exceptions and nested calls.
Every reused location is checked against a fresh scan. The two root replays
retain the original actions, sampled worlds, rewards and visit reports.
Mamemon verifies 1,361,553 cached results among 2,623,122 lookups (51.9%);
Plutomon verifies 4,040,844 among 7,438,664 (54.3%). These counts include the
forced prefix and searched root. They demonstrate reduced scanning, not reduced
CPU: the initial cache implementation regressed on Plutomon in both timing
pairs. Module encapsulation and fixed-CPU confirmation remain under investigation.
Preparation must remain synchronous and must not
change card placement; the diagnostic does not establish this for arbitrary
custom guards outside the exercised cases.

Timing interpretation is limited by the host environment. A later ten-second
sample in `host-paging-diagnostic-v1.json` recorded 39,333 swap-in pages and
44,164 swap-out pages of 16 KiB each, while macOS reported approximately
11.3 GiB of swap in use on a 16 GiB host. The container's 4 GiB memory limit and
zero-swap setting do not prevent host paging of its virtual machine. This
observation does not attribute every earlier excursion to paging, but speedup
claims require a repeat under stable host conditions. The predictable-V8 and
warmed-Map diagnostics were stopped with their partial results retained.
Instrumented full-match equivalence remains useful independently of timing.

Standalone scope behavior checks must preload their transformation with Node's
`--import` option before loading the engine module. A static side-effect import
inside the check was insufficient to guarantee that order. The checks now assert
that the candidate source contains the transformation; the corrected single-entry
cache check passes 756 comparisons, including negative lookup results, nested
scopes and exception cleanup. The root replay drivers already used explicit
preloading. See `lookup-behavior-preload-correction.json` for the affected
experimental checks and validation limits.

`single-effect-preparation-cache-full-equivalence-v1` validates a single-entry
cache over both complete reference games. The independent audit verifies all
368 decisions, 50 searches and 1,600 simulations against the original traces,
including sampled worlds, rewards and visit reports. Every reused location is
also compared with a fresh scan: Mamemon verifies 11,106,168 hits among
21,583,651 lookups (51.5%), and Plutomon verifies 44,453,923 among 82,440,579
(53.9%). Both non-timing match outputs match their references. These instrumented
runs establish equivalence for the exercised games, not a speedup or universal
correctness. These measurements use an experimental runtime hook; the TypeScript
candidate requires its own compiled-code verification before adoption.

`single-effect-preparation-equal-cpu-roots-v1` compares the most expensive
profiled root of each deck with a nominal ten-second search CPU ceiling,
repeating each arm twice in reversed order. All eight roots match the reference
state. Counting actual CPU, including the last atomic simulation's overshoot,
Mamemon completes 19 simulations in 21.014 seconds without the cache and 21 in
23.912 seconds with it: throughput decreases by 2.9%. Plutomon completes 12 in
21.622 seconds and 16 in 21.217 seconds respectively: throughput increases by
35.9%. Mamemon's first comparison favors the cache but its second reverses that
result. This small screen does not establish a consistent two-deck speedup or
justify adoption. The independent audit checks source hashes, root equivalence,
simulation counts and CPU accounting. A contemporaneous ten-second host sample
records 90 swap-in pages and no swap-out pages; host paging is lower than in the
earlier diagnostic but is not eliminated.

These throughput measurements also include different simulation mixtures:
longer searches reach additional actions and sampled worlds. The traces share
the first eight simulations for Mamemon and the first five for Plutomon, but
their CPU cost was not recorded separately. Equal-budget throughput therefore
does not isolate savings on identical work. In addition, pairing eligibility
uses the requested count of 10,000 simulations; CPU stopping can finish before
two samples per action. Six of the eight root runs sampled only one realized
world. Both arms share this behavior, but the earlier fixed-count diversity
guard does not establish equivalent coverage under these CPU ceilings.

`single-effect-preparation-cpu-pilot-v1` completes four valid full games at
nominal 20-second search CPU ceilings and one-second decision ceilings. Both
versions win both reference cases. `single-effect-preparation-cpu-fresh-v1`
then completes 16 valid games over eight paired cases: two decks, two new
seeds per deck and both learner seats. The cache wins four cases versus five
for the reference, with no paired gains, one regression and seven ties.
Mamemon completes 1,137 simulations in 79.331 seconds of search CPU with the
cache versus 1,089 in 75.999 seconds without it. Plutomon completes 611 in
74.206 seconds versus 677 in 69.660 seconds. All games pass the independent
output, sample and CPU-accounting audit. Game-ending times and divergent
trajectories make these totals unsuitable for isolating lookup savings, and
eight pairs cannot establish playing strength. This fresh screen does not
support adopting the cache as a general improvement.

`single-effect-preparation-common-prefix-v1` isolates identical work by running
the first eight Mamemon or five Plutomon simulations in each arm, three times
in alternating order. Requested simulation counts remain 10,000 to preserve
paired-world eligibility; complete sample prefixes and root states are checked
against the earlier traces. Mamemon uses 20.099 seconds of aggregate CPU in the
reference and 16.014 with the cache (20.3% less); Plutomon uses 24.797 and 21.177
seconds respectively (14.6% less). The third repetition regresses in both decks,
so the aggregate reductions are exploratory rather than a stable speedup
guarantee. These runs omit CPU-budget instrumentation in both arms, and their
absolute timings must not be compared directly with the equal-budget screen.

The local TypeScript candidate preserves the prototype's narrow synchronous
scope: context construction, eligibility guards and provenance setup for one
continuous effect. The scope ends before effect resolution is invoked, restores
the preceding scope on exceptions, and isolates lookups by game-state identity.
Preparation must remain placement-read-only.

`compiled-card-location-full-equivalence-v1` verifies the emitted TypeScript
candidate against both complete reference traces: all 368 decisions, 50 searches
and 1,600 simulations match, as do both non-timing match outputs. Its independent
audit checks archived compiled files, instrumentation sources and the value-model
hash. The final targeted regression run passes 115 tests across 15 files, including an
integration test checking live source placement both before and after an await
inside continuous-effect resolution. Subsequent timing comparisons use the same compiled
tree in both arms, loading only the original context and continuous-pass modules
for the control, to exclude unrelated earlier formatting and reward-helper changes.

`compiled-card-location-common-prefix-v1` completes all twelve runs with exact
matching roots, sample prefixes, chosen actions and search reports. Across three
paired repetitions, Mamemon uses 11.843 seconds of reference CPU versus 10.877
seconds for the candidate (8.2% less); Plutomon uses 19.604 versus 17.289 seconds
(11.8% less). Every pair favors the candidate, with reductions ranging from
5.1% to 12.6% for Mamemon and 4.8% to 15.6% for Plutomon. This establishes a
local benefit on the measured fixed work, not a universal speedup guarantee.

`compiled-card-location-cpu-pilot-v1` completes four valid full games under the
same 20-second match and one-second decision search CPU ceilings. Both versions
lose the Mamemon case and win the Plutomon case. The candidate completes 290
versus 287 simulations in Mamemon and 203 versus 170 in Plutomon. Actual search
CPU ranges from 20.100 to 20.382 seconds, including atomic-simulation overshoot.
`compiled-card-location-cpu-fresh-v1` completes 16 valid games over eight new
paired cases, with six wins per version, one paired gain, one regression and
six ties. It additionally records first-search CPU checkpoints so matching
sample prefixes can be compared independently of later divergent trajectories.
Each checkpoint is after the completed rollout and before its backpropagation,
consistently in both arms.

The first-root audit verifies identical roots and common samples in all eight
pairs, but does not confirm a CPU improvement in its single measurements:
Mamemon uses 3.853 versus 3.601 seconds for 254 common simulations (7.0% more),
and Plutomon uses 3.890 versus 3.826 seconds for 245 (1.7% more). Five individual
pairs favor the cache; two of the slower pairs have large excursions. These
results remain part of the record.

`compiled-card-location-fresh-prefix-repeats-v1` completes three predeclared
repetitions of every fresh root with alternating order and unchanged candidate
code. All 48 runs have identical root states, sample sequences, decisions and
search reports within each case. Mamemon uses 9.504 seconds of reference CPU
versus 9.423 for the candidate (0.8% less); Plutomon uses 10.979 versus 10.778
seconds (1.8% less). Three of four root means favor the candidate in each deck;
individual pairs favor it in 7/12 Mamemon and 11/12 Plutomon comparisons.
These repeated measurements use a full-search boundary and omit CPU-budget
instrumentation in both arms, so their absolute times are not comparable with
the earlier first-root checkpoints. The small early-position gains and the
larger measured expensive-root gains must remain separate: this is a bounded
reconstruction optimization, not evidence of a universal 8–12% speedup or
stronger play. All workloads retain the shared 4 GiB, zero-swap cgroup limit.

Final application type checking passes, and the repository-wide style gate passes
with zero errors and 1,406 existing lint warnings. The complete test type check
is incomplete: the cgroup killed it at the 4 GiB limit (exit 137). This validation
failure occurred after the benchmarks; their zero-OOM observations do not apply
to the subsequent validation run. The memory limit was not raised. A focused type check of the new regression
file and its dependencies passes with the shared-project reference preserved;
it does not replace the incomplete repository test type check.

## DigiLab deck snapshot

`digilab-decks.json` freezes 22 tournament lists fetched on 16 October 2026
from the authenticated DigiLab API, with source URLs, event dates, placements,
format labels and a raw-response fingerprint. Credentials stay on the Oracle
host; the committed snapshot contains no API key or player names. Metadata
queries use EX13 and BT26 filters, ordered by entries. List queries select up
to two results per archetype ordered by placement, so this is a selection of
successful tournament lists, not a representative sample of all games. Aggregate
statistics retain the provider's reported scope and are not independent bot
evaluation results.

The executable pilot catalog admits 20 lists after normal deck legality and
effect-registration checks. Two incomplete source lists (47-card Chronomon and
37-card Glowing Dawn) remain in the snapshot for provenance and are rejected,
without inventing replacements. Registration checks do not establish complete
card-rules fidelity.

New campaigns retain random decks for the generic phase, then specialize on
versioned EX13 Examon, Jupitermon, UlforceVeedramon, TS Mervamon, Toho Braves and
Glowing Dawn lists. The full admitted BT26/EX13 catalog is available through
`--describe-pilots`; individual versions work with the evaluation worker's
`decks` input. Historical famous-deck IDs remain resolvable. More pilots increase
total campaign work, not worker concurrency or the 4 GiB memory ceiling.

Tournament placement and human win percentages inform curriculum selection,
never GEPA fitness. Keep training, validation and held-out seed splits separate,
compare candidates and controls on the same versioned lists and paired seeds,
and publish strategy guides only after the existing promotion gates pass.
Running campaigns keep their frozen runtime and deck identities; this snapshot
applies to newly built campaigns and must not be mixed into an existing gate.

## Rollout hand affordance experiment

`runEvolutionMatch` accepts `mcts.omitRolloutHandAffordances: true` to skip
client hand affordance projections only inside simulated matches. The live match
continues to publish those fields. The direct match API defaults to disabled;
the evaluation CLI enables it for generic heuristic MCTS matches. Legal actions
continue to be enumerated and validated by the authoritative engine.

The replay acceleration benchmark accepts `compareHandAffordances: true` to
isolate this option while retaining prefix acceleration in both arms. It checks
identical results, decisions, traces and search reports, excludes warmup samples,
and alternates measurement order. A bounded search is a performance probe, not
evidence of improved playing strength or equivalence across every card.

Structural proposals are screened on the valid training tasks already present in
the reflection feedback before reserving compute for the independent paired
gate. A proposal must strictly improve the summed training score to reach that
gate. Screening does not establish strength: accepted proposals still need fresh
paired evidence and final held-out validation. The adapter can reuse exact
screen evaluations when GEPA subsequently evaluates the same training tasks.
After the final permitted proposal finishes its GEPA iteration, the stage stops
instead of collecting further reflection batches that cannot produce another
proposal. Its final candidate still receives the normal validation evaluation.

Training policies exclude a previously selected main effect activation when it
returns to the same visible main state. A visible state change clears that
exclusion. This prevents cancelling an optional selection from repeatedly
reactivating the effect until the decision budget expires. The policy uses only
its observation, excluding event history, and leaves engine legality unchanged.
This changes policy behavior and requires a new runtime fingerprint; results from
the interrupted campaign must not be merged into a new campaign's fitness cache.
