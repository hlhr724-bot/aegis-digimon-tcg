# Deck text export

In the deck editor, choose **Export → Deck list → TCGplayer**, then copy the list
into [TCGplayer Mass Entry](https://www.tcgplayer.com/massentry?productline=Digimon%20Card%20Game)
with **Digimon Card Game** selected. The list includes the current editor's main
deck and Digi-Eggs, even before saving. Selected artwork does not affect quantities.
The existing DigimonCard.io format remains available for importing into Aegis or
other deck builders; PNG remains available in the image tab.

The output follows TCGplayer's documented quantity, name, bracketed set code, and
optional card-number syntax. Card numbers are included when different cards share
an English name within the same marketplace set. English card names come from the
committed Aegis catalog with verified marketplace spelling, ACE, and dual-card
name overrides in `tcgplayerCardNames.json`. Cosmetic printing labels are omitted. Copy is disabled when a card has no supported set mapping;
the dialog identifies those cards instead of silently offering an incomplete list.
This export does not check stock, price, condition, or ownership.

## Set-code maintenance

`getTcgplayerSetCode` owns the explicit regular set mappings.
`tcgplayerCardSets.json` maps individual cards from BT1–BT3, BT18–BT20 and LM, whose
English product releases do not correspond one-to-one with their card-number
prefixes. Look up a card's English release rather than deriving these mappings
from its numeric prefix. Unknown future sets remain unsupported until verified.

Mappings were checked on 2026-10-15 against **Show Set/Series Codes** on TCGplayer
Mass Entry. Individual release membership was cross-checked against the public
[TCGCSV mirror of TCGplayer's Digimon catalog](https://tcgcsv.com/tcgplayer/63/groups),
using each group's `/tcgplayer/63/{groupId}/products` data and the product's Number
field. Combined-release groups are 2733, 24182, 23767 and 24178. LM cards span Exceed
Apocalypse, Special Limited Set, World Convergence and later Limited Card Packs.
Prefer the earliest matching release within the relevant combined-release groups.
No marketplace requests are made by the application at export time.

When adding support, verify the exact code in Mass Entry and add behavioral tests
for exceptional releases. TCGplayer uses `BT27`, `D-PR`, `BT01-03A`, `BT01-03B`,
`BT18-19`, and `BT19-20`; blindly inserting a hyphen into every prefix is incorrect.

Source: [TCGplayer's Mass Entry guide](https://help.tcgplayer.com/hc/en-us/articles/360055768913-Getting-Started-With-Mass-Entry).
