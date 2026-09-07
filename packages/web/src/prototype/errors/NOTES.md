# PROTOTYP — en familj av fel-, tom- och anslutningslägen (#12, #7)

Fråga: är ett saknat projekt, en tappad WebSocket och ett avvisat drag tre saker eller en?

De två issuena beskriver samma yta från var sitt håll.
\#12 kommer från rutterna: ogiltigt projekt ger tom vit sida med rå engelsk feltext, saknad session fastnar i laddning, alla rutter delar titeln `build-your-deck`.
\#7 kommer från realtiden: en trasig WebSocket visar `Ansluter…` i all evighet, och återanslutning, gammalt tillstånd och avvisade intents saknar återkoppling.
Prototypen svarar på båda med en familj, inte med två.

Kör: `pnpm --filter @byd/web dev` → http://localhost:5175/prototype/errors?variant=A

- `?variant=A|B|C` väljer variant, piltangenterna byter.
- `?vy=bord|telefon|editor` väljer vilken route lägena landar på.
- `?läge=…` väljer läge; remsan högst upp är prototypens egen och finns inte i produkten.
- `?alla=1` ger en kontaktkarta med alla nio lägen samtidigt.
- `?bare` döljer variantväljaren.

## De nio lägena

Laddar, laddar länge, 404 saknas, 401/403 stängt, nät-/serverfel, ansluter, tappad anslutning, återansluten, avvisad handling.

Tre av dem — tappad, återansluten och avvisad — inträffar ovanpå en vy som redan håller data.
De sex andra inträffar i stället för en.
Den skillnaden är den enda som varianterna egentligen tvistar om.

## Varianterna

**A — Helsidesbesked.**
En enda komponent, en enda formulering, alla rutter.
Allt som blockerar tar hela vyn; det som inte blockerar (återansluten, avvisad) blir en rad högst upp.
Återhämtning är en knapp och bara en knapp, med en synlig försöksräknare och meningen "sidan laddas inte om, vi frågar bara servern en gång till".
Tappad anslutning tar bort bordet från skärmen helt, vilket är den starkaste möjliga garantin att gammal data inte ser aktuell ut — och priset är att fyra personer runt ett bord förlorar bilden av vad de höll på med för att nätet blinkade.
Ett avvisat drag hamnar högst upp i dokumentet, långt från knappen som orsakade det.

**B — En statusremsa som alltid finns.**
Remsan ligger i trädet från start och är tom när ingenting är fel; varje läge renderas in i den.
Ingenting tar någonsin över vyn.
Det som inte går att lita på bakom remsan tonas ned och tas ur tabbordningen med `inert`.
Återhämtning är automatisk: 2, 4 och 8 sekunder med synlig nedräkning, sedan stannar den och väntar på en människa.
Styrkan är att det finns exakt ett ställe att titta på, och att en nedräkning gör det synligt att något försöker — i stället för en sida som blinkar av skäl ingen ser.
Svagheten syns direkt i kontaktkartan: ett 404 genom en remsa lämnar en route-chrome kvar som säger "Rum 4KJ2 · 4 spelare" om ett rum som inte finns, och en remsa går inte att läsa från en soffa på tre meters håll.

**C — Varje route svarar i sin egen form.**
Samma nio lägen, men varje route bestämmer var beskedet står och säger det med sina egna ord.
Finns ingenting bakom värt att behålla tar beskedet hela vyn, formulerat för routen: "Vi hittar inte spelet" i editorn, "Rummet är slut" på bordet, "Rummet finns inte — läs QR-koden på TV:n igen" på telefonen.
Finns data bakom lägger sig beskedet där routen har plats för det: ett kort mitt på filten som rummet kan läsa på avstånd, en sheet under tummen på telefonen, en rad i editorns chrome där spar-statusen redan bor.
Ett avvisat drag står inline vid kontrollen som avvisades, med `aria-describedby` från knappen och en ram runt den.
Återhämtning är både och: transporten försöker själv med nedräkning, medan allt en människa måste besluta får en knapp — ett 404 som görs om är fortfarande ett 404.
Priset är fler formuleringar att hålla i sär och en verklig risk att rutterna glider isär i ton om ingen vaktar dem.

