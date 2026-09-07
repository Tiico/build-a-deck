# PROTOTYP — kameran (C5)

Fråga: hur ramar TV:n in det som är i spel på ett stort bord, och hur zoomar någon tillfälligt utan att vyn stannar där?

Kör: `pnpm proto` → http://localhost:5173/prototype/camera?variant=A
Medan `App.tsx` är under arbete i en annan session finns en direkt ingång som inte går via den: http://localhost:5173/src/prototype/camera/dev.html?variant=A

Bordet är 140 × 90 cm med spelet samlat i mitten. Bo och Cy spelar då och då, ibland långt ut på bordet; "livligt" ökar takten och knapparna tvingar fram ett drag. Bordet är spelbart som på TV:n.

- **A — Kameran följer innehållet.** Bilden är allt som är i spel, med marginal, och glider när det ändras. Scrolla eller dubbelklicka för att zooma kring pekaren; efter sex sekunder återgår kameran.
- **B — Regissören klipper mellan bilder.** Fasta bilder: hela bordet, mitten, högarna, marknaden, varje spelares kant. Regissören klipper till bilden där det senaste draget skedde och tillbaka till hela bordet när det blir tyst. Remsan uppe till höger låter vem som helst hålla en bild i åtta sekunder.
- **C — Hela bordet plus en lupp.** Översikten rör sig aldrig. En lupp i hörnet visar det senaste draget förstorat, med en ram på bordet som visar var; dubbelklicka för att rikta luppen själv.

## Fynd under bygget (oavsett variant)

- En kamera är en rektangel av bordet i millimeter, låst till vyns proportioner; skalan följer av bredden. Renderaren behöver inget nytt: fast `scale` plus en förskjuten behållare med `overflow: hidden` räcker, och pekargeometrin stämmer eftersom TV-läget läser bordets rektangel.
- "Aktivt innehåll" är lösa kort, högar med kort och areor med något i. Händerna räknas inte: de ligger vid kanten och finns alltid, så med dem inräknade blev bilden nästan alltid hela bordet. Fläktarna hamnar då utanför bild när kameran går nära; docken nederst visar ändå platserna.
- Var något hände går att härleda ur loggraden och vyn efteråt, för alla verb utom platsverben. Det är samma fråga som aktivitetshistoriken i snapshoten (fas 1) ställer.
- Bordsläget (lutat) fick ingen kamera i prototypen: en panorering på det lutade planet bryter perspektivillusionen, så där är svaret snarare zoom kring mitten.

## Svar (2026-09-07)

**A — kameran följer innehållet.** Bilden är allt som är i spel, händerna oräknade, med marginal; den glider när innehållet ändras. Tillfällig zoom kring pekaren, som återgår av sig själv efter några sekunder.
B:s fasta bilder kräver namngivna platser ur setupen och C:s lupp delar uppmärksamheten; A är C5:s ordalydelse och behöver inget nytt av protokollet.

Att ta med till implementationen:
- Kameramatten i `camera.ts` (aktiva gränser, inpassning till vyns proportioner, glid) blir riktig kod med test.
- Renderaren får en kamera i TV-läget: fast skala i en förskjuten behållare.
- Vad som räknas som "i spel" är ett beslut att dokumentera i C5.
