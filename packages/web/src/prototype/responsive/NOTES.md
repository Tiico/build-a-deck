# PROTOTYP — vad en verktygstät yta ger upp när rummet tar slut (#4, #5, #6)

Tre issues, en fråga.
`/new`, `/editor` och `/observe` går sönder på små skärmar av samma skäl: de är byggda för en bredd och har inget svar på att inte få den.
Frågan är inte vilken brytpunkt utan **vad ytan ger upp** när den inte ryms.

Kör: `pnpm --filter @byd/web dev` → `http://localhost:5175/prototype/responsive?variant=A&yta=editor`
Ytan väljs i remsan högst upp (`yta=wizard|editor|observe`), varianten med pilarna eller `?variant=A|B|C`.
`?bare` tar bort variantväljaren. Bredden i px står till höger i remsan.

Kortet ritas av den riktiga `CardPreview` och bordet av den riktiga `TableRenderer`.
En renderare ritar ett kort och en renderare ritar ett bord (K9, E2), och en prototyp får inte grena en andra.
Allt annat — leken, tabellen, flödet — är fixturer; ingenting är kopplat till en server.

## Vad som faktiskt är sönder idag

Mätt i Chromium på den körande tjänsten, inte läst ur issuetexten.
`docScrollW` är dokumentets bredd; är den större än viewporten scrollar hela sidan i sidled.

### `/editor` — värst, och värre än issue #5 säger

| Bredd | docScrollW | Vad som ligger utanför |
| --- | --- | --- |
| 390 | **893** | Flikarna `Mall`/`Tabell`/`Bord` (406–585), `Spara` (612–679), `Uppdatera bordet` (691–832), `▾` (845–877) |
| 768 | **893** | `Uppdatera bordet` halvt utanför, `▾` (845–877) helt |
| 1024 | 1024 | — |

Vid 390 px är alltså **hela högerhalvan av headern oåtkomlig**: spara går inte, uppdatera bordet går inte.
Kortväggens rutnät är 893 px brett oavsett viewport och sätter golvet.

Mallvyn har ett eget golv: `div.byd-canvas client=893 scroll=900`.
`grid-template-columns: 68px 220px 1fr 280px` i `editor.css`, och **noll `@media` i hela filen**.
Vid 800 px ligger `aside.byd-canvas-props` (Egenskaper) på 620–900, alltså 100 px utanför skärmen.
Grupptabbarna från #13 radbryter sina etiketter till två och tre rader, och fram/baksideväxeln trycks ner på en egen rad utan sin högerkant.

Datatabellen vid 390: 236 träffytor under 44 px och samma 893-px-overflow; radens `×`-knapp är det som ligger längst till höger och alltså det som försvinner först.

Träffytor i editorn vid varje bredd: flikarna 27 px höga, `Spara` 33, `Uppdatera bordet` 33, `▾` 32×34, länken `Mina spel` 60×16.

### `/observe` — issue #6 stämmer ordagrant

Vid 390: `main client=50` — bordet får **50 px** av 390, resten tar aktivitetskolumnen.
`[data-tv] { grid-template-columns: 1fr 340px }` i `table.css`, utan brytpunkt.
Handkorten ritas på negativa x (`i.byd-hand-card [-41..22]`), alltså utanför skärmen.
`.byd-observer-banner` är `position: fixed; top: 84px; z-index: 6` och ligger ovanpå både bordet och rubriken `INSPEKTERA` — även vid 768 och 1280.
`⚑ Flagga` är 85×31.

### `/new` — inte längre det issue #4 beskriver

Wizarden har redan brytpunkter vid 900 och 620 px och **ingen horisontell overflow** vid 390, 768 eller 1024.
Skärmbilden i issuet är från före den omgången. Det som faktiskt är kvar:

