# PROTOTYP — närvaro på bordet (K6)

Fråga: hur ser man var de andra är och vad de gör på det delade bordet, utan ljud (K7)?

Kör: `pnpm proto` → http://localhost:5173/prototype/presence?variant=A

Riktiga bordsrenderaren i TV-läge med motorn i webbläsaren.
Din pekare är Ada; Bo vandrar runt marknaden och pekar ibland; Cy lyfter kort, bär dem en stund och släpper.
Håll på filten för att peka. Allt går i ett efemärt lager som aldrig rör loggen.

- **A — Pilar med namn.** Klassiska pilmarkörer med namnbricka i platsens färg; tonar bort efter 2,5 s stillhet. Peka = ringar. Ett flyttat kort glöder i färgen 1,6 s.
- **B — Mjuka markörer + speglade dragningar.** Prickar i stället för pilar, och andras pågående dragningar speglas live: kortet lyfts, följer handen och bär namnbricka innan det släpps.
- **C — Inga markörer.** Bara händerna syns: speglade dragningar, pekningar och färg på flyttade kort. Ingen vet var man är förrän man gör något.

## Fynd under bygget (oavsett variant)

- Tillskrivningen ("ett flyttat kort bär kort platsens färg") behöver ingen kanal: aktivitetsraden bär redan `by`, så bordet kan glöda ur loggen.
- Spegling av dragningar kräver att renderaren rapporterar sin pågående dragning (`onDrag`) och kan rita andras lyfta kort; markörer kräver ett överlägg *inne i* renderaren, annars stämmer de inte i bordsläget (perspektivet).
- Kanalen bör vara ett `presence`-meddelande på samma WebSocket som servern bara vidarebefordrar till övriga anslutningar på bordet; avsändaren är anslutningens plats (null för en bordsskärm). Sändning bör strypas (~20 Hz) och markörer tonas bort på klienten.
- Bordsskärmen i TV-läge har ingen egen markör (fingrar på skärmen) men får pekningar och dragningar från de som spelar på distans.

## Svar

_(fylls i när en variant valts)_
