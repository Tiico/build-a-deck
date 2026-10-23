# Telefonen mot TV:n, från grunden

Beställaren bad 2026-10-22 om en omtagning från grunden av telefonens spelaryta (`/play`) när bordet står på TV:n: den var grötig och svår att använda.

## I dag

`bilder/idag-hela-sidan-390.png` är den byggda appen vid 390 × 844, fyra platser, sex kort på handen, två räknare.
Allt står i en kolumn: huvudet med fyra knappar, räknarna, rubriken «Dina kort» med högarna under sig, remsan, en markör, sex knappar under remsan, tre hopfällbara avsnitt och en fast fot.
«Framför mig» och «Spela…» står två gånger på samma skärm, och foten ligger över «Senaste dragen».

## Prototypen

`prototyper/index.html` ritar tre strukturellt olika svar, växlade med `?v=A|B|C` eller pilarna.
Den är fristående: ingen server och inga riktiga kortbilder.
Kör den med `python3 -m http.server --directory docs/ux-audits/2026-10-22-telefonen/prototyper` och öppna `/?v=B`.

- **A — Kortet i fokus.** Ett stort kort i taget med svep, verben under kortet, räknarna som chip i huvudet.
- **B — Flikar.** Fyra flikar längst ner: Handen, Framför mig, Bordet, Mer. Handen är ett rutnät med tre i bredd, och ett val tar fram en handlingsrad ovanför flikarna.
- **C — Platserna i handen.** Platserna som rutor överst, handen som solfjäder nederst; dra ett kort till en plats, eller tryck kortet och sedan platsen.

## Beslutet

Beställaren valde **B** 2026-10-22.
Bilderna `B-1-vila` till `B-5-mer` visar varje flik vid 390 × 844.
Implementationen följs i issuet som länkar hit, och beslutet skrivs in i DESIGN-BESLUT C4 när det byggs.