- **27 träffytor under 44 px vid varje bredd**: spelarantalet 34×34, `×` på varje fält 30×32, fältnamnen 36–37 px höga, ramknapparna 30 px.
- Vid 390 är sidan **2251 px hög** i ett svep, och `Startram` ligger drygt 700 px från förhandsvisningen den ändrar. Man kan inte se vad man gör.
- Vid 1024 klipps förhandsvisningen: `div.byd-wizard-preview client=211 scroll=282` — kortet får inte plats i sin egen spalt.

Före-bilder: `/tmp/byd-shots/resp-before-<route>-<bredd>.png`, plus `resp-before-editor-mall-*` och `resp-before-editor-tabell-*`.

## De tre svaren

De skiljer sig inte i bredd utan i **hur ytan ger vika**: krympa, lägga på höjden, eller dela i tid.

### A — Allt ryms

Ingenting göms, ingenting kallas fram, ingenting ligger på något annat.
Ytan radas om till en spalt och krymper.

- **Editorn**: headern radbryter till så många rader som den behöver (fyra vid 390). Mallens fyra paneler blir en enda scroll: verktyg → duk → lager → egenskaper, i den ordningen, alla monterade.
- **Wizarden**: en spalt, och förhandsvisningen är `sticky` överst i scrollen — kortet lämnar aldrig skärmen medan fälten under den skrivs i. Det är A:s svar på 2251-px-problemet.
- **Observatören**: bordet överst med minst 46vh, sedan `Senast`, sedan `Platser`, i samma scroll. Observatörsstatusen är en rad i layouten, inte en banner.

Vinst: inga nya widgets, ingen modalitet, ingen ny fokusregel. DOM-ordning = läsordning. Enklast att bygga och svårast att göra fel.
Pris: allt blir litet och långt. Vid 390 tar editorns header ~200 px innan något arbete syns, och lagerlistan ligger under duken — man scrollar mellan det man drar i och siffrorna man skriver.

### B — Ark på begäran

En arbetsyta fyller skärmen. Allt annat kallas fram: ett ark underifrån på telefonen, en låda från höger på surfplattan, en dockad panel på skrivbordet. Samma komponenter, olika inramning.

- **Editorn**: duken är hela skärmen. `Verktyg`, `Lager` och `Egenskaper` är tre knappar i en rad längst ner som öppnar var sitt ark. Sekundära åtgärder ligger under `⋯`; `Uppdatera bordet` står kvar i headern.
- **Wizarden**: formuläret är ytan, i full bredd. Kortet är en docka längst ner med en miniatyr och `Visa stort`, som öppnar det i ett ark.
- **Observatören**: bordet är hela skärmen. En 44-px-list längst ner bär `Eva tittar på`, `Senast ▲` och `⚑ Flagga`; arket med flöde, platser och hela observatörsmeningen öppnas bara när någon ber om det, och ligger då under bordet, aldrig över det.

Vinst: arbetsytan är alltid så stor som skärmen. Vid 390 får duken 100 % av bredden och ~640 px höjd, mot A:s ~56vh. Samma mentala modell vid alla bredder — panelerna är dockade eller framkallade, aldrig borta.
Pris: **samtidighet**. Man kan inte se lagerlistan och egenskaperna samtidigt, och dra-sedan-finjustera blir öppna–stäng–öppna. En dialog till att sköta. Observatörsstatusen kortas till `Eva tittar på`; hela meningen ligger ett tryck bort.

### C — Etapper

Ytan delas i namngivna etapper man går mellan, en i taget. Ingenting ligger någonsin ovanpå något annat.

- **Editorn**: under 1024 px blir mallens fyra paneler fyra egna etapper i **samma platta lista** som lägena: `Kortvägg · Verktyg · Lager · Duk · Egenskaper · Tabell · Bord`. Ingen flikrad inuti en flikrad. Listan ligger längst ner, i tumräckhåll, och `Spara` och `Uppdatera bordet` är fastnitade till höger i samma list så de aldrig scrollar bort. Vid 1024 och uppåt monteras skrivbordet i stället: fyra kolumner, lägena tillbaka i headern, etapplisten borta.
- **Wizarden**: tre riktiga steg — `1 · Spelet`, `2 · Fälten`, `3 · Korten` — med `Föregående`/`Nästa`. Förhandsvisningen äger toppen av sitt eget steg i full bredd.
- **Observatören**: `Bordet · Senast · Platser`. Bordet får hela ytan mellan statusraden och etapplisten.

