# Bordet i editorn inför release — prototyp 2026-10-26

**Frågan:** bandet under editorns huvud när ett bord kör ser ut som en platshållare: en mening med tankstreck och punkter, en länk i gemener mitt i meningen, koden som ett fetstilt ord, och «Ny kod» som en kantad knapp bredvid det som läses högt till alla i rummet.
Hur ska ett bord som kör synas inne på spelets sida, som en färdig produkt?

Bara ytan inne i editorn (`.byd-editor-table-link` i `EditorPage.tsx`); Mina spels «Pågår nu» rörs inte.
Alla varianter behåller L60 (en plats är en bricka med ×), L61 (brickan är pillret på 44 px) och L86 (en väg in, «Öppna bordet»).

Prototypen är [`prototyper/index.html`](prototyper/index.html); servera mappen över http och öppna `?v=0|D|E|F|A|B|C`.
Huvudet och «i dag» ritas med appens egna regler: `prototyper/appen.css` är genererad ur `packages/web/src` av `prototyper/matning/extract.mjs`.
Växlarna: bredd 1024/1280/1440, Macens typsnitt eller Verdana (CI:s bredd), svenska/engelska, 0/3/8 platser, och grund.
Varje variant visas i sex lägen: kör, laddar kort, frågan om en plats, ny kod sagd, kort som inte kunde laddas, och hopfällt.

## Två rundor

Första rundan (A, B, C) polerade dagens band på plats: samma rad med struktur, en biljett på två rader, en smal statusrad.
Beställaren: «Detta är i princip identiskt med det befintliga, kan vi göra en hel omdesign, var kreativ.»
Andra rundan (D, E, F) flyttar bordet ut ur bandet.

| Variant | Idé | Bild |
| --- | --- | --- |
| 0 · I dag | En mening under huvudet: «Bordet kör version 7 — öppna bordet · rumskod UF6H2W [Ny kod] · vid bordet: [Ada ×] …». | [1440](bilder/idag-1440.png) · [1024, 8 platser](bilder/idag-1024-8.png) |
| **D · Nu spelas** | Bandet lämnar huvudet. Bordet är en «nu spelas»-docka längst ned i fönstret: filten i miniatyr med platserna som färgade prickar, spelets namn med «Bordet kör v7 · Runt en skärm», koden i TV:ns bokstäver, brickor med ansikte, «Öppna bordet» i filtens bärnsten. Laddningen är en linje längs dockans överkant. | [1440](bilder/D-1440.png) · [1024, 8](bilder/D-1024-8.png) · [1280, 8](bilder/D-1280-8.png) |
| **E · Bordskortet** | Inget band. Ett kort nere till höger över arbetet, som historiken och delningen: filten i miniatyr med platsernas namn runt den, koden i TV:ns storlek, brickorna med ×, «Öppna bordet». Fälls ihop till ett piller «● UF6H2W · 3 vid bordet». | [1440](bilder/E-1440.png) · [1024, 8](bilder/E-1024-8.png) |
| **F · Den levande fliken** | Inget band. Bord-fliken i huvudet lyser «Bord ● UF6H2W» (● 12/77 medan korten laddas, ⚠ 3 kort när kort saknas); allt annat står på Bord-fliken, som det redan gör (L86). Ny kod sägs i foten (#698). | [1440](bilder/F-1440.png) · [1440, CI:s typsnitt](bilder/F-1440-8.png) · [1280](bilder/F-1280-8.png) · [1024](bilder/F-1024-8.png) |
| A · Raden får struktur | Samma rad och höjd; fyra grupper i stället för en mening, «Öppna bordet» som knapp till höger, «Ny kod» och «Avsluta» i ett ⋯. | [1440](bilder/A-1440.png) · [krom](bilder/A-1440-krom.png) · [1024, 8](bilder/A-1024-8.png) · [1280, 8](bilder/A-1280-8.png) |
| B · Biljetten | Två rader: koden som biljett till vänster, fakta och «Runt en skärm» bredvid, platserna med ansikte på egen rad. | [1440](bilder/B-1440.png) · [krom](bilder/B-1440-krom.png) · [1024, 8](bilder/B-1024-8.png) |
| C · Smal statusrad | En rad på 36 px: punkt, kod, v7, «Ada, Bo och Cia spelar», «Öppna bordet». Sparka och «Ny kod» i Bord-flikens rad. | [1440](bilder/C-1440.png) · [krom](bilder/C-1440-krom.png) · [1024, 8](bilder/C-1024-8.png) |

Gemensamt: vägen in heter «Öppna bordet» och visas som i dag först när korten är laddade; koden ritas som Bord-fliken och TV:n ritar den; «Ny kod» och «Avsluta bordet» ligger i ett ⋯ eller på Bord-fliken; en levande punkt säger att bordet kör, stilla vid nedsatt rörelse och rosa när kort saknas.
Filten i miniatyr är ritad av prototypen; i appen finns den redan som Bord-flikens `.byd-tables-mini` (bordet i skala 0,125).

## Mått

Mätt i markupen med appens regler. Macens typsnitt vid 1440 med 3 platser; Verdana (CI:s bredd) vid 1024 med 8.

| Läge | I dag | D (docka, nedtill) | E (kort över arbetet) | A | B | C | I dag 1024 · 8 | D | E | A | B | C |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| kör | 61 | 81 | 334 × 379, 0 ur arbetet | 63 | 85 | 37 | 109 | 167 | 334 × 475 | 99 | 137 | 37 |
| laddar kort | 61 | 81 | 334 × 404 | 61 | 63 | 37 | 109 | 81 | 334 × 500 | 97 | 63 | 37 |
| frågan om en plats | 113 | 124 | 334 × 577 | 119 | 141 | 37 | 161 | 228 | 334 × 673 | 155 | 193 | 37 |
| ny kod sagd | 81 | 92 | 334 × 406 | 87 | 109 | 37 | 129 | 196 | 334 × 502 | 123 | 161 | 37 |
| kort tappade | 61 | 81 | 334 × 433 | 61 | 85 | 37 | 109 | 113 | 334 × 530 | 113 | 85 | 37 |
| hopfällt | — | — | 236 × 44 | — | — | — | — | — | 265 × 44 | — | — | — |

**F har inget band men får inte plats i huvudet.**
I Macens typsnitt vid 1440 står «Bord ● UF6H2W» helt.
I CI:s typsnitt vid 1440 klipps spelets namn till 34 px (126 i dag); vid 1280 klipps fliken själv, och vid 1024 ryms inte ens punkten.
Det är samma mätning som fällde L60:s variant B («Bordet kör (8) ▾» i huvudet): huvudet är fullt under 1440 (#566).

## Vad varianterna kostar

- **D** kostar 81 px nedtill på alla flikar (dagens 61 upptill); dockan delar underkanten med fotens bekräftelser (#698) och telefonens stegremsa. Vinner ett rum för bordet med egen hierarki (bild → namn → kod → vilka → väg in) som kan växa utan att huvudet flyttar.
- **E** tar ingen höjd men ligger över arbetet: kortväggens sista rad, tabellens högra kolumn och mallens högra verktyg hamnar under kortet tills det fälls ihop; hopfällt syns inga platser. En tredje flytande panel.
- **F** är enklast att bygga och tar ingen yta, men huvudet rymmer det inte (mätt ovan), vägen in är två tryck bort och sparka tre.
- **A** flyttar minst; **B** kostar 24 px; **C** ger 24 px tillbaka men behöver × i Bord-flikens rad.

**Beslut:** väntar på beställaren.
