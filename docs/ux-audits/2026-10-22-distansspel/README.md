# Distansspel: hur man bjuder in och spelar vid varsin dator (2026-10-22)

Beställaren: «Det är väldigt otydligt hur man joinar och spelar där alla sitter på varsin dator.»

Resan genomgången i den byggda appen (`packages/e2e`-stacken, 1280 × 800), som värd och som vän i två separata webbläsare.

## Fynd

1. Efter **Starta** säger editorn bara «rumskod M7CG38» (`2-efter-starta.png`).
   Ingen adress, ingen länk att kopiera, ingenting om att den som sitter någon annanstans ska få något.
2. Bordets egen skärm säger «Öppna på telefonen» (`4-bordets-skarm.png`); hela vägen in förutsätter en TV i rummet.
3. Värdens egen väg till bordet, **Spela härifrån**, ligger i menyn bakom pilen bredvid Starta (`3-starta-menyn.png`).
   Den sätter värden på en plats som «Designern» utan att fråga efter namn (`7-varden-online.png`).
4. Väl vid bordet på `/online` syns varken koden eller adressen någonstans, så den som spelar kan inte bjuda in fler utan att gå tillbaka till editorn.
5. Anslutningssidan på en dator (`5-vannen-anslutning.png`) erbjuder «Spela på den här skärmen», «Sätt dig» och «Bara titta» utan att säga vad som skiljer de två första.
6. När man väl sitter fungerar spelet (`6-vannen-online.png`): båda ser filten, sin hand och «Starta spelet».

## Prototyp

`prototyper/index.html`, tre varianter × tre steg (värden startar, vännen öppnar länken, vid bordet), plus «Idag».
Varje steg är en riktig skärmbild med ändringen ritad ovanpå i appens egna mått.

- **A · Länken överallt** (rekommenderas): adressen med kopieringsknapp i bandet efter Starta och bakom «Bjud in» i distansvyns topprad. «Spela själv här» är en synlig knapp som frågar efter namn. Anslutningssidans två vägar förklaras.
- **B · Väntrummet**: Starta frågar «hur sitter ni?» och sätter värden direkt vid bordet med ett väntrum på filten. Det ligger nära ett spelläge, vilket C2 säger nej till.
- **C · Inbjudan per plats**: en länk per ledig plats (`/KOD/A`), både i bandet och på filtens tomma skylt. Kräver platsadresser i servern.

Beslut: _väntar på beställaren_.
