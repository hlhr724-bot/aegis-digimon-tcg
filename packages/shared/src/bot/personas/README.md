# Bot personas

Persona IDs describe presentation and never select a policy, alter its difficulty,
or change a recipe fingerprint. The server resolves an identity from the actual
selected deck; an unavailable requested preset cannot assign its persona to the
replacement. Unknown custom lists use Aegis. Exact catalog matches ignore card
order but preserve quantities and the egg deck.

A preset gets its family's character when the recipe features that Tamer, including
another printing, or contains one of the character's key Digimon. For example, any
recipe with Galacticmon shows Zenith, and any WarGreymon recipe shows Tai. Key
Digimon match by name prefix, so `Gallantmon: Crimson Mode` counts for Takato. Other
recipes use a principal Digimon portrait. The fallback prioritizes the archetype's
printed name, then level and play cost. These are presentation associations, not
universal claims about canonical partners.

The committed card catalog supplies names and the following printed associations:
Rina BT11-112 names Veemon/Veedramon; Tomoro and Kyo ST23-13 names Glowing Dawn;
Kunlun BT26-104 names Shambala/Tentei Hachibushu; Kosuke BT26-096 names Chronomon;
Takato EX2-056 names Gallantmon/Growlmon; Thomas BT13-097 names Gaomon/GaoGamon;
Rika BT19-083 names the Renamon line; Satsuki BT14-086 names Numemon/Monzaemon
and DigiPolice. D-Brigade recipes only select Satsuki when they feature her and
DigiPolice Digimon, such as BT14-056 Commandramon. Koh and Sayo EX5-064 supports
Light Fang/Night Claw, and is used only in recipes that feature the pair. Generic
support such as Analog Youth or Cool Boy never determines a character identity.

Variant selection distinguishes Magnamon Vaccine from Armor, Alphamon Cyber
Sleuth, Phoenixmon Sora/Akiho, Rapidmon Willis/Henry, and GraceNovamon Galaxy.
Other named associations additionally require the selected recipe to feature that
character or one of their key Digimon.

Official references: [Rina](https://world.digimoncard.com/cards/?card_no=BT11-112&search=true),
[Tomoro and Kyo](https://world.digimoncard.com/cards/?card_no=ST23-13&search=true),
[Kunlun](https://world.digimoncard.com/cards/?card_no=BT26-104&search=true), and
[BT26 recipes](https://world.digimoncard.com/products/pack/ver26/) for Chronomon
and Inori/Jupitermon. Portraits reuse existing card-image resolution and its
official fallback. Aegis uses a robot variant of the Aegis logo. Image failures
fall back to initials; decorative portraits
have empty alternative text beside the visible character name and Bot label.

The public schema carries botPersonaId separately from account avatarId. The
lobby and game resolve this same ID, preserving the server's display name for
tournament disambiguation. Narrow player rows use 18-pixel portraits; the lobby
uses 48-pixel portraits. Unknown legacy persona IDs retain the player name and
Bot label without loading arbitrary images.

Digimon personas (`digimon:<cardId>`) share one portrait per Digimon name, not per
printing. `getBotPortraitPath` slugs the persona's display name, so every Agumon
printing uses `/assets/bot-portraits/digimon/agumon.webp`. Story opponents use
these portraits when no character persona matches the encounter. A Digimon
without a portrait file still falls back to initials.

All portraits live in `apps/web/public/assets/bot-portraits`. The web build copies
them into its `assets` folder, and each deploy copies that folder into the
gateway's shared `assets` directory, which serves them as the CDN. The gateway
caches `/assets/` as immutable, so replace a portrait under a new file name.
