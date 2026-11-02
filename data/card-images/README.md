# Local card scans

These WebP files cover printings that no image origin of
`tools/deploy/card-images.mjs` publishes. Most are official "SAMPLE" scans, so
they carry the watermark. The first batch was downloaded on 2026-09-29,
re-encoded as WebP, and scaled to at most 430 px wide.

The sync copies each file into the gateway mirror as `<id>-Sample.webp` on every
deploy and in the daily cron job. The client already tries that name after
`<id>.webp`. Once an origin publishes the real image, the sync stores it and
deletes the sample. Delete the file here then.

| Files                                                                                                                                                           | Source                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| BT11-023_P1, BT17-059_P1, BT20-014_P1, BT21-009_P2, BT22-004_P1, BT22-063_P2, BT22-099_P1, BT5-090_P2                                                           | Bandai's English card list, `https://world.digimoncard.com/images/cardlist/card/<id>.png` |
| P-147 (the wiki's P-147_P1 scan), BT21-005_P1, BT21-018_P2, BT21-023_P2, BT24-011_P2, BT24-059_P2, BT25-041_P2, BT25-053_P2, EX8-055_P2 (the wiki's EX8-055_P3) | DigimonCardGame Wiki, `https://static.wikia.nocookie.net/digimoncardgame/images/`         |
| LM-063 to LM-068, ST24-11_P2, ST24-11_P3                                                                                                                        | `https://images.digimoncard.io/images/cards/`                                             |

## Clean scans

`clean/` holds scans without the SAMPLE watermark. The sync stores each one in
the gateway mirror as `<id>.webp`. It replaces the origin copy, which often
carries the watermark, and deletes any `<id>-Sample.webp`. The sync rewrites
the mirror file whenever the committed scan changes. A printing keeps either a
clean scan or a sample scan here, never both.

### Add, update, or remove clean scans

Run the importer on a folder of scans in any file names:

```sh
pnpm card-images:import <folder> --dry-run
pnpm card-images:import <folder> --map <mapping.json>
```

The importer needs `cwebp` and `dwebp` from libwebp. It reads the card sets
from the top-level folder names (`BT22 Alter Art` is BT22, `Promo` is P), or
from `--sets BT22,EX10,P`. It compares each scan with the image each English
printing shows today and caches downloaded images in
`.local/card-image-references/`. It then writes each confident match to
`clean/<id>.webp` at WebP quality 90 and deletes the sample scan with the same
id. An existing clean scan is overwritten, which updates it.

The importer skips a scan when the best score is below 0.75, when the next
printing scores within 0.03, or when two scans pick the same printing. It
lists each skipped scan and writes every decision to
`.local/card-image-import/report.json`. Check those scans by eye, then pass a
mapping file that names the printing for each scan, or `null` to skip it:

```json
{ "Promo/aec65ba9.png": "P-206", "BT23/ddf4b114.png": null }
```

Printings that differ only by a stamp, such as WINNER promos, always need a
mapping. The fingerprint cannot tell them apart.

### Browser cache

Browsers cache card images for one year. To make every player download the
images again after you add, update, or remove scans, change
`CARD_IMAGE_CACHE_VERSION` in `packages/shared/src/cards/mirroredCardImageUrl.ts`
to today's date. Every image URL carries it as `?v=<version>`, so the next web
release requests new URLs. Each change makes players download every card image
they view once more, so change it only when images change.

To remove a clean scan, delete its file. The next sync keeps the old mirror
copy; delete `<id>.webp` from the gateway mirror to download the origin image
again.

### First batch

The first batch of 501 scans was provided by **Karasu Komadreja** on 2026-10-30 as 430 x 600 PNG
files named by UUID. Each file was matched to its printing by image similarity
against the watermarked mirror image, then encoded as WebP at quality 90. It
covers BT22, BT23, EX10, EX11 and their alternate arts, alternate arts from
AD1, BT21 and BT24, and promotion cards. These matches needed manual review:

| File        | Decision                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| BT23-099    | The scan from the alternate-art folder. Bandai's English card list shows this art for the base printing.              |
| BT23-099_P1 | The scan from the base folder. The upstream image for BT23-099 shows the base art, and no upstream \_P1 image exists. |
| P-206       | The unstamped scan. The upstream P-206 image is the full art of P-206_P2.                                             |
| ST22-11     | The scan from the ST23 folder. Its printed number is ST22-11.                                                         |

A Sistermon Noir scan printed as BT23-077 was not added. The card data has no
printing for it.

The clean scans replace the BT24-086_P1, EX10-023_P2, EX10-059_P2, EX10-060_P2
and EX10-061_P2 sample scans.

## Official card list gaps, 2026-10-14

