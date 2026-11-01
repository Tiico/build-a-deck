# Brickor på filten, i telefonen och i editorn (2026-10-28, #1474)

Prototypen till bricka 1/7 i #1470.
Beställarens beslut 2026-10-28 står fast och prövas inte här: unika brickor med egen datatabell ingår i release, formerna är kvadrat, sexhörning och rund, en bricka får hållas dold på handen, sexhörningens 60° är en fråga för gränssnittet (`rotate` finns), och C2 står kvar.
Inget nytt verb behövs i någon variant.

Prototypen är `prototyper/index.html`, servad över http (`python3 -m http.server` i `prototyper/`).
`?yta=filt|telefon|editor|kopia&v=A|B|C` väljer yta och variant, och ← → byter variant.
A är rekommendationen på varje yta och öppnas först.

Geometrin är receptets (`packages/server/src/recipe.ts`), inte den delade `felt.js`, som lägger högarna fel.
Skalan på TV:n är uppmätt: fyra platser vid 1920 × 1080 ger 1,24 px/mm (kortet 78 px), åtta platser 0,71 px/mm (kortet på K9:s golv, 45 px).
Måtten i prototypen: sexhörning 52 mm mellan sidorna, kvadrat 45 mm, rund bricka 44 mm, guldmyntet 25 mm, kartong 2 mm.

## Filten

- **A · Hög och ring (rekommenderas).** Brickan i sin form med kartongens kant (C1). Ringen har «↺ Vrid 60°» och «↻ Vrid 60°» (90° för kvadrat och rund), och <kbd>R</kbd>/<kbd>Shift R</kbd> vrider ett steg med en kort markering av stegen. Påsen är en dold hög som korten.
- **B · Påse och vred.** Den dolda högen ritas som ett tygknyte. En vald bricka får ett vred som snäpper i formens steg och visar vinkeln.
- **C · Sjö, tryck och rutnät.** Dolda brickor utspridda med baksidan upp, ett tryck vrider ett steg, och släppta brickor lägger sig i ett rutnät.

Mätt vid TV 8: sexhörningen 37 px, kvadraten 32 px, myntet 18 px. Myntet behöver en träffyta som räknarbrickans.

## Telefonen

- **A · Samma rad, egen form (rekommenderas).** Brickorna ligger i handens rad efter korten, i verklig storlek mot kortet. På TV:n ligger brickans baksida i samma solfjäder.
- **B · Två hyllor.** «Kort» och «Brickor» som egna rader; på TV:n två buntar.
- **C · Allt i kortets ram.** Brickan centrerad i en kortram; på TV:n kortformade baksidor med en sexhörning.

«Framför mig» och «Bordet» är lika i alla tre: en bricka i en zon vrids med ↺/↻ i formens steg, och den dolda högen har «Dra 1».
Andra platser och TV:n får antal och form, aldrig id eller bild.

## Editorn

- **A · En flik per lek (rekommenderas).** Kortväggen visar varje lek som ett avsnitt; Mall och Tabell får en rad med en flik per lek och «＋ Lek». Form, mått, kartong och steg står i Malls egenskaper under «Brickan».
- **B · Växel i huvudet.** En växel «Kort · Landskap» före flikarna byter Kortvägg, Mall och Tabell.
- **C · Kortgrupp med egen form.** Brickorna är en grupp i den enda leken, med egen mall och en gemensam tabell med kolumnen «Grupp».

I alla tre har fliken Bords ＋-meny raden «Bricka», och den öppnar två val sida vid sida: **Markör** (en bild i n exemplar, ytorna ritas på raden som lådans, kostar en rad) och **Hög ur en lek** (en bild per rad i en egen tabell, kostar en lek med mall och tabell).

## Den fysiska kopian

Stansarket som produkt (#1406): arket i 3D med ljus och glans, tre utpetade brickor och en stapel mynt, att vrida.
Arkets mått är en gissning tills en partner finns (F1, F2).

## Skärmbilder

`bilder/`, tagna med Playwright vid 390 × 844, 1280 × 800 och 1920 × 1080.
