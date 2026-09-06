# PROTOTYP — logga in och "Mina spel" (G1, DRIFT §11)

Fråga: hur kommer en skapare in, loggar in med magisk länk, och hittar sina spel? Gäster ser aldrig det här.

Kör: `pnpm proto` → http://localhost:5173/prototype/account?variant=A

Ingen server: "Skicka inloggningslänk" blir "Kolla mejlen", och knappen i statusraden låtsas klicka på länken.

- **A — Kort i mitten.** En liten inloggningsruta med en mening om produkten; "Mina spel" som ett rutnät av spelkort med en solfjäder av kortens färger och "Nytt spel" som ett streckat kort.
- **B — Pitch till vänster, formulär till höger.** Landningssida med säljtext och tre punkter; "Mina spel" som rader med Öppna editorn / Starta ett bord.
- **C — Mina spel med mjuk grind.** En enda sida: e-postfältet i huvudet, spelen syns suddade bakom grinden som ett löfte, och blir skarpa efter inloggning.

## Fynd under bygget (oavsett variant)

- Alla tre säger samma sak om gäster: "Ska du bara spela? Skanna QR-koden på bordet — inget konto behövs." Den meningen är produktens gräns mellan skapare och spelare (G1) och bör stå på inloggningssidan oavsett form.
- "Mina spel" behöver per spel: namn, rev, när det spelades senast och med hur många. Det sista kräver att sessioner kan slås upp per projekt (`sessions.project` finns) — en `GET /projects` som även ger senaste sessionen.
- Editorn och wizarden måste skicka kakan (`credentials: 'include'` i utveckling där origin skiljer) och skicka vidare till `/login?next=` vid 401.

## Svar

_(fylls i när en variant valts)_
