# Bordets vänsterkolumn — prototyp 2026-10-26

**Frågan:** hur ska vänsterkolumnen i fliken Bord vara byggd för att rymma fler sorters material än räknare och tärningar (meeple, kub, bricka enligt B1–B3 och K31), utan att växa en panel per sort och utan att det som läggs till hamnar under vecket vid 1024 × 640 (#711)?
Och vad ska det bli av «Lägg leken i …», en knapp i en annan högs panel som flyttar lekens roll (varifrån korten delas ut och dit händerna lämnar tillbaka) och som ingen förstår?

Prototypen är [`prototyper/index.html`](prototyper/index.html); servera mappen över http och öppna `?v=0|A|B|C|D`.
Ramens höjd växlas mellan 1440 × 900 och 1024 × 640.

| Variant | Idé | Bild |
| --- | --- | --- |
| 0 · Idag | Sex paneler staplade. | [900](variant-0.png) · [640](variant-0-640.png) |
| A · En lista, en knapp | Spelets rattar i en ruta överst, en enda «＋ Lägg till»-meny, material som rader i samma två listor som zonerna. | [900](variant-A.png) · [meny](variant-A-meny.png) · [640](variant-A-640.png) |
| B · Tre flikar | Kolumnen delas i Zoner · Material · Spelet; varje flik får hela höjden och sina ＋ överst. | [900](variant-B.png) · [640](variant-B-640.png) |
| C · Bordet som träd | Kolumnen speglar filten: allt ligger i något, ＋ på varje zon som kan rymma något, spelets rattar som en remsa överst. | [900](variant-C.png) · [meny](variant-C-meny.png) · [640](variant-C-640.png) |
| D · Palett och inspektör | En palett att dra från, en inspektör för det valda; filten är listan. | [900](variant-D.png) · [640](variant-D-640.png) |

I alla fyra blir leken en egenskap hos spelet («korten delas ut från»), inte en knapp i högens panel.

**Beslut (2026-10-26):** C · Bordet som träd, se Tiico/build-a-deck#1403.