Vinst: ingen överlappning, ingen modalitet, ingen fokusfälla — mönstret är repots eget (ARIA-tablist med roving tabindex), så tangentbordsmodellen är redan beslutad. Varje etapp är formgiven för den bredd den körs på. Wizardens 2251-px-scroll blir tre skärmar med ett mål var.
Pris: **mest resa**, och en trång list. Vid 390 px tar det fastnitade paret `Spara` + `Uppdatera bordet` omkring 200 px av 390, så de sju etapperna delar på resten och scrollar. Sju etapper på en telefon är mycket. Man ser aldrig två saker samtidigt — värre än B, för i B kan man åtminstone lägga ett ark över det man tittar på och jämföra i minnet över en sekund. Att dra ett element på duken och sedan ändra dess X i mm är två etappbyten.

### Detsamma i alla tre

Datatabellen. Det finns bara ett ärligt svar på en bred tabell på en smal skärm: tabellen scrollar i sin egen box, sidan gör det aldrig, och kolumnen som tar bort en rad är fastnitad till höger så den inte kan scrollas bort. Det är inte ett variantval.

## Tangentbordet

Kraven från #11, #18 och #13 gäller alla tre; verifierat i Chromium (`sheet`/`roving` i körningen nedan).

- Varje `tablist`, `listbox`, `toolbar` och `radiogroup` är **ett** tabstopp med pilarna inuti — mätt: exakt en `tabindex="0"` per grupp i alla tre varianterna.
- **A** lägger inte till någon widget alls. Ordningen i DOM är läsordningen. Enda tillägget: flikremsor som scrollar i sidled drar den fokuserade fliken in i vy (`scrollIntoView({ block: 'nearest', inline: 'nearest' })`), annars flyttar roving tabindex fokus till något ingen ser.
- **B** har en widget: arket. Det är `role="dialog" aria-modal="true"`, tar fokus när det öppnas, håller tabbringen inne **medan det är öppet**, stängs med Escape och lämnar tillbaka fokus till knappen som öppnade det (`aria-expanded` på knappen). Det är en dialog, inte en fälla: det finns alltid en väg ut och den är Escape. Mätt: 25 Tab i rad lämnade aldrig dialogen, Escape stängde, fokus landade på `Lager`.
- **C** har ingen ny widget. Etapplisten är samma tablist som lägena, bara platt, och panelerna är `role="tabpanel" tabIndex={0}`. Under 1024 px monteras etapperna och **inte** skrivbordet; över 1024 tvärtom — aldrig båda, för två kopior av samma panel vore två av varje widget och två av varje element-id i ett dokument.

## Grindarna