A comparison with every product page of Bandai's English card list found 65
printings the upstream set does not list. Their files come from
`https://world.digimoncard.com/images/cardlist/card/<id>.png`, re-encoded as
WebP at the source width of 430 px.

Bandai and upstream number some printings differently. Where Bandai's number
already belongs to another upstream printing of the card, the file takes the
next free number:

| File       | Bandai image | Product                  |
| ---------- | ------------ | ------------------------ |
| BT9-112_P4 | BT9-112_P3   | Special Limited Set      |
| EX1-066_P6 | EX1-066_P4   | BT-21: Limited Card Pack |
| EX5-070_P5 | EX5-070_P3   | Special Event Pack 2025  |

The comparison skipped printings whose image matches another printing of the
same card: the second ST-12 printings of BT3-093, BT3-094, BT4-096, ST1-12,
ST3-12 and ST6-14, and the ST-24 printings of LM-033 to LM-038.

Copyright belongs to Bandai and the credited Digimon rights holders.

## BT27 and EX14 reveals, 2026-10-16

These scans are encoded as WebP at 430 px wide with quality 90. They retain
the source SAMPLE watermark and use the existing local-scan fallback.
The Japanese catalog entries cover all seven BT27/EX14 cards currently in
`cards.json`, plus the four available Japanese BT27 alternate arts.

