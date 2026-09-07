# PROTOTYP — illustrationer i editorn (E1, DRIFT §4)

Fråga: hur lägger designern bilder på korten i editorn, och var bor spelets bilder?

Kör: `pnpm proto` → http://localhost:5173/prototype/assets?variant=A

Gemensam modell i alla varianter: en bild är en innehållsadresserad asset (`asset:<hash>` i radens fält), lagrad en gång hur många kort den än sitter på; kompilatorn får en URL i stället för referensen. Fyra låtsasbilder finns från start.

- **A — Bildceller i tabellen.** Bildfältet är en cell med tumnagel; släpp en fil eller en av spelets bilder på cellen, eller välj med knappen. Väggen bredvid följer.
- **B — Släpp på kortet.** Kortets bildyta är målet på väggen; brickan nederst är spelets bilder med hur många kort var och en sitter på.
- **C — Biblioteket matchar på namn.** Släpp hela mappen; `drake.png` hamnar på kortet Drake, resten väntar i biblioteket och fördelas från en lista.

## Fynd under bygget

- Rader som pekar på assets i stället för att bära base64 gör projektdokumentet litet igen; i dag bär wizardens rader hela bilden.
- Upplösningen asset → URL hör hemma där kompilatorn anropas: i webbläsaren `GET /assets/<hash>` (302 till R2 som `/faces`), i renderworkern bytes ur lagret som data-URL.
- Samma bild på många kort är vanligt (baksidor, ramar): brickan i B och biblioteket i C visar det, tabellen i A inte.

## Svar

_(fylls i när en variant valts)_
