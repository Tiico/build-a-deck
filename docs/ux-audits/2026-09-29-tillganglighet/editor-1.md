# Tillgänglighetsgranskning — editorn (ram, Kortvägg, Mall, Tabell)

Datum: 2026-09-29.
Granskare: agent, endast läsande.
Projekt: `lasbarhet` (Sal's Saloon) på `localhost:5319`/`8319`, ägarkaka, `locale: sv-SE`.

## Metod

Playwright 1.63 (Chromium, headless) med skript i `editor1/` (`lib.mjs`, `s1`–`s21.mjs`).
Bredderna var 1280×800 och 1024×768.
Zoom kontrollerades på två sätt: rotens `font-size: 200%` vid 1280, och 640×400, 853×533 och 960×540 som motsvarar 200 % och 150 % webbläsarzoom.
axe-core 4.13 kördes med taggarna wcag2a/aa, wcag21a/aa och wcag22aa i varje tillstånd; JSON-filerna ligger i `editor1/axe-*.json`.
Tangentbordet testades bara med riktiga tangenttryck (`page.keyboard.press`).
När ett startläge behövdes sattes det med `locator.focus()`, och sedan styrdes allt med tangenter.
Fokusringen lästes ur beräknad `outline`/`box-shadow` och ur skärmbilder.
Namn, roller och tillstånd lästes ur `ariaSnapshot()` (`editor1/aria-*.yaml`).
Kontrasten räknades både på beräknade färger och på målade pixlar (`px.mjs`).
Målstorlekarna mättes på effektiv träffyta, där en omslutande `<label>` räknas med.
För rörelse genomsöktes varje element efter `transition`, `animation` och `scroll-behavior` med `reducedMotion: 'reduce'`.
Besluten L11, L12, L13, L32 och K16 och `docs/UX-KONTROLLER.md` lästes före bedömningen.

axe:s cirka 30–110 ”incomplete color-contrast” per tillstånd beror på förhandsvisningarna av korten, där text ligger på bilder och band.
Det är formgivarens eget innehåll och räknas inte som fynd.

## Fynd

| ID | Allvar | Flik · tillstånd · bredd | WCAG | Fynd | Reproduktion | Skärmbild | Förslag |
|---|---|---|---|---|---|---|---|
| E-1 | Hög | Alla flikar · vila · 1280×800 vid 200 % webbläsarzoom (640×400 CSS-px) | 1.4.4, 1.4.10 | Mall-fliken försvinner helt, eftersom den är spärrad under 768 px (gul notis: ”Mallen ritas inte på telefon …”). Kortväggens rullyta `.byd-wall-deck` blir **2 px** hög, så inget kort syns. Tabellens rullyta `.byd-data-scroll` blir 56 px hög med **0 synliga rader**. De fasta banden (huvud, notis, bordsrad, krona och flikrad längst ner) äter hela höjden, och sidan skrollar inte (`scrollHeight` = 400). Fliken ”Bord” är avskuren i flikraden. Vid 1440-skärm och 200 % (720 px) försvinner Mall också. | Öppna editorn, zooma webbläsaren till 200 % på en 1280×800-skärm. | [s18-640x400-Kortvägg.png](editor-1/s18-640x400-Kortvägg.png), [s19-640x400-Tabell.png](editor-1/s19-640x400-Tabell.png) | Behöver design. L12 tillåter att editorn degraderar under skrivbordsbredd men säger samtidigt att tillgänglighet inte lättas. En formgivare som zoomar 200 % på en laptop är en skrivbordsanvändare, så 768-spärren och de fasta banden krockar med L12:s egen formulering. |
| E-2 | Låg | Alla · rot-`font-size` 200 % · 1280 | 1.4.4 (förstärker E-1) | Rotens teckenstorlek påverkar ingenting: all text och alla kontroller har samma mått före och efter (t.ex. sökfältet 240×44). Texten är låst i px, så webbläsarens inställning för teckenstorlek når inte editorn. Webbläsarzoom är därmed den enda vägen, och den leder till E-1. | Lägg till `html{font-size:200%}` och jämför. | [s17-zoom200-1280-Mall.png](editor-1/s17-zoom200-1280-Mall.png) | Behöver design, tillsammans med E-1: rem för text. |
| E-3 | Medel | Tabell · vila · 1280 och 1024 | 2.4.3 | ”Fler filter” (`button.byd-crown-more`, ›) rullar chipraden till slutet och tas sedan bort, så **fokus faller till `<body>`**. Det finns ingen ‹-knapp tillbaka. | Fokusera ›, tryck Enter; `document.activeElement` är `body`. | [s13-Fler_filter.png](editor-1/s13-Fler_filter.png) | Direkt fix: lämna fokus på sista chipet eller på en kvarstående knapp. |
| E-4 | Medel | Mall · ikonväljaren öppen (verktyget ”Ikon”) · 1280 | 4.1.2 | `aria-activedescendant` sitter på en `<button>`, vilket inte är tillåtet (axe `aria-allowed-attr`, critical). Pilarna flyttar den aktiva symbolen, men skärmläsare läser inte upp aktiv descendant på en knapp, så valet sker i blindo. Listrutan `#byd-tool-symbols` får också `scrollable-region-focusable`; den följer av samma mönster. | Fokusera Ikon, tryck Enter och sedan ↓ →; `aria-activedescendant` ändras men rollen är button. | [s14-ikon-picker.png](editor-1/s14-ikon-picker.png) | Direkt fix: ge knappen `role="combobox"` med `aria-haspopup="listbox"`, som cellens klammer redan gör. |
| E-5 | Medel | Tabell · vila · 1280 | 2.4.1, 2.1.1 (effektivitet) | Tabellen har **470 tabbstopp** för 77 rader: varje cell, varje ”Sätt in en ikon”, varje kryssruta och varje ”ta bort”. ”+ Nytt kort” och sidfoten nås först efter cirka 470 Tab. Det finns ingen genväg förbi tabellen och ingen roving tabindex; ↑/↓/Enter fungerar bara inom en kolumn. | Tabba från sökfältet och räkna. | [s10-tabell-rest.png](editor-1/s10-tabell-rest.png) | Behöver design: ett rutnät med ett tabbstopp (`role=grid` och roving, som `roving.ts`), eller en hopplänk förbi tabellen. |
| E-6 | Medel | Tabell · markerad/aktiv rad · 1280 | 1.4.3 | Id-texten i markerad rad, `#868ea3` på `#2f3a55`, ger **3.45:1** vid 12 px. Samma par finns i cellverktygets `{ }` (`button[data-tool=symbol]`) och i etiketten `b` ”body · final-shootout” (10 px, fet). | Fokusera en cell i raden juice-em-up. axe: `tr[data-card-ref="juice-em-up"] > .byd-data-id`. | [s12-cell-focus.png](editor-1/s12-cell-focus.png) | Direkt fix: ljusare textton på den markerade raden. |
| E-7 | Medel | Mall · vila · 1280 | 1.4.11 | Lagerlistans olåsta lås (`.byd-layer-lock`, en kontroll som bara är ikon) ritas i `#545d70` på `#23262e`, vilket ger **2.29:1**. Det låsta tillståndet `#e8c06a` ger 8.77:1. | Titta på lagerlistan. | [s16-layer-lock.png](editor-1/s16-layer-lock.png) | Direkt fix: ta upp den olåsta tonen till ≥ 3:1. |
| E-8 | Medel | Kortvägg, Tabell, Mall · vila · 1280 | 1.4.11 | Inmatningsfälten saknar en urskiljbar gräns. Sökfälten (`.byd-crown-search`, `.byd-data-search`) har kanten `#3b414e` mot `#23262e`, vilket ger **1.48:1**, och fältets fyllning mot omgivningen ger 1.20:1. Mall-flikens `select` har kanten `#2a2d36` mot `#1b1d23`, alltså 1.22:1. Den oikryssade kryssrutan är målad cirka `#636363` på `#23262e`, alltså cirka **2.5:1**. Det är samma 1.48 som L13 mätte och lagade för knappar med `--byd-secondary-line`, men fälten fick aldrig den tokenen. | Mät beräknad kant och målade pixlar. | [s1-rest-1280.png](editor-1/s1-rest-1280.png), [s16-checkbox.png](editor-1/s16-checkbox.png) | Direkt fix: använd `--byd-secondary-line` på fältkanter. Kryssrutans kant behöver mätas mot L11. |
| E-9 | Medel | Mall · vila · 1280 (och 1024) | 2.4.6 | Lagerlistans namn kapas vid 220 px: alla sex villkorslager visas som **”om rarite…”** och går inte att skilja åt med ögat. De fulla namnen (”om raritet = Silver · 14 kort”) finns bara i tillgänglighetsträdet. | Öppna Mall. | [s16-layer-lock.png](editor-1/s16-layer-lock.png), [s17-zoom200-1280-Mall.png](editor-1/s17-zoom200-1280-Mall.png) | Behöver design: kapa i början, visa villkorets värde först, eller låta raden bryta. |
| E-10 | Medel | Kortvägg · kort markerat och fokuserat · 1280 | 2.4.7 | Fokus och markering är två blåtoner: fokus `#9cc6ff` med offset 2 och markerat `#3c8ce7` med offset 3, som ger 1.96:1 mot varandra. När det markerade kortet har fokus ritas **bara markeringsringen**, eftersom outline byts till `#3c8ce7`. Fokuserat och markerat ser därför exakt ut som enbart markerat, och den som tabbar tillbaka till väggen ser inte var fokus står. | Fokusera ett kort, tryck Enter, tabba bort och tillbaka. | [s16-wall-selected-and-focus.png](editor-1/s16-wall-selected-and-focus.png), [s3-wall-selected.png](editor-1/s3-wall-selected.png) | Direkt fix: rita fokusringen utanför markeringen, t.ex. K16:s två band. |
| E-11 | Låg | Mall · vila · 1280 | 1.3.1 | Två `main`-landmärken: dukens scen `main#byd-canvas-group-panel` (tabbstopp, namngiven av gruppknappen) ligger inuti sidans `<main>`. | `document.querySelectorAll('main')`. | [s7-mall-rest.png](editor-1/s7-mall-rest.png) | Direkt fix: gör scenen till `section`/`region`. |
| E-12 | Låg | Tabell · kolumnhuvud i fokus · 1280 | 2.4.6, 1.3.1 | Varje textkolumn har en popover med knappen ”Gör prosa”/”Gör vanlig text” i tabbordningen. Det ger fyra identiskt namngivna knappar utan kolumnnamn, och popoverns förklaring (”typ skrivs som vanlig text …”) är inte kopplad med `aria-describedby`. | Tabba från sorteringsknappen ”typ”. | [s21-prose-turn-focus.png](editor-1/s21-prose-turn-focus.png) | Direkt fix: namn med kolumnen i, plus `aria-describedby`. |
| E-13 | Låg | Mall · lager i fokus · 1280 | 4.1.3 | Alt+↑/↓ flyttar lagret och fokus följer med, men **ingenting läses upp**; live-regionerna är tomma. Duken säger däremot varje knuff (”title · x 6 mm …”). | Fokusera ett lager, tryck Alt+↓ och läs `[role=status]`. | [s9-layer-selected.png](editor-1/s9-layer-selected.png) | Direkt fix: säg den nya platsen (”title, plats 3 av 13”). |
| E-14 | Låg | Kortvägg · sökning · 1280 | 4.1.3 | Antalet träffar läses inte upp. Foten ”77 kort · 150 px breda” är inte live, och bara tomläget har `role=status`. Tabellens ”X av 77 kort” är däremot `aria-live=polite`. | Skriv ”Duel” i sökfältet och läs live-regionerna. | [s20-wall-search-empty.png](editor-1/s20-wall-search-empty.png) | Direkt fix: gör foten live, som i Tabell. |
| E-15 | Låg | Kortvägg · sökning utan träff · 1280 | 4.1.2 | ”Fäll ihop hoppspalten” behåller `aria-expanded=true` och `aria-controls="_r_0_"` när hoppspalten inte ritas (axe `aria-valid-attr-value`, critical i axe men liten verkan). | Sök ”xyzqq”. | [s20-wall-search-empty.png](editor-1/s20-wall-search-empty.png) | Direkt fix. |
| E-16 | Låg | Mall · element markerat · 1280 | 4.1.2 | Egenskapernas greppytor (`span.byd-props-grip`, `role=button`, fem per element) är tabbstopp som bara svarar på ←/→ och inte på Enter/Space. Rollen lovar alltså något annat än den gör, och de ger fem extra stopp bredvid fälten som gör samma sak. | Tabba till ”X (mm), dra för att ändra”, tryck Enter: ingenting händer. | [s8-mall-elementfocus.png](editor-1/s8-mall-elementfocus.png) | Direkt fix: `role=slider` med värde, eller `tabindex=-1`. |
| E-17 | Låg | Tabell · kolumndörren öppen · 1280 | 1.3.1 | Knappen ”Kolumner” och hela formuläret ”Nytt fält” (lista, fält, två knappar) ligger inuti `<th>` ”Ta bort”, så de blir del av den kolumnens rubrik. | Öppna + i tabellhuvudet och läs `aria-tabell2-Kolumner.yaml`. | [s13-Kolumner.png](editor-1/s13-Kolumner.png) | Direkt fix: flytta dörren ut ur `th`, t.ex. till en portal. |
| E-18 | Låg | Ram · vila · 1280 | 2.5.3 | ”Vilka som har spelet” visar texten ”L L 2 inne”, men namnet innehåller varken ”2 inne” eller någon synlig text. | `ariaSnapshot` av banner. | [s10-tabell-rest.png](editor-1/s10-tabell-rest.png) | Direkt fix: ta med antalet i namnet. |
| E-19 | Låg | Mall · element markerat · 1280 | 2.5.8 (repots 44 px) | Formknapparna (17 st) är 34×26 och greppytorna 27×24. ”Sätt in en ikon” i Tabell är 26×44. Villkorsflikarna på duken (`.byd-condition-tab`) är 21 px höga, alltså under 24, men de har `tabindex=-1` och en likvärdig kontroll i lagerlistan, så undantaget gäller. Tunna element på duken (typ 16 px, band 5.8 px) räknas som undantag av samma skäl. | `targets()` i `s14.mjs`. | [s8-mall-moving.png](editor-1/s8-mall-moving.png) | Repots 44 px-regel: bedöm formpaletten. Resten är undantag. |
| E-20 | Låg | Mall · element markerat · 1280 | 1.4.11 (information) | Markeringslinjen på duken, `#3c8ce7` mot mallens mörka band `#6b4a2b`, ger **2.31:1**, och mot krämpappret 3.01:1. Tillståndet bärs också av de vita handtagen, så linjen räcker inte ensam men helheten gör det. Det beror på mallen. | Markera title. | [s16-canvas-selected-nofocus.png](editor-1/s16-canvas-selected-nofocus.png) | Ingen åtgärd, eller K16:s två band även för markeringen. |

**Antal:** Hög 1 · Medel 9 · Låg 10.

## Det som fungerade

- axe gav **noll överträdelser** i vila på alla tre flikarna vid 1280 och 1024, med sidhuvudets paneler öppna, med kort markerat, med element markerat och med tabellfilter aktivt. Överträdelserna ovan uppstår bara i särskilda tillstånd.
- Fokusringen i ramen (`outline: 3px #9cc6ff`, offset 2) syns på varje kontroll och ger 8.6–9.9:1 mot alla krom-ytor. Textfält använder en inset-ring i samma färg.
- Fokusringen på duken har två band, en ljus outline och en mörk skugga `#1c1c1c`: 4.52:1 mot mörkt band och cirka 15:1 mot krämpapper, i linje med K16.
- Flikraden följer APG: `role=tablist/tab/tabpanel`, `aria-selected`, pilar med manuell aktivering och Home/End.
- Kronans lådor (Ögon, Guider, Gruppering, Fysisk kontroll) har `aria-expanded`, stängs med Esc och lämnar tillbaka fokus till öppnaren.
- Historiken (`dialog "Historik"`) och delningspanelen flyttar fokus till Stäng och lämnar tillbaka det vid Esc, som L32 kräver.
- ⋯-menyn flyttar fokus till första valet, ”Fler vägar till bordet” stängs med Esc och fokus kommer tillbaka.
- Ingen fokusfälla hittades någonstans.
- Kortväggen är en `listbox` med `option`/`aria-selected` och ett enda tabbstopp. Enter/Space väljer, Esc släpper och Home/End fungerar. Hoppspalten har roving och `aria-current`, och Enter flyttar fokus till gruppens första kort.
- Mallen:
  - Element på duken har namn med läge (”title, text, x 5 mm, y 4.5 mm”).
  - Enter/Space ger flyttläge, där namnet får ”flyttläge” och `aria-pressed`.
  - Pilarna knuffar och läses upp i `status`, och Esc avbryter och återställer med uppläsning.
  - Lagerlistan är ett `grid` med roving, wrap, Home/End och Alt+pil för att flytta.
  - Kortsidan är en `radiogroup` där pilarna byter sida.
  - Gruppmenyn använder `menuitemradio` med pilar, och Esc lämnar tillbaka fokus.
  - Verktygsraden är en `toolbar` med ett tabbstopp.
  - Egenskaperna är namngivna `region`, `spinbutton` och `radiogroup` för placering.
- Tabellen:
  - Tabellen är en riktig `table` med `columnheader`.
  - Sorteringsknapparna sätter `aria-sort` och läser upp ”Sorterad på typ, stigande.”.
  - Filterchipen har `aria-pressed`, och ”X av 77 kort” är live.
  - Enter/↓ och Shift+Enter/↑ går i kolumnen, och cellerna har namn som ”juice-em-up title”.
- Status för sparande (”Sparat”/”Osparat”) är `role=status`.
- `prefers-reduced-motion: reduce` lämnar **ingen** transition, animation eller mjuk rullning kvar på någon av de tre flikarna.
- Vid 1024×768 finns ingen vågrät sidrullning; tabellens breda kolumner rullar inuti sin egen yta.
- Vid 853×533 och 960×540 (150 % zoom) delas Mall upp i flikarna Verktyg, Lager, Duk och Egenskaper, och allt går att nå.
- Kontrollerna i ramen, kronan och tabellen är minst 44×44, eller har en `label` som träffyta runt kryssrutan (L11).

## Det som inte nåddes eller inte testades

- **Ändringar i det delade dokumentet testades inte.** Det gäller att skriva i en cell och sedan bekräfta eller ångra, att lägga till och ta bort rader, att lägga till ett element med Text-, Bild- eller Form-verktyget, att spara med Ctrl/Cmd+S eller Spara, CSV-import, inbjudan, ”Uppdatera bordet” och att ta tillbaka en version i historiken. Allt detta skriver i projektet `lasbarhet`, som andra agenter hade öppet. Tangentvägarna finns i koden (Enter/↓, Esc återställer cellen, Ctrl+Z) men är inte körda här.
- Ett konflikt- eller fel-läge (samtidig redigering, tappad anslutning) gick inte att framkalla utan att störa andra.
- Skärmläsare (VoiceOver/NVDA) kördes inte. Uppläsningarna är lästa ur live-regionernas DOM.
- **Bieffekt som behöver åtgärdas:** under test av lagergridden tryckte jag Enter på låsknappen, och lagret **”om raritet = Karaktär” (`if-karaktar`) i `lasbarhet` är nu låst**. Försöket att låsa upp det nekades av behörighetsspärren. Det behöver låsas upp för hand: Mall → lagerlistan → ”Lås upp om raritet = Karaktär · 10 kort”. Knuffen av `title` (x 5 → 6 mm) avbröts med Esc och återställdes, och ordningsbytet med Alt+↓/↑ återställdes; båda är verifierade.