- **44 px**: `--tap: 44px` i `proto.css`, satt på varje knapp, flik, fält och listrad. Mätt vid 390, 768 och 1280 i alla nio kombinationer: **noll** träffytor under 44 px. Idag: 27 på `/new`, 8–236 i editorn, 1 på `/observe`.
- **Horisontell overflow**: `docScrollW === viewport` i alla nio kombinationer vid 390, 768 och 1280. Det som ligger utanför är bara innehåll i remsor som är avsiktligt sidscrollande (grupptabbar, etapplist) — sidan själv scrollar aldrig.
- **Kontrast**: varje text i prototypens krom klarar AA. **Fynd på vägen:** editorns primärblå `#3c8ce7` ger vit text **3.44:1** — under AA för allt under 24 px. Prototypen använder samma blå nedtonad till `#1f6fd0` (4.95:1). Det är ett fynd för den riktiga editorn, inte ett variantval. (Kontrollen flaggar också tre texter *inne på kortet* — de ritas av mallen mot en syskonform, inte mot en bakgrund, så mätaren hittar fel underlag. Falskt utslag.)
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` nollar varje `transition` och `animation` i prototypen. Bara arket animerar över huvud taget.
- **Bordet**: `/observe` ritas av `TableRenderer` i `mode="tv"` (K9). Ingen andra väg att rita ett bord finns i prototypen.

## Två fynd om renderaren, som ingen krom kan lösa

Båda syns i mätningen av dagens `/observe` och gäller oavsett vilken variant som väljs.

1. **Handviftarna ritas i fasta pixlar.** `.byd-hand-fan > i` är 54×75 px med 26 px mellan korten, oberoende av bordets skala. På en ram smalare än ~700 px är händerna bredare än bordet och hänger utanför båda kanterna — det är de negativa x-positionerna som mätningen visar vid både 390 och 768.
2. **Passningen räknar inte med händerna.** `TableRenderer` passar in *golvet* i sin ram och ritar sedan händerna utanför golvet, så ett bord som passats kant i kant alltid klipper sina egna händer.

Prototypen skalar ner viftarna och lämnar luft runt ramen så att de tre observatörsvarianterna kan bedömas på sin krom i stället för på samma renderarbugg. Båda raderna är märkta i `proto.css` som fynd, inte fix. Rätt ställe är inne i renderaren.

## Rekommendation

**C för editorn och wizarden, B för observatören.**

Editorn: den har redan flikar, roving tabindex och panelbeslut från #11, #13 och #18. C är den enda varianten som inte lägger till en enda ny interaktionsmodell — den använder den som redan är beslutad, bara plattare. Den ger också duken hela skärmen utan att göra något modalt, och den enda verkliga förlusten — att inte se lagerlistan och duken samtidigt — har man ändå inte på en telefon i A heller, där de ligger 600 px isär i en scroll. Ovanför 1024 är C identisk med editorn som den ska se ut på ett skrivbord.

Wizarden: den har fem steg i namnet och en enda scroll i verkligheten. C gör om det till tre steg med ett mål var, och förhandsvisningen får äga sitt eget steg i stället för att klämmas in i en spalt som klipper den. A:s klistrade förhandsvisning är en bra idé men löser bara halva problemet: `Startram` ligger fortfarande i ett annat kapitel än kortet den ändrar, och i C ligger den i steg 2 där den hör hemma.

Observatören: här vinner B, och tydligt. Observatören tittar — hon arbetar inte. Bordet ska vara hela skärmen och allt annat ska kallas fram. C:s etapplist tar 52 px av bordet i alla lägen för en navigering som nästan aldrig används, och A ger bort halva skärmen till ett flöde som är sekundärt. B:s enda kostnad — att hela observatörsmeningen ligger ett tryck bort — betalas av att `Eva tittar på` med sin prick alltid syns, vilket är vad #6 faktiskt kräver.

Att blanda så här är inte en inkonsekvens: A, B och C är svar på *hur mycket verktyg ytan har*. Editorn och wizarden är verktyg. Observatörens yta är ett bord och lite text.

## Frågor till beställaren

1. **Ska man kunna layouta ett kort på en telefon alls?** Ett fjärde svar som inte byggdes: telefonen får en avsiktligt reducerad editor — kortvägg, tabell, spara, uppdatera bordet — och duken finns bara från 768 px och uppåt, sagt rakt ut i gränssnittet. Det gör telefonytan ärlig i stället för trång, men gör 390 px till en läsyta. Alla tre varianterna här antar motsatsen.
2. **Får `Bord`-fliken och `▾`-menyn hamna bakom en `⋯` på små skärmar (B), eller måste varje åtgärd vara ett tryck bort överallt?**
3. **Renderarfynden ovan** — hör de till dessa tre issues eller ska de bli ett eget, med #6 blockerat på det? Bordet blir läsbart på telefon i alla tre varianterna först när de är lösta.
4. **`#3c8ce7` → `#1f6fd0`** är en ändring av projektets primärfärg, inte bara av editorn. Ska den tas här eller som en egen kontrastgenomgång?

## Svar