## Fynd under bygget

- Klienten har redan vokabulären: `ClientStatus` är `connecting | open | reconnecting | closed`, och `dropped()` backar av med 500 ms som fördubblas upp till tio gånger. Det som saknas är inte en modell utan att statusen når skärmen — i dag renderar `TablePage`, `PlayerPage`, `JoinPage`, `OnlinePage` och `ObserverPage` var sin `<p data-status={status}>Ansluter…</p>` och slutar där.
- Det finns ingen initial timeout någonstans. `connecting` kan stå kvar hur länge som helst, vilket är precis felet i #7. "Laddar länge" måste vara ett eget läge med en egen tidsgräns, inte en känsla.
- `TableClient.send` svarar redan `{ ok: false, reason }` vid `not connected`, `connection lost` och serverns `reject`. Ingen vy läser det. Det avvisade läget behöver ingen ny protokollyta, bara en väg från `SendResult` till kontrollen som skickade.
- Polite kontra assertive är en riktig skillnad här, inte en formalitet. Assertive används bara när det som står på skärmen har slutat vara sant (tappad anslutning) eller när något någon bad om inte hände (avvisad, 404, 401/403). Laddar, ansluter och återansluten är polite. Båda regionerna ligger i trädet från start och tomma, av samma skäl som `TextureFailures` gör det: en live-region som skapas tillsammans med sin text är en region ingen lyssnade på.
- När ett läge tar hela vyn flyttas fokus till rubriken (`tabIndex={-1}`). Utan det står tangentbordsläsaren kvar i ett dokument som inte längre innehåller det hon läste.
- Återförsök får aldrig bli `location.reload()`. Prototypen kör om anropet på plats, räknar försöken och slutar efter tre. Det är hela skillnaden mellan att återhämta sig och att börja om — och det som hindrar en omladdningsloop.
- Reduced motion: `a11y.css` stillar redan varje animation, vilket skulle lämna en ring som står still och låtsas snurra. Ringen byts därför mot en ärligt statisk streckad ring, och väntan bärs av orden och av nedräkningen, som byter värde i stället för att röra sig. Verifierat i Chromium med `reducedMotion: 'reduce'`.
- Paletten är appens egen (player.css-grund, editor.css warn/lost-par) och varje färgpar är kontrollmätt med repots `contrastRatio` mot 4.5:1; kanterna mot 3:1. Alla kontroller är minst 44 × 44 px. Implementationen ska bära den mätningen som ett test, på samma sätt som `editor-contrast.test.ts` gör.

## Dokumenttitlar — ren fakta för #12

Så här är det i dag: ingenting i koden skriver `document.title`.
Enda titeln i produkten är den statiska raden i `packages/web/index.html`: `<title>build-your-deck</title>`.
`App.tsx` rutar på `location.pathname` utan router, så det finns inget ställe som äger titeln.
Notera också att okänd sökväg faller igenom till `HomePage` — det finns alltså ingen 404-route alls i dag, vilket #12:s "404" behöver innan den kan visas.

Föreslaget mönster: `<sidans namn> · build-your-deck`, med `·` som redan är appens avskiljare.

| Route | Titel |
| --- | --- |
| `/` | `Mina spel · build-your-deck` |
| `/login` | `Logga in · build-your-deck` |
| `/new` | `Nytt spel · build-your-deck` |
| `/editor` | `<spelets namn> · Editor · build-your-deck` |
| `/table` | `Bordet · Rum <kod> · build-your-deck` |
| `/join` | `Gå med i rum <kod> · build-your-deck` |
| `/play` | `Din hand · Rum <kod> · build-your-deck` |
| `/online` | `Spela · Rum <kod> · build-your-deck` |
| `/observe` | `Tittar på rum <kod> · build-your-deck` |
| okänd sökväg | `Sidan finns inte · build-your-deck` |

