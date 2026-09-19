# Flytten av webbsvitens webbläsartester

Fyrtionio filer i `packages/web/test` startar en Chromium genom `playwright`-biblioteket inifrån
vitest.
De flyttar hit, till `@playwright/test`, så att repot har en webbläsarkörare och inte två.
Tre är flyttade; det här är mönstret de andra följer, och felen som redan är betalda för.

## Vad filerna faktiskt är

De är inte E2E-tester, och det är hela poängen med att läsa dem innan man flyttar dem.

**Tio är rena.** De bygger en bit markup, klistrar in några stilark ur `src/` och mäter resultatet
i en riktig motor.
De mäter alltså *källorna*, inte det som byggs.

**Några av dem är hybrider ändå.** `renderToStaticMarkup` är också att rendera React i Node, och
den importen är lätt att missa när man letar efter `@testing-library/react`.
Sök på båda.

**Trettionio är hybrider.** De renderar React i jsdom — med en riktig server i samma process och
riktiga socketar — lyfter ut `outerHTML`, och lämnar den markupen till Chromium med apptens CSS
runt sig.
De mäter alltså en *ögonblicksbild* av appen, inte appen.

Ingen av de två formerna går att översätta rad för rad, eftersom det inte finns någon jsdom här.
Båda skrivs om, och båda blir starkare av det: här står stacken redan, så samma fakta går att mäta
på den byggda appen medan den kör.

## Två mönster

### Markup som ställs i den byggda appen

För ett tillstånd som är verkligt men omständligt att ta sig till — en ring som pulsar medan någon
pekar, glöden på ett kort någon nyss flyttade, en textur som inte landat.

```ts
import { inject, standing } from '../../support/surface.js'

await standing(page, MARKUP)                                     // '/' och entréns ark
await standing(page, MARKUP, { at: '/editor', needs: EDITOR })   // editorns egen chunk (#186)
await inject(page, ANNAN_MARKUP)                                 // samma sida, nästa uppställning
```

`needs` är hur ett chunkat ark väntas in: `{ on: '.byd-editor', token: '--byd-editor-primary-mark' }`
är arket självt som svarar, i stället för en gissning om hur lång tid det tar.
Utan den mäts markupen mot entréns ark i glappet, och det ser inte ut som ett fel — det ser ut som
en regel som saknas.
`inject` är för en fil som ställer samma yta i många uppställningar: rutten en gång, markupen
trettiotvå gånger.

`standing` navigerar till den riktiga rutten först och skriver markupen i appens egen `#root`.
Skillnaden mot den gamla formen är vilket ark som svarar: det byggda, inte det i `src/`.
Det är precis den skillnad som #95 och #186 båda handlade om, och ingen av dem syntes för något som
klistrade in sitt eget ark.
Listan på filer att klistra in försvinner på köpet — en regel som flyttar mellan två ark krävde
förut att testet ändrades.

### Den levande rutten

För allt som går att komma till som en människa kommer till det.
Hybriderna hör nästan alltid hit: det de byggde upp i jsdom går nu att ställa i ordning över API:et
och sedan öppna.

```ts
await logIn(page.request)                       // AUTH_BYPASS, egen adress per test
await makeProject(page.request, { name: 'Skogens herrar' })
await page.goto('/')
```

`support/api.ts` har vägarna in: `makeTable`, `join`, `logIn`, `makeProject`.
`support/test.ts` har fixturerna: `table`, `player`, `open`, `host`, `tableOf`.

## Fel som redan är betalda för

**Språket följer webbläsaren.** jsdom ber inte om något språk, och en yta som monteras utan får
katalogens eget — svenska (A4).
En riktig webbläsare ber om maskinens, så samma test i Chromium läser en engelsk sida och hittar
inte `E-post`.
En träffyta är ett mått på ett ord, så språket är en del av fakta: sätt `locale` och säg varför.

```ts
test.use({ viewport: { width: 390, height: 844 }, locale: 'sv-SE' })
```

**Budgetgrindarna behövs inte här.** `browser-suite-budget.test.ts` och `jsdom-suite-budget.test.ts`
finns för att vitest ger varje krok tio sekunder och varje test fem, och för att ingen av de
siffrorna är mätt mot en maskin som gör något annat samtidigt (#92, #122).
Playwright har en tidsbudget i konfigurationen i stället för en per krok, så en flyttad fil ska
inte ha med sig sina `60_000` — de blir en siffra på fel ställe.
När den sista chromium-filen är flyttad faller `browser-suite-budget.test.ts` bort med den.

**Kortets identitet är `cardRef`, och den matchas som hel JSON-sträng.** `kort-1` finns i varje ram
som nämner `kort-12`, så en rak delsträngssökning hittar läckor som inte finns.
`mentions()` i `support/frames.ts` gör det rätt.

**En socket som ska dö måste dödas på riktigt.** `context.setOffline` stoppar nya anrop och låter en
öppen WebSocket leva vidare, så klienten märker ingenting.
`support/line.ts` proxar socketen och stänger den under sidan i stället.

**Vänta på villkoret, inte på millisekunder.** Det mesta här är ett varv till servern och tillbaka:
`waitForURL`, `expect.poll` och `wire.until` finns för det.

## Bygget finns redan

`felt-font` och `felt-refit` byggde appen själva för att läsa de byggda filerna respektive öppna
riktiga rutter — sexhundra sekunders budget bara för bygget, och en statisk server var.
Stacken bygger appen en gång för hela körningen och serverar den från den riktiga servern, så båda
blev nästan bara borttagning: `process.env['BYD_E2E_WEB_DIST']` är var bygget ligger, och
`baseURL` är var det svarar.
`felt-font` gick från 600 sekunders budget till 3,9 sekunder.

## Ett värde som ändrar sig är ett fynd

`online-layout` mätte «filtvyn på en telefon» vid 375 × 812.
Sedan #99 (C2:s revidering 2026-09-16) får ett fönster med kortsidan under 600 inget bord alls —
`/online` lämnar över spelarens egen yta i stället — så vid 375 finns ingen `.byd-online-me` att
mäta, och har inte funnits på två dagar.
Att montera komponenterna direkt kunde inte se det: testet ritade en rad rutten aldrig hade ritat.

Det är hela skillnaden mellan de två formerna, och den kommer att dyka upp fler gånger.
När ett flyttat test inte hittar det den gamla filen mätte: kontrollera först att produkten
fortfarande ritar det, innan selektorn lagas.

## Det som står kvar

Fyrtio filer: `editor-css` av de rena, `playtest-textures` som specialfall, och trettioåtta
hybrider från de minsta mot de största.

`playtest-textures` är fallet som inte går rakt av: den handlar om riktiga texturer, och
stacken här har ingen renderare (`DESIGN-BESLUT.md` E2, DRIFT §6).
Antingen får stacken en renderworker, eller så får testet en ritad textur att mäta på — och vilket
det blir är ett beslut och inte en detalj.
`felt-font` är ett specialfall: den bygger appen själv för att läsa de byggda filerna, och stacken
här bygger den redan — den flytten ska läsa `.stack/web` i stället för att bygga en gång till.

De största — `button-language` (1 255 rader), `data-table-widths` (995), `table-layout` (823) — bär
mätvärden ur fattade beslut (K18, K20, L13).
De flyttas inte snabbt, och ett värde som ändrar sig när det mäts på den levande appen i stället
för på en ögonblicksbild är ett fynd som hör hemma i ett issue, inte en siffra att skriva om.
