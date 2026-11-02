# Replay regression compatibility

The API regressions below were first run against their committed historical
inputs. Three required migrated inputs because current target-selection events
and activation ordering differ from their source revisions. Their tests still
require zero divergences through the migrated prefix and assert the specific
card-resolution behavior afterward. Their seeds, decklists, and material/card
identities are retained. `serverRevision` is omitted from adapted fixtures.

| Regression                                               | Historical revision                        | Migration                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opponent-derived-delay-before-pending-when-digivolving` | `898665fa810e6255b08e1f4c89ec54874406b3e5` | Refresh event/version counts after input 42; omit the obsolete input-72 order decision now that only Guilmon can activate. All selected cards and optional answers are retained.                                                                                                                                                                                                                                                                    |
| `turn-player-block-triggers-resolve-first-replay`        | `915c1095a6a86d2e283f5f0d6e80871176c6cf41` | Refresh counters after input 25; omit the obsolete order decisions at inputs 74 and 76. Alliance resolves in the attack tier before the older Delay. All selected cards, Alliance ally, and block declarations are retained.                                                                                                                                                                                                                        |
| `would-leave-play-replacement-when-played-triggers`      | `915c1095a6a86d2e283f5f0d6e80871176c6cf41` | Refresh counters after input 34. Resolve the attack's inherited draw and Alliance before the older play watchers. Suspend the already-present Cho-Hakkaimon (`perm-6`) for Alliance; the old ally (`perm-8`) is not yet in play at that timing. Replace the later combined order with Mococomon's optional evolution answer, and trim after the material-selection witness. The resulting replacement play still offers all four expected watchers. |

The interrupting-DNA regression keeps its historical prefix unchanged. It now
explicitly selects the two DNA materials after BT22-008's accepted
end-of-turn effect, before asserting the Delay/replacement sequence. Those choices
were previously implicit; counters alone cannot detect a new decision that emits
no event.

The Alliance/evolution scenarios likewise answer the newly triggered attack-tier
Alliance before the older Mococomon evolution when the attack is chosen first.
They still verify the evolved card, retained Alliance, battle DP, security checks,
memory, and turn-end expiration. The evolution-first case remains covered.

## Historical deck availability

Historical replays seat their recorded decks with release availability enabled.
A catalog update must not reject a deck the recorded match already accepted;
this override is confined to replay seating and does not change live-room deck
validation, deck format, or recorded game state.

## Real-clock replay test isolation

The Vite test project isolates files that use module mocks. Reusing its module
graph allowed earlier room tests to retain the original bot module before the
real-clock replay suite installed its accelerated bot mock: matches then timed
out in the full run while passing alone. Native card suites keep their shared
module graph; real-clock replay cases still run with real timers and their
existing deadlines.