Titeln ska följa läget, inte bara routen, så att en flik i bakgrunden säger sanningen:

| Läge | Titel |
| --- | --- |
| laddar / laddar länge | `Laddar · build-your-deck` |
| 404 på `/editor` | `Spelet finns inte · build-your-deck` |
| 404 på en session | `Rummet finns inte · build-your-deck` |
| 401/403 | `Ingen tillgång · build-your-deck` |
| nät-/serverfel | `Ingen kontakt · build-your-deck` |
| ansluter | `Ansluter · build-your-deck` |
| tappad anslutning | `Frånkopplad · build-your-deck` |
| återansluten / avvisad | routens egen titel, oförändrad |

Namnet ligger först eftersom en flik klipps från höger.
Titeln är inte ett meddelande: den som behöver ordet "fel" ska få det i vyn och i live-regionen, inte i fliken.

## Rekommendation

**C, med A:s helsida som C:s eget svar när ingenting finns bakom.**

Skälen, i ordning:

Ett bord på en TV och en telefon i en hand är inte samma yta, och att låtsas det är vad som gör A och B fel var för sig.
A:s helsida är rätt när det inte finns någon vy kvar att skydda — ett projekt som inte finns har ingenting bakom sig — och det är precis vad C använder den till.
A:s helsida är fel när fyra personer mitt i ett spel tappar nätet i två sekunder, eftersom den då river ner bordet för att sedan sätta upp det igen.
B:s remsa är rätt för editorn, som redan har en chrome-rad där spar-status bor, och C använder den där.
B:s remsa är fel för ett rum som ska läsas på avstånd, och den är fel för ett 404 där resten av skärmen blir en kuliss av ett rum som inte finns.

Det som ska vara gemensamt är inte formen utan modellen: nio lägen, en ton per läge, en regel för polite/assertive, en regel för återförsök och en enda plats som äger dem.
Rutterna väljer placering och formulering ur den; de hittar inte på egna lägen.

Konkret till implementation:

1. Ett läge-objekt (`tone`, `rubrik`, `text`, `åtgärder`, `live`, `retryable`) och en basuppsättning som varje route får skriva över — inte ärva bort.
2. Transporten försöker själv: 2, 4, 8 sekunder med synlig nedräkning, sedan manuellt. Aldrig `location.reload()`.
3. En initial timeout på anslutningen, som gör `ansluter` till `laddar länge` och sedan till `nätfel`.
4. Gammal data tonas och tas ur tabbordningen med `inert` så länge den inte kan lita på; kvar syns tidpunkten den är från.
5. `SendResult` når kontrollen som skickade: inline, `role="alert"`, `aria-describedby` från knappen.
6. Titeln sätts på ett ställe, av routen, med lägets överskrivning enligt tabellen ovan.

## Frågor till beställaren

1. Klockslaget i "Det du ser är från 14:32" — ska det vara en absolut tid eller "för 40 sekunder sedan"? Absolut tid är entydig men läses sämre i ett spel som pågår.
2. Vid tappad anslutning på bordet: ska bordet frysas synligt (som nu) eller ska korten tas bort helt tills snapshoten är tillbaka? Prototypen visar det frysta, men det är ett spelbeslut, inte ett UI-beslut.
3. Skiljer vi 401 och 403 i orden? Prototypen slår ihop dem till "Du har inte tillgång" med både "Logga in" och "Till mina spel", eftersom en gäst sällan vet vilket av det som gäller.
4. "Lämna bordet" vid tappad anslutning — finns den vägen ut alls i produkten, eller är det bara TV:n som kan avsluta ett rum?
5. Ska en observatör (C8) få samma ord som en spelare, eller ska "din tur" och "din plats" bytas mot något som inte antyder en plats?

## Svar

