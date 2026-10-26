# Bordsbandet inför release — prototyp 2026-10-26

**Frågan:** bandet under editorns huvud när ett bord kör ser ut som en platshållare: en mening med tankstreck och punkter, en länk i gemener mitt i meningen, koden som ett fetstilt ord, och «Ny kod» som en kantad knapp bredvid det som läses högt till alla i rummet.
Hur ser det ut som en färdig produkt, utan att bryta L60 (en plats är en bricka med ×), L61 (brickan är pillret på 44 px) och L86 (en väg in, «Öppna bordet»)?

Bara bandet inne på spelets sida (editorn, `.byd-editor-table-link` i `EditorPage.tsx`); Mina spels «Pågår nu» rörs inte.

Prototypen är [`prototyper/index.html`](prototyper/index.html); servera mappen över http och öppna `?v=0|A|B|C`.
Huvudet och «i dag» ritas med appens egna regler: `prototyper/appen.css` är genererad ur `packages/web/src` av `prototyper/matning/extract.mjs`.
Växlarna: bredd 1024/1280/1440, Macens typsnitt eller Verdana (CI:s bredd), svenska/engelska, 0/3/8 platser, och grund (dagens gröna, eller Bord-flikens krom med den levande gröna kanten).
Varje variant visas i fem lägen: kör, laddar kort, frågan om en plats, ny kod sagd, kort som inte kunde laddas.

| Variant | Idé | Bild |
| --- | --- | --- |
| 0 · I dag | En mening: «Bordet kör version 7 — öppna bordet · rumskod UF6H2W [Ny kod] · vid bordet: [Ada ×] …». | [1440](bilder/idag-1440.png) · [1024, 8 platser](bilder/idag-1024-8.png) |
| A · Raden får struktur | Samma rad och höjd; fyra grupper i stället för en mening: levande punkt + «Bordet kör v7», koden som bricka i TV:ns bokstäver med «Kopiera länk», platserna som i dag, och längst till höger «Öppna bordet» som knapp med flikens tecken och ett ⋯ med «Ny kod» och «Avsluta bordet». | [1440](bilder/A-1440.png) · [krom](bilder/A-1440-krom.png) · [1024, 8](bilder/A-1024-8.png) · [1280, 8](bilder/A-1280-8.png) |
| B · Biljetten | Två rader: koden som en biljett till vänster («RUMSKOD» och koden i TV:ns storlek), bordets fakta bredvid (punkt, «Bordet kör v7», hur ni sitter), platserna som brickor med ansikte på en egen rad, vägen in till höger. | [1440](bilder/B-1440.png) · [krom](bilder/B-1440-krom.png) · [1024, 8](bilder/B-1024-8.png) · [1280, 8](bilder/B-1280-8.png) |
| C · Smal statusrad | En rad på 36 px: punkt, kod, «v7», «Ada, Bo och Cia spelar», «Öppna bordet» och «Platserna i Bord». Inga brickor, ingen «Ny kod»: det sköts i Bord-flikens rad (L60:s variant C). | [1440](bilder/C-1440.png) · [krom](bilder/C-1440-krom.png) · [1024, 8](bilder/C-1024-8.png) |

Gemensamt för A, B och C: vägen in är en knapp som heter «Öppna bordet» (som raden i Bord, L86) och visas som i dag först när korten är laddade; koden är ritad som Bord-fliken och TV:n ritar den (monospace, spärrad, på en mörk bricka); «Ny kod» och «Avsluta bordet» ligger i ett ⋯ (A, B) eller i Bord-fliken (C); en levande punkt säger att bordet kör, stilla vid nedsatt rörelse och rosa när kort saknas.

## Mått

Bandets höjd i den byggda markupen med appens regler, Macens typsnitt vid 1440 med 3 platser och Verdana (CI:s bredd) vid 1024 med 8.

| Läge | I dag 1440 | A | B | C | I dag 1024 · 8 | A | B | C |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| kör | 61 | 63 | 85 | 37 | 109 | 99 | 137 | 37 |
| laddar kort | 61 | 61 | 63 | 37 | 109 | 97 | 63 | 37 |
| frågan om en plats | 113 | 119 | 141 | 37 (i Bord) | 161 | 155 | 193 | 37 |
| ny kod sagd | 81 | 87 | 109 | 37 | 129 | 123 | 161 | 37 |
| kort tappade | 61 | 61 | 85 | 37 | 109 | 113 | 85 | 37 |

Vid 1280 med 8 platser på CI:s typsnitt ryms A:s brickor på första raden men inte «Öppna bordet», som då står ensam på en andra rad (115 px); i dag är bandet 109 där.
B är alltid två rader med platser, också med tre; C är alltid en.

## Vad varianterna kostar

- **A** flyttar minst: inget lämnar bandet utom «Ny kod», som går in i ett ⋯. Platserna säger inte «vid bordet:» i ord, bara i brickornas namn (listan heter det för skärmläsaren). Ett ⋯ till i editorn.
- **B** kostar 20–24 px av arbetet så länge bordet kör, på alla flikar. Ett ansikte på brickan är en ny form bredvid L61:s piller. Säger som enda yta i editorn hur ni sitter.
- **C** ger 24 px arbete tillbaka och bryter aldrig, men värdens sparka är två tryck bort, och Bord-flikens rad har ingen × i dag: det är ett bygge till. Namnen klipps vid åtta platser på 1024.

**Beslut:** väntar på beställaren.
