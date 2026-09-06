# PROTOTYP — direkt manipulation på bordet

Fråga: hur känns det att flytta, stapla, dra ur högar och släppa i zoner på det delade bordet, och hur når man verben som en dragning inte kan uttrycka (vänd, vrid, blanda, dela, flytta hög)?

Kör: `pnpm proto` → http://localhost:5173/prototype/drag?variant=A&mode=tv (eller `mode=table` för perspektivet)

Motorn kör på riktigt i webbläsaren; raden överst visar seq och senaste raden, och ångra.
Dragning är densamma i alla tre (K1, K2): lösa kort, översta kortet i en hög, hela högen i etiketten.
Släpp på kort = stapla, på hög = lägg överst, i zon = flytta dit, annars fri placering.

- **A — Bara gester.** Inga knappar. Dubbeltryck kort = vänd, dubbeltryck hög = blanda, rulla = vrid, dra i etiketten = flytta hög. "Dela av N" saknar gest.
- **B — Verktygsrad vid markering.** Klick markerar (shift = fler), en verktygsrad med verben ligger vid markeringen; dra en markerad drar alla. Dela av har en stegare.
- **C — Radialmeny på håll.** Håll på kort eller hög öppnar en ring runt fingret; glid till ett verb och släpp. Snabb dragning före hållet är en flytt. Ingen markering finns.

## Fynd under bygget (oavsett variant)

- Motorbugg: en hög skapad med `stack` fick kortets zonrelativa x/y som absolut geometri, så den hamnade fel så fort golvet inte låg i origo. Rättad test-först; `split` utan mål tar nu bordskoordinater som `movePile`.
- Bordsläget (`rotateX(24deg)` under `perspective: 1600px`) kräver en inversprojektion från pekare till bordsplan; `geometry.ts` gör den exakt (kortet landar under fingret på 0,2 px). Den ska in i den riktiga renderaren med test.
- Att dra översta kortet ur en dold hög och släppa det på ett löst kort går inte att uttrycka: `stack` behöver ett komponent-id som tråden aldrig ger. Antingen `stack` med hög som källa, eller så landar kortet bredvid. Publika högar går (`draw` + `stack`).
- `ZoneView` bär inte `parent` för dynamiska högar; `split` med koordinater behöver inte det nu när koordinaterna är absoluta.
- Att vända översta kortet i en dold hög går inte heller utan id (vända draghögens översta är en vanlig fysisk handling).

## Svar

_(fylls i när en variant valts)_
