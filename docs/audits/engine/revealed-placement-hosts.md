# Revealed placement hosts

`RevealAdd` plans placement selections only when their destination has a legal
host. Both `placeUnder` and `underTamer` honor the slot's host filter. An unfiltered
`placeUnder` requires a Digimon; `underTamer` requires a Tamer.

If another reveal disposition can play a card or use an Option, host checking
remains deferred because that processing can introduce the host. Alternative
destinations also retain their own selection behavior.

When no host exists, the placement slot is skipped and every unselected revealed
card remains available for the printed remainder destination and its order choice.

[Issue #6524](https://github.com/vinicius3333/aegis-digimon-tcg/issues/6524)
was reproduced from its saved replay. Agumon ST24-04 added only one card to the
hand, but incorrectly asked for a second selection without a DATA SQUAD Tamer.
That second card was immediately returned to the deck, creating a misleading
choice and bypassing ordering with the other remaining card.

`revealed-placement-needs-a-host.test.ts` replays the real hand selection, requires
one order decision for both remaining cards, and verifies hand, deck, cost and turn
progression. The ST24-04 suite covers placement under an existing DATA SQUAD Tamer,
stack order, face-down visibility and later trashing.