| File          | Source                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------- |
| BT27-035_P1   | [User-provided English reveal](https://pbs.twimg.com/media/HUQatrhW8AAWhIy?format=jpg&name=large) |
| BT27-103_P1   | [User-provided English reveal](https://pbs.twimg.com/media/HUQbOv4W4AAmpIc?format=jpg&name=large) |
| BT27-035-J    | [Wikimon Japanese scan](https://wikimon.net/images/0/03/Dcg-BT27-035.jpg)                         |
| BT27-100-J    | [Wikimon Japanese scan](https://wikimon.net/images/0/06/Dcg-BT27-100.jpg)                         |
| EX14-054-J    | [Wikimon Japanese scan](https://wikimon.net/images/1/16/Dcg-EX14-054.jpg)                         |
| BT27-084-J    | [Wikimon Japanese scan](https://wikimon.net/images/2/2d/Dcg-BT27-084.jpg)                         |
| BT27-084_P1-J | [Wikimon Japanese scan](https://wikimon.net/images/3/3a/Dcg-BT27-084_2.jpg)                       |
| BT27-103-J    | [Wikimon Japanese scan](https://wikimon.net/images/3/3e/Dcg-BT27-103.jpg)                         |
| EX14-012-J    | [Wikimon Japanese scan](https://wikimon.net/images/5/55/Dcg-EX14-012.jpg)                         |
| BT27-070-J    | [Wikimon Japanese scan](https://wikimon.net/images/6/6c/Dcg-BT27-070.jpg)                         |
| BT27-070_P1-J | [Wikimon Japanese scan](https://wikimon.net/images/6/6c/Dcg-BT27-070_2.jpg)                       |
| BT27-035_P1-J | [Wikimon Japanese scan](https://wikimon.net/images/a/a3/Dcg-BT27-035_2.jpg)                       |
| BT27-103_P1-J | [Wikimon Japanese scan](https://wikimon.net/images/f/f4/Dcg-BT27-103_2.jpg)                       |

The [official Chinese catalog](https://dtcgweb-api.digimoncard.cn/gamecard/gamecardmanager/weblist?page=1&limit=100000)
returned all 7,628 records and no BT27 or EX14 printings on this date. The
[official Korean card list](https://digimoncard.co.kr/index.php?mid=cardlist)
did not list either set; its latest listed booster and extra booster were
BTK-22 and EXK-09. No Chinese or Korean entries were added.

## BT27 Chronicle Ryudamon line, 2026-10-23

These scans are cropped to the card edge (868 x 1213 px, without the white
image margin) and encoded as WebP with quality 90. They retain the source
SAMPLE watermark.

| Files                              | Source                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| BT27-008, BT27-009, BT27-013       | [Official English reveal](https://x.com/digimon_tcg_EN/status/2113510737171587393) |
| BT27-015                           | [Official English reveal](https://x.com/digimon_tcg_EN/status/2113608882606223567) |
| BT27-008-J, BT27-009-J, BT27-013-J | [Official Japanese reveal](https://x.com/digimon_tcg/status/2113510813256593622)   |
| BT27-015-J                         | [Official Japanese reveal](https://x.com/digimon_tcg/status/2113608952378446317)   |

## BT27 Yuji Musya, Keenan Crier and Silver-Winged Yaksha, 2026-10-24

These scans are cropped to the card edge (868 x 1213 px, without the white
image margin) and encoded as WebP with quality 90. They retain the source
SAMPLE watermark. The Japanese scans are also the source of the Japanese card
text.

| Files                              | Source                                     |
| ---------------------------------- | ------------------------------------------ |
| BT27-087, BT27-096, BT27-101       | User-provided official English reveal art  |
| BT27-087-J, BT27-096-J, BT27-101-J | User-provided official Japanese reveal art |

## BT27 Falcomon, Peckmon and Crowmon, 2026-10-24

BT27-074, BT27-078 and BT27-081 and their `-J` printings come from the
user-provided official English and Japanese reveal scans. The Japanese scans
also supply the Japanese text transcription. Each 951 x 1295 px attachment is
cropped to `(41, 41, 909, 1254)`, producing 868 x 1213 px WebP images at quality
90 without the white outer margin. The SAMPLE watermark is preserved. The
existing BT27 local scans were inspected for the same outer margin; none needed
an additional crop.

## BT27 Chessmon line and Ravemon: Burst Mode, 2026-10-26

The nine user-provided reveal scans supply BT27-004, BT27-036, BT27-039 and
BT27-041 in English and Japanese, and the Japanese BT27-085 printing. Scans
are cropped to the card edge and encoded as WebP at quality 90, preserving
the SAMPLE watermark. The Japanese BT27-085 scan replaces the earlier scan.
Japanese attachments supply the card-specific Japanese text transcriptions.

## BT27 Tomoro Tenma, 2026-10-26

BT27-091 and BT27-091-J come from the user-provided official English and
Japanese reveal scans. Each 951 x 1295 px attachment is cropped to
`(41, 42, 909, 1255)`, producing 868 x 1213 px WebP images at quality 90
without the white outer margin. The SAMPLE watermark is preserved. The
Japanese scan supplies the Japanese text transcription.

## BT27 Dracomon (X Antibody), 2026-10-28

BT27-021 and BT27-021-J come from the user-provided official English and
Japanese reveal scans. Each 951 x 1295 px attachment is cropped to
`(41, 41, 909, 1254)`, producing 868 x 1213 px WebP images at quality 90
without the white outer margin. The SAMPLE watermark is preserved. The
Japanese scan supplies the Japanese name transcription.

## BT27 Chessmon royals and DATA SQUAD Tamer, 2026-10-30

BT27-042, BT27-057, BT27-061, BT27-066, BT27-069 and BT27-093 and their `-J`
printings come from the user-provided official English and Japanese reveal
scans. The SAMPLE watermark is preserved and each crop is encoded as WebP at
quality 90 without the white outer margin.

| Files                                        | Source scan    | Crop box                | Output     |
| -------------------------------------------- | -------------- | ----------------------- | ---------- |
| BT27-057, BT27-061, BT27-066, and their `-J` | 951 x 1295 px  | `(41, 41, 909, 1254)`   | 868 x 1213 |
| BT27-093-J                                   | 951 x 1295 px  | `(41, 41, 909, 1254)`   | 868 x 1213 |
| BT27-093                                     | 881 x 1200 px  | `(38, 37, 842, 1162)`   | 804 x 1125 |
| BT27-042 (left half of the paired reveal)    | 1819 x 1295 px | `(41, 41, 909, 1254)`   | 868 x 1213 |
| BT27-069 (right half of the paired reveal)   | 1819 x 1295 px | `(908, 41, 1776, 1254)` | 868 x 1213 |
| BT27-042-J (left half of the paired reveal)  | 1289 x 918 px  | `(30, 29, 644, 888)`    | 614 x 859  |
| BT27-069-J (right half of the paired reveal) | 1289 x 918 px  | `(643, 29, 1260, 888)`  | 617 x 859  |

KingChessmon and QueenChessmon were revealed as one paired image. Each card is
cut at the seam between the two rounded card edges. The Japanese scans supply
the Japanese name and text transcriptions.

## BT27 Thundermon (X Antibody) and Mamemon (X Antibody), 2026-10-30

BT27-060, BT27-065, and their `-J` variants come from the user-provided
official English and Japanese reveal scans. Each 951 x 1295 px attachment is
cropped to `(41, 41, 909, 1254)`, producing 868 x 1213 px WebP images at
quality 90 without the white outer margin. The SAMPLE watermark is preserved.
The Japanese scans supply the Japanese name transcriptions.

## BT27 Stegomon and Spinomon, 2026-11-01

BT27-048, BT27-017 and their `-J` printings come from user-provided official
English and Japanese reveal scans. The 951 x 1295 px Japanese scans are cropped
to `(41, 42, 909, 1255)`, producing 868 x 1213 px images. The 881 x 1200 px
English scans are cropped to `(38, 39, 842, 1163)`, producing 804 x 1124 px
images. All four are WebP at quality 90, without the white outer margin. The
SAMPLE watermark is preserved. The Japanese scans supply the Japanese text
transcription.
