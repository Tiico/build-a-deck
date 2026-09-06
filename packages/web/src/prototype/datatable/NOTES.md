# PROTOTYP — tabellen: sortering, filtrering, bulk (L4)

Fråga: hur sorterar, filtrerar och massredigerar designern kortlistan när den växer förbi det som ryms på en skärm?

Kör: `pnpm --filter @byd/web dev` → http://localhost:5175/prototype/datatable?variant=A

24 låtsasrader med `id, typ, kostnad, title, body, antal`.
Alla varianter delar samma tillstånd: sortering per kolumn, filter, markering och åtgärderna ta bort, duplicera, sätt typ, ändra antal.

- **A — Kalkylark.** Klick på rubriken sorterar (↕ ↑ ↓). En filterrad under rubrikerna, ett fält per kolumn. Kryssrutor per rad och i rubriken; en åtgärdsrad visas när något är markerat.
- **B — Verktygsfält.** Ett sökfält över alla fält, chips för typ, en sorteringsmeny. Rader markeras genom klick på raden (shift för intervall), åtgärdsraden dyker upp nertill.
- **C — Frågerad och sparade vyer.** En rad där man skriver `typ = fälla`, `kostnad >= 4`, `body innehåller dolt`. Vyer sparas i en lista till vänster; "Markera träffarna" gör frågan till en markering.

## Fynd under bygget

- Sortering och filter måste bevara raden man redigerar; annars hoppar raden bort under fingrarna. Lösning: sortera först vid blur, inte per tangenttryck.
- Chips för typ (B) är i praktiken det vanligaste filtret, och kombinerar bra med A:s rubriksortering.
- C:s frågor är kraftfulla men den enda av varianterna som kräver att man lär sig en syntax. Sparade vyer är däremot värdefulla oavsett variant — "Fällor", "Saknar text".

## Rekommendation

A som grund (rubriksortering, kryssrutor, åtgärdsrad), med B:s sökfält och typ-chips i stället för en filterrad per kolumn.
Sparade vyer från C som senare steg.

## Svar

_(fylls i när Nicklas valt)_
