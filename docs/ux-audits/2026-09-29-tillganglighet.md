# Tillgänglighetsgranskning 2026-09-29: hela tjänsten på grundnivå

ROADMAP fas 6: «Tillgänglighet i verktyget självt på en grundnivå: tangentbord, kontrast, skärmläsarnamn».
L12 säger att editorn är skrivbordsförst men att tillgängligheten inte är lättad för den, och granskningen håller sig till det.

## Sammanfattningen i en mening

axe-core hittar nästan ingenting, men **84 fynd** kommer fram när man faktiskt använder tjänsten med tangentbord och skärmläsarens träd, mäter kontrast på annat än text och zoomar.
Två av dem stänger ute en användare helt: kortets text finns bara i en bild, och editorn slutar fungera vid 200 % zoom.

| Yta | Hög | Medel | Låg | Delrapport |
| --- | --- | --- | --- | --- |
| Konto, start och anslutning | 1 | 6 | 11 | [konto](2026-09-29-tillganglighet/konto.md) |
| Editorn: ram, Kortvägg, Mall, Tabell | 1 | 9 | 10 | [editor-1](2026-09-29-tillganglighet/editor-1.md) |
| Editorn: Bord, Symboler, Media, Regler, hjälpen | 2 | 8 | 10 | [editor-2](2026-09-29-tillganglighet/editor-2.md) |
| Spelytorna: telefon, distansvy, bord, TV, observatör | 2 | 12 | 12 | [spel](2026-09-29-tillganglighet/spel.md) |
| **Totalt** | **6** | **35** | **43** | |

## Metod

Den riktiga webbappen och servern kördes lokalt via `run-lasbarhet.ts` med render-workern igång: Sal's Saloon med 77 kort och fyra platser, ett bord med utdelade händer, och texturerna laddade.
Fyra granskningar gick parallellt i Chromium via Playwright, en per ytgrupp, med bredderna från [UX-KONTROLLER](../UX-KONTROLLER.md) och L12:
- **axe-core** (`@axe-core/playwright`, taggarna WCAG 2.0–2.2 A/AA) i varje tillstånd som kunde nås.
- **Tangentbordet** med riktiga tangenttryck: `element.focus()` ritar ingen fokusring i Chromium.
- **Tillgänglighetsträdet** genom `ariaSnapshot`.
- **Kontrast för annat än text**, uppmätt i målade pixlar.
- **Träffytor**: WCAG 2.5.8 och repots egen 44 px-regel.
- **Reducerad rörelse**.
- **200 % zoom och rotens textstorlek.**

På spelytorna kontrollerades dessutom att en annan plats dolda handkort aldrig syns i HTML, i tillgänglighetsträdet eller i WebSocket-ramarna. Det höll.

Ej granskat:
- Ingen riktig skärmläsare (VoiceOver eller NVDA) användes. Det fynden säger om uppläsning bygger på trädet och WCAG:s regler.
- Tvingade färger.
- Sådant som hade skrivit över det delade projektet, till exempel att checka in en cell, ta bort zoner eller avsluta ett bord.
- En giltig inbjudan och en lyckad `/claim`.

## Det som höll

- axe var rent i nästan alla tillstånd.
- Knappspråkets fokusring (3 px `#9cc6ff`, 8,6–9,9:1) och K16:s tvåbandsring på filten fungerar som de ska.
- K16:s adresspanel går att använda hela vägen. Hjälplådan (L32) tar och lämnar fokus som den ska.
- Menyer, historiken, delningspanelen och krönets lådor lämnar tillbaka fokus med Escape.
- Inget rör sig under `prefers-reduced-motion`, utom TV:ns kamera (se nedan).
- Telefonens träffytor är 44 px överallt.
- `lang` följer språkvalet.

## Beslut som behövs (HITL)

1. **Zoom och omflöde i editorn och wizarden** (A-1, E-1, F-4, samt A-17, E-2 och P-18).
   Vid 200 % zoom på en vanlig skärm är fönstret 640 CSS-px brett, och editorn går då in i sitt smala läge:
   - Mall-fliken försvinner.
   - Kortväggens rullyta blir 2 px hög.
   - Tabellen visar inga rader.
   - Wizarden lämnar 9 % av höjden åt innehållet vid 400 %.

   All text är satt i px, så webbläsarens inställning för textstorlek gör ingenting.
   L12 lät editorn degradera på en *smal skärm*, men en zoomad skrivbordsskärm är en skrivbordsanvändare. Beslutet är hur de två skiljs åt, och om texten ska gå över till `rem`.
2. **Kortets text för skärmläsare** (P-1 och P-2).
   Kortets regeltext finns bara i den renderade bilden (`alt=""`), och läsvyerna säger bara titeln.
   Klienten får inte kortets kolumner (B6), så ingen läsvy kan säga mer än titeln.
   Observatörens bord har för en skärmläsare inga kortnamn alls, inte ens händerna som är rollens poäng.
3. **Enteckensgenvägarna och en flytt utan dragning på filten** (P-7 och P-8).
   F, D och S verkar på kortet under pekaren var fokus än står, och de går inte att stänga av (WCAG 2.1.4).
   Ringen på ett kort som redan ligger på filten har ingen flytt, så en pekare utan dragning kommer inte åt att flytta det (2.5.7).
   Båda rör K14 och K16.
4. **Kontrasten för fält och zonkonturer** (A-6, E-8, P-9 och F-17).
   Textfältens kanter mäter 1,41–1,48:1 och zonernas kontur på den gröna filten 1,55:1, mot WCAG:s 3:1 för annat än text.
   L13 lyfte knapparna men inte fälten. Det är ett visuellt beslut för varje yta.
5. **En zons storlek utan dragning** (F-1, Bord-fliken).
   Storleken ändras bara genom att dra ett hörn på 12×12 px. Det finns ingen väg med tangentbordet och inga fält.

## Planen: en yta i taget

Rättningarna som är entydiga (AFK) samlas per yta. De visuella och beslutskrävande skivorna (HITL) prototypas först.
Varje issue har en rad för varje fynd, med ID, nivå, WCAG-kriterium, en reproduktion och en länk till skärmbilden i delrapporten.

Redan rättat under granskningen: A-2 och A-3 (fokus i export- och importdialogerna, #546).
