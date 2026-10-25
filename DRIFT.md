# Driftbeslut — självhostad på hemmaserver

Status: utkast efter grillningssession 2026-09-06.
Ersätter driftdelen av D2 i [DESIGN-BESLUT.md](DESIGN-BESLUT.md).
Styrande princip: hålla nere löpande kostnad genom att köra så mycket som möjligt på en befintlig Ubuntu-server hemma.

## Förutsättningar

Servern står hemma på bostadsfiber, med dynamisk IP och utan redundant ström.
Den har som mest 4 kärnor och 8 GB RAM.
Den kör redan Docker Compose bakom en reverse proxy.
Utvecklingstid är inte en begränsande faktor, men minne och uppströmsbandbredd är det.

---

## 1. En plattform: lådan, med Cloudflare framför

Allt som kan köra hemma kör hemma, som en Compose-stack.
Cloudflare används bara för det som inte kan bo i huset: DNS, TLS, tunnel, rate limiting, R2.

Följdkrav:
Stacken måste gå att starta om med ett kommando och innehålla allt: aktörsserver, Postgres, renderworker, backupagent, tunnel.
Hårda minnestak per container, eftersom OOM-killern annars väljer offer själv.

### Taken under last (#1012)

Mätt 2026-10-18 med `pnpm --filter @byd/e2e load:memory` (`packages/e2e/load/`), som startar grundstacken med lådans egna `mem_limit` under ett eget projektnamn och läser varje containers cgroup två gånger i sekunden.
Talet som hålls mot taket är arbetsmängden — `memory.current` utan den inaktiva filcachen, samma tal som `docker stats` visar — och kärnans `memory.events` säger om containern slog i taket eller dödades; en container som kom inom en tiondel av taket räknas inte som att den ryms.
Varje scenario börjar från en tom stack, som efter en deploy.
Scenariot per bord: en designer loggar in med länken ur mejlet, laddar upp bilder och två typsnitt (Liberation, ~400 kB TTF vardera), sparar spelet i 15 versioner och startar ett bord för åtta platser; åtta telefoner, TV:n och en observatör spelar 200 intents på egna WebSockets med blandningar och tillbakaspolningar och hämtar varje textur de visas; samtidigt sparar designern en version som ritar om varje kort och skickar den till bordet.
Maskinen var Docker Desktops VM på en Mac (8 kärnor, 29,6 GB), inte lådan, och stacken körde utan R2: varje bild och textur gick genom app och Postgres, vilket är tyngre för båda än lådan med R2.

| Scenario | app (tak 512 MB) | render (tak 1 500 MB) | postgres (tak 768 MB) |
|---|---|---|---|
| 1 bord, 308 kort på 308 bilder à 250 kB | 512 — i taket 882 gånger, överlevde | 477 | 637 |
| 1 bord, 308 kort på 77 bilder à 250 kB | 512 — i taket 463 gånger, överlevde | 491 | 653 |
| 3 bord, 308 kort på 308 bilder | dog vid bordsstarten (V8-heapen) | 231 | 183 |
| 3 bord, 308 kort på 77 bilder | dog vid bordsstarten | 219 | 111 |
| 1 bord, 77 bilder, app utan tak | 691 | 481 | 644 |
| 3 bord, 308 bilder, app utan tak | 1 693 | 569 | 768 — i taket 61 465 gånger |

Talen är toppar i MiB.
Render ryms med god marginal i alla scenarier: en sida i taget håller, även med tre bord som ritas om samtidigt.
App och Postgres ryms inte: ett bord i betans densitet pressar appen mot taket, och tre bord samtidigt fäller den vid bordsstarten.

Två fel hittades och rättades i samma ändring.
Varje anslutning, kodfråga och bordslista läste hela sessionens lek, alla bilder med, så tio skärmar som anslöt läste den tio gånger och tog både appen och Postgres förbi taket; leken läses nu bara av aktören (`deckOf`).
Och ett bords alla sidor kompilerades innan någon köades, 400 MB sidor på en gång för 308 kort; nu köas varje sida innan nästa kompileras (`queueFaces`).

Det som stod kvar var att sessionens lek bar varje bild som data-URL (§4): JSON upprepade en delad bild per rad, så 308 kort var ~100 MB lek oavsett hur många bilder de delade, och varje sida bar sin bild och båda typsnitten igen in i renderkön.
Att höja taken hade varit att ge stacken ~4,5 GB på en låda som delas med ett trettiotal containrar och redan swappar.

### Efter #1028: tre bord ryms

Beställaren valde 2026-10-18 att sidorna bär asset-hashar och att renderworkern hämtar bytesen själv (§4).
Samma lasttest, samma maskin, samma tak och fortfarande utan R2, körd om samma dag efter ändringen:

| Scenario | app (tak 512 MB) | render (tak 1 500 MB) | postgres (tak 768 MB) |
|---|---|---|---|
| 1 bord, 308 kort på 308 bilder à 250 kB | 158 | 513 | 173 |
| 3 bord, 308 kort på 308 bilder | 189 | 602 | 201 |

Talen är toppar i MiB av arbetsmängden; ingen container kom inom en tiondel av sitt tak med sin arbetsmängd, ingen dödades och ingen startades om.
Appen ligger nära vila (~140 MiB) genom hela speltestet, eftersom ingen bild längre passerar den; den högsta punkten är förberedelsen, när designerna laddar upp bilderna.
Render är den enda som växer med antalet bord, och det med rendering och inte med lekar: en sida i taget, och Chromiums egen cache.
Postgres arbetsmängd är ~200 MiB, men med tre bord nådde containern sitt tak 865 gånger med filcache — sidor ur `render_outputs` och `assets` som kärnan släpper när det behövs; den anonyma delen var 34 MiB.
Det är tryck utan risk, men det säger att Postgres är den som fyller sin ruta först, och i drift går bytesen till R2 och inte genom Postgres.
Med tre bord ritas de 309 texturerna per bord på 113, 227 och 340 sekunder: en worker tar dem i tur och ordning, så det tredje bordet väntar längst.

Workerns hämtning ur objektbutiken prövades samma dag mot MinIO i stället för R2: bilden låg bara i bucketen, workern läste den därifrån och texturen visade den.

### Med klassificeraren igång (#1273)

Samma lasttest kördes 2026-10-25 med screeningen vid uppladdning.
Varje bild designerna laddade upp köade alltså ett `screen`-jobb, och workern laddade lådans klassificerare, två int8-modeller i onnxruntime, mellan texturerna.
Maskinen var densamma, men den var hårt belastad av parallella testkörningar, med en last runt 30–50, så tiderna är långsammare än lådans.

| Scenario | app (tak 512 MB) | render (tak 1 500 MB) | postgres (tak 768 MB) |
|---|---|---|---|
| 1 bord, 308 kort på 308 bilder à 250 kB | 188 | 973 | 182 |
| 3 bord, 308 kort på 308 bilder | 187 | 847 | 207 |

Talen är toppar i MiB av arbetsmängden.
Ingen container kom inom en tiondel av sitt tak, ingen dödades och ingen startades om.
Render bär nu ~250–370 MiB mer än efter #1028, vilket är modellerna och det de rör.
I render-imagen håller de två sessionerna ~255 MiB för sig, utan minnesarena och utan förpackade vikter.
Med arenan växte de med ytterligare ~85 MiB vid de första bilderna.
Det är render som ligger närmast sitt tak nu, med 527 MiB kvar i det tyngsta scenariot.
Ett bord till eller en större modell bör mätas här innan det läggs till.

### AI-frågornas kostnad för lådan (#1007)

Mätt 2026-10-19 med `pnpm --filter @byd/e2e load:ai` (`packages/e2e/load/ai.ts`), som startar appen ur källkoden som containern startar den, mot Postgres, och låter den falska leverantören svara ett ord var 1,5 sekund så att varje svar håller sin anslutning i femton sekunder, som ett riktigt svar gör.
Varje designer har eget konto, egen nyckel och eget spel om 308 kort med femton fält, en hel regelbok och en mall med varianter (`packages/server/scripts/large-deck.ts`); ett scenarios frågor ställs i samma ögonblick.
Maskinen var en Mac och appen en process på den, inte containern på lådan, så vilominnet är högre än lådans (~140 MiB, ovan); det som mäts är vad frågorna lägger till.

| Scenario | appens minne, ökning över vila | uppströms per fråga | uppströms totalt |
|---|---|---|---|
| 1 fråga | +0,1 MiB | 129 KiB | 129 KiB |
| 8 samtidigt (taket) | +0,0 MiB | 129 KiB | 1,0 MiB |
| 8 samtidigt, alla 308 kort valda | +17 MiB | 285 KiB | 2,2 MiB |

En fråga är spelets kontext (96 kB, sammanfattad inom budgeten), förslagets schema (22 kB) och instruktionerna (3 kB); innan kontexten fick en budget skickades leken hel, 173 kB, och samma fråga var ~205 KiB.
Det tyngsta en fråga kan bära är ett urval av hela leken, eftersom valda kort alltid skickas hela och utanför budgeten; det är den tredje raden.
Appens minne rör sig knappt: en fråga håller kontexten och sin begäran, några hundra kilobyte, och resten är en öppen anslutning.
Även det tyngsta fallet, åtta frågor med hela leken vald, är 17 MiB på en container med 512 MB tak, och dess 2,2 MiB uppströms tar under en sekund vid 20 Mbit/s.

Taken står kvar: två svar åt gången per konto, åtta totalt, tre minuter och 1 MiB för en frågas kropp (§8).
Inget av talen säger att åtta hotar minnestaket, så det totala taket sänks inte; det är fortfarande rätt storlek för en handfull designers samtidigt, och det håller uppströms under ett par megabyte även i det tyngsta fallet.
Kroppens tak gäller det klienten skickar, som är frågan, samtalet och urvalets id:n, aldrig kontexten: urvalet av hela den stora leken är 5 kB id:n, och det som ryms upp till taket är samtalets fyrtio turer.

## 2. Exponering: lådans egen omvänd proxy om den har en, annars Cloudflare Tunnel

Ursprungsbeslutet var `cloudflared` i stacken och inga öppna portar mot bostadsnätet; tunneln löser dynamisk IP, TLS och WebSockets.

Reviderat 2026-09-11, vid första produktionssättningen:
Lådan bär redan en traefik med wildcard-cert, en companion som skapar DNS-posten, och en DDNS-agent för den dynamiska IP:n — och 80 och 443 står redan öppna.
Alla fyra skäl bakom tunnelbeslutet var alltså redan lösta på lådan, av något som var där först.
Att lägga en andra ingång bredvid den hade varit en till väg att underhålla för ingenting.

Beslutet är därför villkorat, inte omkullkastat:
En låda som redan har en omvänd proxy lämnar appen till den; en låda som inte har det tar tunneln med sig i stacken.
`docker-compose.traefik.yml` är överlägget för det första fallet och `tunnel`-profilen det andra; grundstacken nämner ingen av dem.

Följdkrav:
Health-endpointen bör kontrollera Postgres och R2, inte bara att processen svarar.
Kedjan framför appen får aldrig vara husets SSO: produkten har egna konton, och en gäst kommer till bordet med en rumskod och inget konto alls (§9, §11).
Den kedja som väljs ska däremot bära rate limiting, som är vad §9 ber om, och proxyn måste lita på Cloudflares vidarebefordrade huvuden för att räkna på rätt avsändare.
Den dagen lådan byts mot en tom är tunneln kvar i stacken och kostar ett `COMPOSE_FILE` att byta till.

Tillagt 2026-10-21 (A5, #1080): när tjänsten flyttar till ett nytt värdnamn svarar det gamla 301 till det nya, med sökväg och query kvar, så att utskickade inloggningslänkar, bokmärken och QR-koder fortsätter att fungera.
Omdirigeringen är proxyns, i överlägget `docker-compose.traefik-moved.yml` med det gamla värdnamnet i `BYD_MOVED_FROM`; appen känner bara ett origin, `PUBLIC_ORIGIN`.
`deploy.test.ts` håller etiketterna och visar att omskrivningen behåller sökväg och query, och samma regex är provad mot traefik v2.11 och v3.3.

### Inaktiva anslutningar: proxyn stänger först (#986)

Appen håller en inaktiv keep-alive-anslutning öppen i 120 s (`KEEP_ALIVE_MS` i `packages/server/src/server.ts`) och väntar på en förfrågans huvuden i 121 s (`HEADERS_TIMEOUT_MS`).
Proxyn närmast appen håller sin inaktiva anslutning till den i 90 s: traefiks `serversTransport.forwardingTimeouts.idleConnTimeout` och cloudflareds `originRequest.keepAliveTimeout` har båda det standardvärdet, och varken stacken eller överlägget sätter något annat.
Nodes eget standardvärde är 5 s.
Med det stängde appen anslutningen medan proxyn fortfarande hade den i sin pool, och en förfrågan som skickades i samma ögonblick gick ut på en stängd socket och kom tillbaka som 502 (samma race som i testfixturerna, #848).
När appen väntar längre än proxyn är det alltid proxyn som släpper först, och den skickar aldrig på en anslutning den redan gett upp.
De 30 sekunderna över 90 är marginal för en proxy som ställts in lite längre än standard.
Huvudtiden ligger strax över, så att en förfrågan som börjar i sista stund på en inaktiv anslutning inte klipps medan huvudena kommer, och under Nodes `requestTimeout` på 300 s.
Cloudflare längst ut talar med proxyn och inte med appen, så dess tider berör inte det här ledet.

Följdkrav:
Den som höjer proxyns tid för inaktiva anslutningar uppströms höjer `KEEP_ALIVE_MS` över den i samma ändring.
WebSockets påverkas inte: en uppgraderad anslutning lämnar HTTP-serverns timers, vilket prövades med timers under en sekund och en WebSocket som stod tyst i fyra.
Dräneringen (§3) väntar inte längre för det: `close` lägger på de inaktiva anslutningarna direkt, och en som fortfarande svarar läggs på så fort svaret är ute.
`packages/server/test/proxy-connection.test.ts` håller tiderna, en anslutning som står tyst förbi Nodes fem sekunder, och nedstängningen.

## 3. Aktörsmodellen utan Durable Objects

En Node-process håller alla aktiva bord och projekt som in-memory-aktörer med en seriell kö per aktör.
Ordningen är oförhandlingsbar: `decide` → skriv `Applied` till Postgres och vänta på commit → `apply` i minnet → skicka patchar.
Ingen klient kan därmed ha sett något som inte överlevt en krasch.
Vid start finns inget i minnet; ett bord laddas genom `replay` när någon ansluter och lossas efter inaktivitet.
SIGTERM dränerar: sluta ta emot intents, vänta ut pågående skrivningar, stäng sockets med återanslutningshint.

Motivering:
Det som gjorde egenbyggd aktör dyr i fråga 16 var placering och överlämning mellan instanser.
På en maskin finns inget att placera.

Följdkrav:
Aktörsvärden är ett gränssnitt; motorn får aldrig känna till processen.
Varje deploy kör `replay` på riktiga loggar, vilket gör händelseschemats bakåtkompatibilitet till ett dagligt krav.

## 4. Postgres hemma, assets i R2

Postgres i en container på lådan.
Uppladdade bilder, texturer och tryckfiler i Cloudflare R2, innehållsadresserade.
Ansiktsanropet går till servern, som kontrollerar synlighet mot aktören och svarar med en kortlivad signerad R2-URL.
Bytesen går aldrig genom bostadsfibern.

Motivering:
En lek är ~120 MB texturer per spelare; uppströmsbandbredden är den knappa riktningen.
R2 har ingen egress-avgift och ligger utanför huset.

Följdkrav:
Klienten måste cacha signerade URL:er under deras livstid, annars blir varje textur två rundturer.
Att visa ett kort kräver att R2 är nåbart — ett externt beroende för kärnfunktion.

Byggt 2026-09-07:
Renderworkern skriver sina utdata till R2 under `renders/<hash>` med rätt content-type; Postgres behåller bara att de finns.
`GET /faces/:hash` svarar 302 till en signerad URL som lever en timme, med `Cache-Control: private, max-age=3000`: webbläsaren återanvänder länken i femtio minuter och hämtar aldrig en som just gått ut. Det är svaret på den öppna frågan om livslängd.
S3-protokollet talas utan SDK: fyra anrop med Signature Version 4, verifierade mot AWS dokumenterade exempel och mot MinIO.
Utan R2-variabler stannar bytesen i Postgres och går genom `app`, som förut; `/health` frågar R2 med en tom listning (§2).

Tre undantag, alla för bytes som webbläsaren måste *läsa* och inte bara visa:
R2:s svar bär inget `access-control-allow-origin`, och en CORS-kontroll gäller varje svar i omdirigeringskedjan, så sådana bytes går genom `GET /assets/:hash/bytes` på lådans eget ursprung.
Mätningen av en bild (#469) läser varje hash en gång under tjänstens livstid, eftersom mätningen lagras.
Ett projekts typsnitt i editorn (#472) laddas med `@font-face`, som alltid hämtar i CORS-läge; det kostar ~50 kB per typsnitt och webbläsare, en gång, eftersom svaret är `immutable`.
Ett projekts symboler i editorn läses på samma sätt, eftersom en färgad ikon (#1087) ritas som `mask-image`, som också hämtar i CORS-läge; omdirigerad till R2 laddades masken aldrig och ikonen blev genomskinlig.
En symbol är några kB och läses en gång per webbläsare.
Beslutat av beställaren 2026-09-27 framför en CORS-regel på bucketen, som ligger utanför repot och måste gälla varje framtida bucket.

Uppladdade bilder (E1) byggt 2026-09-07:
`POST /assets` tar en bild (png, jpeg, webp, gif, svg; högst 8 MB) från en inloggad skapare och svarar med dess sha256-hash; samma bytes ger samma hash och kostar inget andra gången.
Bytesen ligger under `assets/<hash>` i R2 och tabellen `assets` håller hash, typ och storlek; utan R2 ligger bytesen i tabellen.
`GET /assets/<hash>` svarar som `/faces`: 302 till en signerad länk när R2 finns, annars bytesen med oföränderlig cache. Hashen är kapabiliteten, som för ansikten.
~~När ett bord eller ett tryck görs av projektet löses radernas `asset:<hash>` till data-URL:er innan kompileringen, så sessionens lek bär sina bilder som förut och renderworkern behöver inget annat än sidan.~~

Reviderat 2026-10-18 av beställaren (#1028): **sidan namnger sina bilder och typsnitt med hash, och renderworkern hämtar bytesen själv.**
När ett bord, ett tryck eller ett regelhäfte görs av projektet står radernas, mallens, symbolernas, bildernas och typsnittens `asset:<hash>` kvar som de är.
Appen frågar bara vilka av hasharna som finns, i en fråga och utan att läsa en byte; en referens till något som inte finns blir tom, så kortet tappar bilden i stället för att bära en referens ingen kan följa.
Sessionens lek, dess versioner och varje sida i `render_jobs` bär alltså kilobyte i stället för bilderna.
Renderworkern läser bytesen ur samma ställe som appen lade dem — `assets` i Postgres utan R2, `assets/<hash>` i R2 med — genom samma funktion (`assetFromPostgres`), och håller de senast använda i en liten cache per hash (32 MB) så att typsnitten och en delad bild läses en gång.
Workern behöver alltså mer än sidan: den behöver tillgångarna, och den når dem redan för sina utdata.
En hash som workern inte hittar är ett misslyckat jobb med hashen i felet, inte en textur utan bild som sedan sparas för gott under sidans hash.

Motiveringen är lasttestet (§1).
Med bilderna som data-URL:er upprepade JSON en delad bild en gång per rad, så 308 kort var ~100 MB lek i appen och i Postgres oavsett hur många bilder de delade, och varje sida bar sin bild och båda typsnitten igen in i renderkön, ~1,4 MB per sida och ~430 MB per lekversion.
Ett bord i betans densitet höll appen i sitt tak och tre bord fällde den; efter ändringen ryms tre bord (§1).
Det andra alternativet — att leken pekar med hash och appen bäddar in bilden sida för sida när den köar — hade behållit regeln men låtit appen läsa varje bild en gång per bordsstart och `render_jobs` vara lika stor som förut.

Texturhashen bestäms fortfarande av det som ritas: en asset skrivs aldrig om och raderas aldrig, så hashen på sidan avgör bytesen lika säkert som bytesen själva.
Varje textur och tryckfil av ett kort med en uppladdad bild, symbol eller ett uppladdat typsnitt fick en ny hash när sidan bytte form, och renderas om en gång efter deployen, vilket beställaren godtog.
Bord som startades före ändringen har kvar sin lek med data-URL:er och spelar som förut; workern ritar en sida utan hashar precis som den alltid gjort.

Två undantag från «raderas aldrig», beslutade av beställaren 2026-10-24.
Bilder, typsnitt och renderingar efter ett raderat konto, som inget annat spel eller bord nämner, sopas efter 30 dygn (G6, #1269).
Olagligt innehåll som spärrats efter en anmälan rensas ur R2 och Postgres; annat spärrat innehåll står kvar som bytes, och servern, renderaren, trycket och exporten behandlar hashen som om den inte fanns (F4, #1268, fråga 12).
Ingen av dem skriver om en asset, så hashen avgör fortfarande bytesen, och en referens till en hash som inte längre finns blir tom som ovan.
Byggt 2026-10-25 (#1280): när ett konto raderar sig skrivs det dess spel nämner, och de renderingar det burit, upp i `asset_sweeps` med dagen 30 dygn bort, i raderingens transaktion.
Sopningen (`PostgresAssetSweep`, i samma varv som gallringen) tar dem när dagen kommit och inget som finns kvar nämner dem: en bild eller ett typsnitt som inget spel, inget bord vars spel finns och inget väntande jobb nämner raderas ur `assets` och ur R2 under `assets/<hash>`; en rendering som inget annat konto burit raderas ur `render_outputs`, `render_jobs` och R2 under `renders/<hash>`.
En hash som nämns igen är inte längre kontots och lämnas för gott.
Raden går före bytesen, i en transaktion per hash, så att ett R2 som inte svarar lämnar raden till nästa varv.
S3-protokollet har fått sitt femte anrop för det, en `DELETE`.
I minnet sopas ingenting, eftersom ingenting där lever i 30 dygn.

En bilds hash går aldrig till en klient.
Hashen är en kapabilitet (`GET /assets/<hash>`), och på tråden skulle den visa vilket kort som ligger i någon annans hand lika säkert som texturen; projektionen bär texturernas hashar och inget annat.
Det visas på råa frames i `packages/server/test/assets.test.ts`.

## 5. Backup: WAL-arkivering till R2 med återställningstest

pgBackRest eller WAL-G arkiverar varje WAL-segment till en egen R2-bucket inom sekunder.
Nattlig basbackup.
Ett schemalagt skript återställer senaste backupen i en tom container och kör `replay` på ett bord som kontroll.

Motivering:
Förlustfönstret måste vara nära noll så fort någon har betalat.
En backup som aldrig lästs tillbaka är en förhoppning.

Byggt 2026-09-07: WAL-G.
Postgres-bilden (`ops/Dockerfile.postgres`) är fortfarande Alpine — lådans data initierades på musl, och ett libc-byte skulle ändra kollationerna under indexen — med `gcompat` för WAL-G:s binär, låst till version och checksumma.
`archive_command` skickar varje färdigt WAL-segment till R2 inom en minut (`archive_timeout=60`); utan R2-nycklar släpps segmentet och loggen säger det en gång, så att Postgres aldrig samlar WAL i väntan på en bucket som inte finns.
`backup`-containern är samma bild över datavolymen: en basbackup per natt, de senaste `BACKUP_KEEP` behålls med sitt WAL.
`ops/restore-test.sh` hämtar senaste basbackupen och allt WAL efter den till en tom katalog i backup-bilden, startar Postgres där, räknar, och spelar upp den senaste sessionens logg genom motorn i app-bilden.
Bytet av Postgres-bild startar om databasen en gång vid deployen; volymen är densamma.

### Bevarandetiden och raderingarna (#1269)

Beställarens beslut 2026-10-24 (G6, F4): **backuperna sparas i åtta dygn.**
Det är dagens ordning: `BACKUP_KEEP=7` behåller sju nattliga basbackuper med WAL efter den äldsta, så det som raderas i databasen ligger kvar i R2 i högst ungefär åtta dygn och försvinner sedan av sig självt.
Integritetspolicyn säger det, och backuperna används bara för återställning.
Att höja `BACKUP_KEEP` förlänger alltså en lagringstid som policyn lovar, och är ett ändrat beslut och inte en driftinställning.

En återställning till `LATEST` (RUNBOOK §6) tar med raderingarna, eftersom de ligger i WAL.
Det enda som kan väcka en raderad eller maskad uppgift är en återställning till en tidigare punkt.
Därför skrivs varje radering och maskning i en raderingsliggare — vad, vilket id och när, utan personuppgifter — i samma transaktion som raderingen.
Efter en återställning till en tidigare punkt körs liggaren om innan tjänsten släpps på igen, och RUNBOOK säger det i samma steg som återställningen (#1279).
Det följer att liggaren inte får gå förlorad med den punkt som återställs: raderingarna efter den punkten måste gå att läsa.

Byggt 2026-10-25 (#1279): liggaren är tabellen `erasures`, och den skrivs i samma transaktion som maskningen.
En rad säger id, när, vad (`guest`, `table` eller `game`), varför (`request`, `retention` eller `removed`), och bordet, platsen och stunden inträdet gavs, eller spelet; inget namn, ingen adress och ingen token.
Den har inga främmande nycklar, eftersom en rad ska överleva det den nämner och gå att skriva in igen efter en återställning där det den nämner är tillbaka.
Att liggaren inte går förlorad med punkten löses med en kopia: `erase ledger` skriver ut den som JSON-rader innan en återställning, och `erase replay --from <fil>` kör om varje rad i den ordning den gjordes och skriver in de rader som saknas.
Är databasen själv borta tas kopian ur en återställning till `LATEST` i en tillfällig katalog (`ops/restore.sh`), eftersom liggaren ligger i WAL som allt annat.
En körning till ändrar ingenting, så liggaren går att köra om hur många gånger som helst.
Gallringen behöver ingen kopia: sopningen gör den vid varje start, innan dörren öppnas.
Stegen står i RUNBOOK §6.
Sedan #1280 har liggaren ett fjärde slag, `account`, med kontots id i `account_id`: ett konto som raderat sig, och det enda ställe där id:t står kvar.
Körs liggaren om tas kontot först i sin stund, före spelen det tog med sig, så att det dess spel nämnde skrivs upp för sopningen igen.

### Huvudnyckeln för AI-nycklarna (#999)

Designerns egen API-nyckel hos Anthropic eller OpenAI (E4) ligger i tabellen `ai_keys`, krypterad med AES-256-GCM under en huvudnyckel som heter `AI_KEY_SECRET`.
Huvudnyckeln är 32 slumpade byte i base64, gjorda en gång med `openssl rand -base64 32`, och den finns i lådans `.env` och i en lösenordshanterare, ingen annanstans.
Den ligger alltså inte i databasen och därför inte i WAL-arkivet eller basbackuperna i R2: en läckt backup läcker ciffertext, leverantör och fyra tecken per konto, aldrig en nyckel.
Stacken ger den bara till `app`; `postgres`, `backup` och `render` får den aldrig, vilket `packages/server/test/deploy.test.ts` håller.
Krypteringen binder varje rad till sitt konto och sin leverantör, så en rad som flyttas öppnas inte för någon.

Att förlora huvudnyckeln, eller att byta den, är ingen dataförlust.
Varje sparad nyckel läses då som ingen nyckel, profilsidan säger att ingen nyckel finns och designern ombeds ange den igen; inget fel visas och inget annat i tjänsten påverkas.
Saknas variabeln, eller är den inte 32 byte, går ingen nyckel att spara (servern svarar 503 och säger det i startloggen), och utan Postgres gör processen en egen huvudnyckel som dör med den, som minneslagret gör.
Servern loggar aldrig en nyckel; startraden `ai-keys` säger bara om nycklar kan sparas.

Återställningstestet visar det: `ops/restore.sh` skriver ut raderna i `ai_keys` ur den återställda databasen, och `packages/server/scripts/ai-keys-check.ts` öppnar dem med en huvudnyckel som görs för körningen och aldrig är lådans.
Varje nyckel ska läsas som ingen — «ange nyckeln igen» — och testet går rött om en enda öppnas.

## 6. Renderfarm: Postgres-kö, en worker, cache per innehållshash

Jobbtabell i Postgres med `SELECT … FOR UPDATE SKIP LOCKED`.
Två prioriteter: bordstextur före tryck-PDF.
En Chromium-container med en sida i taget och det minnestak §1 ger den — 1,5 GB sedan 2026-09-11.
Sidan namnger sina bilder och typsnitt med hash, och workern läser bytesen själv ur Postgres eller R2 (§4, #1028).
Utdata i R2 under hash av mall, rad, typversion och fontset; ett jobb vars hash redan finns är en no-op.
En partners tryckfil (#1207) har utfallet i den kompilerade sidan och pixlarna och formatet i jobbslaget, så samma kort i två partners krav är två renderingar och i samma krav en.
Screening (F4, #1271) är jobbslaget `screen` och den tredje prioriteten, efter texturer och tryck: ingen väntar på den, och ett bord som läggs väntar aldrig bakom den.
Ett sådant jobb är en sida som namnger en uppladdad bild med sin hash; workern läser bytesen som för ett kort (§4), ritar bilden i Chromium till högst 512 px, svg med i sin egen form, och ger pixlarna till den klassificerare och version jobbet namnger.
Klassificerarna körs alltså i renderworkern, på lådan, och ingen bild lämnar huset (F4, beslut 8).
Det som sparas är ett resultat och inget utdata: en rad per bild, klassificerare och version i `screenings`, med poängen, bildhashen och tidpunkten, och ett andra jobb för samma är en no-op.
En bild som saknas eller inte går att avkoda är ett misslyckat jobb med hashen i felet, inte ett resultat.
Ett screeningjobb skrivs aldrig i `render_log`, så det räknas inte på någon designers renderingar (§12).
Klassificeraren är `vit-nsfw.clip-violence@1` (#1273): två int8-modeller i onnxruntime, en NSFW-ViT och CLIP:s bildkodare, ~89 MB vardera, som hämtas vid bygget av render-imagen till `/app/models` (`BYD_MODELS_DIR`) med kontrollsumma och aldrig ligger i repot.
De laddas första gången workern screenar en bild och blir kvar, med en tråd var, utan minnesarena och utan förpackade vikter; en bild tar ~2 sekunder av en kärna.
Varje ny bild köas vid uppladdningen, och de som fanns före köas en gång med `screening run --alla` (§12).
En reaper återställer jobb vars `started_at` är äldre än en gräns, eftersom Chromium ibland hänger utan att dö.

## 7. Deploy: CI bygger, lådan hämtar

GitHub Actions kör lint, typecheck, tester och replay-korpusen på varje pull request, och bygger de tre bilderna utan att publicera dem.
Reviderat 2026-09-16: bildbygget låg tidigare bara på taggen, och en `Dockerfile` som inte kunde bygga webben stod på trunken i nitton commits utan att någon körning rörde den — det första som märkte det var releasen.
En grön pull request betyder nu att det finns en bild att släppa.
`main` är trunk och kör ingen workflow alls; grinden framför trunken är `.githooks/pre-push`, som kör samma kontroller lokalt och vägrar en push som är smutsig eller ogrön.
En pushad `v*`-tagg bygger images till GHCR taggade med git-SHA och med releasenamnet.
På lådan pollar en liten tjänst registret, kör schemamigrering och `compose up`.
Den kör den nyaste `v*`-taggen som nås från `origin/main`, aldrig trunken i sig: att tagga är att deploya.
CI har ingen väg in i huset.

Migrering är två olika saker:
Databasschema migreras med vanligt verktyg innan appen startar.
Händelseschemat migreras aldrig på disk; varje `Applied` bär `schemaVersion` och motorn har upcasters som lyfter gamla rader vid inläsning.

Ett undantag, beslutat av beställaren 2026-10-24 (#1269, F7, G6): **maskningen av personfälten är den enda skrivning som någonsin rör en befintlig rad i loggen.**
En radering eller en gallring byter `seat.claim.name`, `flag.note`, `flag.observer`, `note.add.text`, `note.edit.text` och platsernas namn i en tillbakaspolnings `outcome.table` mot ett reserverat värde, och rör ingenting annat i raden.
Maskningen är ingen migrering: raden behåller sin `schemaVersion`, och värdet byts mot ett av samma form, så upcasters och uppspelning läser den som förut.
Loggen spelar därefter upp identiskt med avseende på spelet (D4), och fältlistan är densamma som korpusens anonymisering läser (#1276).
Korpusens filer berörs inte: de är redan anonymiserade (#540) och bär inga personuppgifter.
Byggt 2026-10-25 (#1279): maskningen läser raden som den ligger, byter personfälten i dess `intent` med `redactLine` och skriver tillbaka bara `intent`, under bordets skrivlås och i raderingens transaktion; `schema_version`, `outcome` och allt annat står kvar.
Den maskade loggen spelar upp till samma spel och samma vyer, med namnen och texterna maskade (`packages/server/test/erase.test.ts`), och `ops/restore-test.sh` spelar upp den som förut.

Ingen permanent staging på lådan.
Grinden är replay-korpusen i CI: anonymiserade riktiga loggar som måste spela upp identiskt.

Riktiga loggar hämtas ur lådan med `pnpm --filter @byd/engine corpus` och tar bara bord ur spel som kontot äger — utom när ägaren har sagt ja (#1011, beställarens beslut 2026-10-18).
Samtycket ges i inbjudan och inte i produkten: beställaren frågar varje betadesigner när hen bjuds in, och svaret är ett ja i mejlet, som sparas.
Ett ja skrivs in på lådan som kontots adress i `BYD_CORPUS_ACCOUNTS`, kommaseparerat, och operatörens adress står i `BYD_OPERATOR`.
Operatörens kaka i `BYD_COOKIE` får då läsa `GET /sessions/:id/export` för ett bord vars spel ägs av ett samtyckt konto, och ingenting annat: inte enkätsvaren, inte spelet, ingen skrivväg och inget bord i ett annat kontos spel.
Exporten säger då `consented`, och det är det enda skäl utöver ägarskap som skriptet tar ett bord för; anonymiseringen (#540) gäller för deras loggar som för alla andra.
Båda variablerna läses när appen startar, så ett konto som stryks ur listan är stängt efter nästa omstart; utan båda läser inget konto ett annat kontos bord.

## 8. Observabilitet: enbart docker logs

Inget utöver containerloggar med rotation.

Konsekvens att vara medveten om:
Lådan kan inte berätta att den är nere; när fibern ligger är varje övervakning i huset också nere.
Den enda signalen blir en användare som skriver.
En gratis extern pulskoll är tio minuters arbete om det behövs senare, och ändrar inget annat.

Reviderat 2026-10-18, inför betan: **en extern pulskoll läggs till.**
Med riktiga användare är ett avbrott som ingen märker det dyraste läget, och den enda signalen får inte vara en betadesigner som skriver.
En gratis extern tjänst frågar `https://deckster.se/health` med några minuters mellanrum och mejlar beställaren när svaret inte är 200 — `/health` svarar 503 när Postgres eller R2 inte svarar (§2), så samma koll fångar både fibern och stacken.
Kontot i tjänsten är beställarens och ligger utanför repot; ingenting i stacken ändras.
Det är fortfarande den enda övervakningen: inga mätvärden och ingen loggaggregering.

Kompensation som redan finns:
En buggrapport är ett sessions-id och ett seq-nummer; `replay` till den punkten ger exakt det tillstånd användaren såg.

Byggt 2026-09-14:
`/health` namnger releasen den kör, ur samma `BYD_TAG` som `ops/deploy.sh` rullade till.
Utan den frågan var lådan stum om sin egen version, och en deploy gick bara att verifiera genom att fingeravtrycka den JS-bundle den serverar.
Varje svar bär den, 503:orna med: vilken version som är trasig är det första man frågar tillbaka.
Utanför lådan är variabeln osatt, och då säger `/health` ingenting om någon release i stället för att hitta på en.

Byggt 2026-10-06 (#757):
`BYD_CONTACT` är vart en betatestare vänder sig — en e-postadress eller en webbadress — och sätts på lådan, aldrig i koden.
`/health` bär den som `contact` bredvid `release`, inloggningskortet och Mina spel säger den sist som «Kontakt» (en adress med `http(s)://` länkas som den är, allt annat som `mailto:`), och inloggningsmejlets fot säger den.
Är variabeln osatt utelämnas «Kontakt» överallt, och utan `BYD_TAG` utelämnas versionen; utan någon av dem står ingen rad alls.

Byggt 2026-10-18 (#999): en API-nyckel når aldrig `docker logs`.
Nyckelns vägar — spara, pröva, byta modell, ta bort — skriver ingenting till loggen, och ett nej från leverantören är ett ord ur en sluten mängd utan nyckeln i (§5).
`packages/server/test/ai-key-routes.test.ts` läser den faktiska loggutskriften medan nycklar sparas, avvisas och tas bort.

Byggt 2026-10-18 (#1001): editorns frågor till AI:n skriver en rad var i loggen, med fälten `msg: "ai"`, `account`, `provider`, `ms` och `outcome` och inget annat.
Utfallet är `ok`, `cancelled`, `timeout` eller leverantörens ord för nej; nyckeln, spelet, frågan och svaret skrivs aldrig.
Varje svar håller en anslutning till leverantören och spelets kontext i appcontainerns minne (§1), så servern tar två svar åt gången per konto och åtta totalt och avbryter ett svar efter tre minuter.
`packages/server/test/ai-ask.test.ts` läser den faktiska loggutskriften, och `packages/e2e/test/ai-question.spec.ts` läser serverns logg i den byggda stacken.

## 9. Missbruk: Cloudflare rate limiting, korta koder, värdkontroll

Cloudflares rate limiting stoppar brute force mot join-endpointen innan det når huset.
Rumskoder är 6–8 tecken utan förväxlingsbara tecken, går ut efter några timmar utan anslutning, och kan roteras av värden.
Värden kan sparka en gäst, vilket ogiltigförklarar dennes anslutningstoken.

Byggt 2026-09-07:
Koden är sex tecken ur ett alfabet utan I, L, O, 0 och 1, går ut tre timmar efter senaste anslutning och förlängs av varje anslutning; `GET /rooms/:kod` löser upp den.
`POST /rooms/:kod/join` med namn och plats (eller utan plats, för att titta) ger en token; en upptagen plats ger 409. En oanvänd platsreservation löper ut efter två minuter; första WebSocket-anslutningen förlänger token till tre timmar och varje återanslutning förlänger den igen.
WebSocket-anslutningen kräver token för platser och observatörer, värdnyckeln (`host`) för bordets egen vy, eller rollen `lobby`, som ser platserna och inget mer.
Bordets egen vy öppnas också utan värdnyckel för den som får starta projektets bord, via kontokakan från appens egen origin (#748): ägaren som loggar in för att öppna sitt bord ska inte skickas tillbaka till samma stängda dörr.
Editorn kan uttryckligen ansluta bord, plats eller observatör med `owner=1`; servern godtar då bara projektägaren via kontokakan (eller ett öppet projekt när konton är avstängda lokalt).
Allt annat får `refused` och stängs; klienten återansluter aldrig efter det.
Värdnyckeln skapas med sessionen, visas en gång för den som startar bordet och lagras hashad, som tokens.
`POST /sessions/:id/code` roterar koden och `POST /sessions/:id/kick` sparkar en plats: tokens ogiltigförklaras, anslutningarna stängs med `refused: kicked`, platsen släpps. Värdnyckeln som bearer eller ägarens kaka är behörigheten.
Bordsskärmen får koden i ett `room`-meddelande, vid anslutning och vid rotation; gäster får den aldrig.
Projektägarens egen plats eller tittarplats (`owner=1`) får också `room`-meddelandet, så att väntrummet på `/online` kan visa adressen och den nya koden efter «Ny kod» (L77, #1130), men aldrig värdnyckeln: hennes kaka är hennes nyckel.
Rotationen byter också värdnyckeln (#820, beställarens beslut 2026-10-05): en nyckel som läckt tillsammans med koden — en skärmdelning, en vidarebefordrad länk — dras tillbaka med samma «Ny kod», och den gamla öppnar varken bordet eller värdens kontroller efteråt.
Den nya nyckeln står i svaret till den som roterade och i `room`-meddelandet vid rotationen, bara till bordets egna anslutningar, så att en TV som står öppen inte stängs ute av bytet; den sparar nyckeln i fliken och återansluter med den.
Telefoner, observatörer och lobbyn får den aldrig, vilket ett test på de råa ramarna visar.
Det som inte dras tillbaka är en bordsvy som just då står öppen med den läckta nyckeln: den räknas som en av bordets skärmar och får den nya.
Den som vill stänga också den startar ett nytt bord.
Sessioner från före koder saknar kod och nyckel: de kan inte nås med kod eller öppnas som bordet.

Byggt 2026-10-06 (#675, beställarens beslut C): koden är också rummets adress.
`/<KOD>` är appen, i vilken bokstavsstorlek som helst, och landar i platsväljaren; TV:n säger värden ur sitt eget origin, på lådan `PUBLIC_ORIGIN`:s värd.
Sidan på adressen frågar aldrig efter koden: varje kod, känd, okänd eller utgången, får samma bytes, och lagret tillfrågas inte.
Den enda vägen att pröva en kod är därmed fortfarande `GET /rooms/:kod`, som appen frågar precis som `/join?code=` alltid har gjort, så adressen är ingen andra dörr förbi rate limiting ovan, och proxyns gräns gäller hela värden och därmed `/<KOD>` också.
En okänd, en utgången och en roterad kod får samma 404 med samma kropp, och telefonen säger dem likadant: inget avslöjar om en kod en gång funnits.
Ett avslutat bords kod gör det också (#938, beställarens beslut 2026-10-07): förut svarade den 410 med bordets id, vilket sa den som provade koder att just den hade varit verklig.
Dörren är stängd som förut (C9, #485) — `POST /rooms/:kod/join` lämnar ingen token — men den säger det med samma 404 och samma kropp som för en kod som aldrig funnits, och koden prövas före kroppen, så att inte heller en trasig kropp skiljer dem åt.
Den som redan sitter vid bordet får veta att det är slut genom sin egen anslutning, och kontots väg tillbaka (`POST /me/played/:id/return`) svarar fortfarande 410, eftersom den bara når den som satt där.
`GET /rooms/:kod` säger också spelets namn när bordet startades ur ett spel — det `GET /sessions/:id` redan sa till den som har id:t svaret lämnar ut — och aldrig projektet.
Generatorn drar om en kod som stavar ett av appens egna vägord (`ROUTE_WORDS` i `packages/protocol`): `ASSETS` och `GUESTS` är de enda sex tecknen ur alfabetet som redan är en adress.

Byggt 2026-10-23 (#1194): den råa dörren kräver konto.
`POST /sessions` gjorde ett bord av vilken uppsättning och lek som helst, utan inloggning, och köade dess texturer i renderworkern: en väg för vem som helst att lägga Chromium-arbete på lådan, och en väg förbi varje tak på bord och renderingar (DESIGN-BESLUT A2).
Med konton påslagna, vilket lådan alltid har, svarar den 401 utan inloggat konto och skriver ingenting, och med en kaka bärs bordet av det kontot.
Webben startar bord genom `POST /projects/:id/sessions`, som redan krävde en roll i spelet; den råa dörren används bara av E2E-sviten och `seed`-skriptet, som loggar in med `AUTH_BYPASS` först.

Byggt 2026-10-25 (#1278): gästens namn och token står i ingen adress.
Förut var platsen `/play?session=…&seat=…&name=…&token=…`, och claim-länken bar token vidare.
Hennes namn och hennes bärartoken stod då i historiken, i varje omladdning till lådan och som `Referer` på varje anrop, alltså i proxyns och Cloudflares loggar om de loggar adresser.
Nu står bordet, platsen och rumskoden i frågan, och token i fragmentet (`#token=…`), som webbläsaren aldrig skickar i ett anrop eller en `Referer`.
Det gäller `/play`, `/online`, `/observe` och `/claim` (`packages/web/src/guestAddress.ts`).
Rumskoden står kvar i frågan: den är det adressen är till för (K12).
Namnet står ingenstans: servern säger anslutningen namnet på inträdet dess token köptes för, i meddelandet `admitted`, och telefonen sätter sig med det.
Ägarens egen plats och tittarplats från editorn (`owner=1`) har inget inträde; hennes namn står sedan #1306 inte heller i adressen (nedan).
Bordets WebSocket tar token i `Sec-WebSocket-Protocol` och inte i adressen, eftersom uppgraderingen också är ett anrop som en proxy loggar: klienten erbjuder protokollen `deckster` och `deckster.token.<token>`, och servern svarar med `deckster`.
En sida som laddades före ändringen ansluter med `?token=` och släpps fortfarande in, men får inte `admitted`, som dess klient inte känner till.
Inloggningen bär fragmentet vidare: `loginUrl` lägger en `next`s fragment som inloggningssidans eget fragment, sidan lämnar det till kortet, och servern lägger det efter länken i inloggningsmejlet och aldrig i dess fråga.
Webbläsaren behåller fragmentet genom omdirigeringen från `/auth/verify`, som inte anger något eget (RFC 9110 §10.2.2).
Token står därmed i mejlet, som förut, men aldrig i ett anrop.
En gammal länk med `?token=` eller `?name=` fungerar fortfarande: sidan flyttar token till fragmentet, tar bort namnet, gör detsamma med sidan en gammal claim-länk går tillbaka till, och ersätter historikposten med `history.replaceState`, så att den gamla formen inte blir kvar.
Själva den gamla adressen har redan nått lådan när den öppnas; det går inte att göra ogjort, bara att den inte skickas igen.
`packages/e2e/test/guest-address.spec.ts` läser varje anrops adress och `Referer` och varje WebSockets adress genom en plats resa (ansluta, sätta sig, ladda om, spela, enkäten, «Spara till ditt konto», logga in) och en observatörs, och hittar varken namnet eller token, sedan den visat att sökningen hittar namnet i bordets egna ramar.
Värdnyckeln i bordsvyns WebSocket-adress (`?host=`) var inte en gästs och låg utanför detta; den flyttades av #1306 (nedan).

Byggt 2026-10-25 (#1306): värdnyckeln och ägarens namn står i ingen adress.
Bordsskärmen var `/table?session=…&host=<nyckel>`, och bordets WebSocket sa nyckeln i sin adress (`?host=`) vid varje anslutning.
Nyckeln öppnar bordet, roterar koden och sparkar platser, och sidans eget anrop och uppgraderingen bar den till lådan och in i proxyns och Cloudflares loggar, om de loggar adresser; att skärmen tog den ur adressraden vid ankomsten (#758) gjorde inget åt det.
Nu lämnar editorn den i fragmentet, `/table?session=…&mode=tv#host=<nyckel>`, som webbläsaren aldrig skickar i ett anrop eller en `Referer`, och skärmen tar den därifrån, sparar den i fliken och ersätter historikposten som förut (`packages/web/src/table/hostKey.ts`).
Bordets WebSocket tar nyckeln i `Sec-WebSocket-Protocol` som gästens token: klienten erbjuder `deckster` och `deckster.host.<nyckel>`, och servern svarar med `deckster`.
En nyckel som inte kan vara ett protokollnamn erbjuds inte, och dörren säger då att nyckeln behövs, som för en fel nyckel.
Varje klient erbjuder nu `deckster`, med eller utan hemlighet bredvid, och det är så servern vet att klienten känner `admitted`.
Ägarens egen plats från editorn var `/online?…&name=<hennes namn>&owner=1`.
Nu står inget namn i adressen: platsen sätter sig under namnet hon gav i «Hur sitter ni?», som webbläsaren som startade bordet minns per bord (`packages/web/src/hostSeat.ts`), och annars under kontots visningsnamn (#1254), som servern säger hennes anslutning i `admitted` utifrån kontokakan, aldrig utifrån adressen.
Har kontot inget namn heter hon «Designern», och hennes e-postadress sägs aldrig.
Editorns egen WebSocket (`/projects/:id/edit`) bar hennes e-postadress i `?name=`; servern tog redan namnet ur kontot, så editorn säger nu bara ordet för någon där, vilket är allt ett spel från före konton har.
Den gamla formen läses en övergångstid: en sida som laddades före ändringen ansluter med `?host=` och släpps in, och ägarens gamla plats ansluter med `?name=` utan protokoll och får inte `admitted`, som dess klient inte känner till.
En gammal länk med `?host=` eller `?name=` öppnar samma vy, och sidan tar bort dem ur adressen i samma historikpost.
`packages/e2e/test/owner-address.spec.ts` läser varje anrops adress och `Referer` och varje WebSockets adress i editorns, bordsskärmens och platsens flikar, från starten i editorn till en omladdning, och hittar varken nyckeln, hennes namn eller hennes e-postadress, sedan den visat att sökningen hittar nyckeln i fragmentet fliken öppnades med, och namnet och adressen i kontots eget svar och namnet i bordets ramar.
Samma spec visar att en sida från före ändringen ansluter med den gamla formen, och `packages/server/test/owner-address.test.ts` prövar dörren med nyckeln i huvudet och namnet från kontot.

Byggt 2026-10-25 (#1277, DESIGN-BESLUT G6): ett inträde som aldrig öppnades rensas av sveparen när dess två minuter gått, med namnet det köptes under; ett öppnat, ett sparkat och ett claimat inträde står kvar, eftersom de är bordets historik, och tas bara av raderingen (#1279).

## 10. Administration: Tailscale

Lådan och administratörens enheter i samma privata nät.
SSH och Postgres nås på privat IP utan öppna portar.

## 11. Identitet: eget bibliotek, magic link och passkeys, inga lösenord

Auth.js, Lucia eller motsvarande i Node-processen; konton i Postgres.
Inloggning via e-postlänk eller passkey; OAuth mot Google eller Discord som bekvämlighet.
Inga lösenord att läcka.

Följdkrav:
E-postleverantören blir kritisk för inloggning.
Passkey-återställning är UX som måste designas.

Byggt 2026-09-06: eget, litet — inga beroenden.
Tokens och sessions-id:n är slumpade och lagras hashade (`login_tokens`, `auth_sessions`, `accounts`); fem länkar i timmen per adress innanför Cloudflares gräns (§9).
Mejl går genom Resend (`RESEND_API_KEY`, `MAIL_FROM`); utan nyckel hamnar länken i loggen, vilket är utvecklingsläget.
`PUBLIC_ORIGIN` styr vart länkarna pekar och om kakan får `Secure`.
Sedan 2026-10-25 (#1277, DESIGN-BESLUT G6) rensar sveparen i `main.ts`, när appen startar och varje timme, inloggningslänkar som är använda eller har gått ut, kakor som har gått ut, och inbjudningar 30 dygn efter att de använts eller gått ut (`INVITE_KEEP_MS`, som kan korta tiden men aldrig förlänga den); startraden och timraden `swept` säger hur många rader som gick per tabell, aldrig vilka (§8).
En länk behöver ingen rad kvar för sitt svar, eftersom `GET /auth/verify` säger samma sak om en använd, en utgången och en aldrig given länk.

Passkeys byggda 2026-10-23 (#1180, DESIGN-BESLUT L78): en bekvämlighet bredvid länken, aldrig i stället för den, och mejlet är återställningen.
WebAuthn-kontrollerna görs av `@simplewebauthn/server`, som enda undantag från «inga beroenden»: CBOR, COSE och signaturer skrivs inte här.
Den publika nyckeln, räknaren, nyckelringens AAGUID och webbläsaren den sparades från ligger i tabellen `passkeys`; den privata nyckeln lämnar aldrig läsarens enhet.
Passkeyns webbplats är sidan webbläsaren står på, i produktion `deckster.se`; en passkey gjord på ett värdnamn erbjuds aldrig på ett annat.
OAuth återstår.

## 12. Vad som inte bor på lådan

Betalning: Stripe.

Nivåerna och deras tak bor inte heller i koden (#1193, A2, #1192): de är `BYD_PLANS` i lådans `.env`, JSON på en rad inom enkla citattecken, och stacken skickar variabeln till appen.

```sh
BYD_PLANS='{"default":"free","plans":{"free":{"projects":3},"pro":{}}}'
```

Ett tak är ett heltal eller `null`, och `null` är obegränsat; ett mått som en nivå inte nämner är obegränsat på den nivån.
Bordens mått är `openTables`, bord som står samtidigt och som §1:s minnesbudget bär, och `tablesPer30Days`, bord som startats under rullande 30 dygn (#1196); båda prövas bara när ett bord startas, så ett tak stänger aldrig ett bord som står.
Utan variabeln är allt obegränsat, vilket är betans läge och det läge en glömd variabel ger, så att en deploy aldrig av misstag stänger ute en designer.
Variabeln läses en gång när appen startar, som `BYD_CORPUS_ACCOUNTS` (§7), och starten skriver en rad med nivåernas namn, standarden och om något tak alls är satt, aldrig vem som har vilken nivå (§8).
En variabel som inte är giltig JSON eller inte håller schemat stoppar starten, och så gör en nivå som något konto har men som variabeln saknar; loggen säger varför.
Vilken nivå ett konto har står i tabellen `account_plans`, som Stripe skriver till när betalningen kopplas på; ett konto utan rad har standarden.
I dag sätter operatören den över Tailscale (§10), med lådans egen `BYD_PLANS` så att en nivå lådan inte har aldrig skrivs:
`pnpm --filter @byd/server plan set <adress> <nivå>` och `plan clear <adress>`.
`pnpm --filter @byd/server usage` skriver varje kontos nivå, förbrukning och tak, för prisbeslutet, och skickar ingenting någonstans.
Lagring (`storageBytes`, #1197) är det kontots spel nämner i någon version, räknat ur databasen; ett borttaget spel frigör sitt, men bytesen ligger kvar i R2 (§4).
Renderingar (`rendersPer30Days`) läses ur renderköns logg `render_log` i samma databas, så skriptet behöver ingen annan anslutning.

Screeningen (F4, #1271, §6) har två skript av samma slag, som inte heller skickar något någonstans:
`pnpm --filter @byd/server screening run <spel>` köar en screening av varje bild som spelets sparade version namnger, i den klassificerare lådan screenar med nu, och `screening report <tröskel>` skriver hur många bilder den klassificerarversionen har screenat, hur många som misslyckats, och vilka som når tröskeln, en poäng från 0 till 1, i någon kategori, högst först.
Tröskeln ges varje gång och sparas ingenstans, eftersom den är operatörens att pröva mot riktig kortkonst.
Sedan #1273 köar en uppladdning sin bild själv, och `screening run --alla` köar varje bild på lådan som inte redan har ett resultat eller ett jobb, en gång efter deployen.
Rapporten säger också andelen som når tröskeln per kategori och vilka bilder som ligger nära något på referenslistan.
Referenslistan är PDQ-hashar i tabellen `screening_references`, aldrig i repot: `screening reference add <asset> <källa>` listar en bild på lådan med dess screenings hash, till exempel det som tagits ned, `screening reference import <fil> <källa>` läser hashar ur en fil med ett JSON-objekt per rad (`{"bits": "<64 hex>", "quality": …, "source": …}`), och `screening reference list` skriver listan.
Ingen bild hämtas till listan, och ingen kommersiell kortkonst ligger där innan en källa uttryckligen tillåter det.

E-post: Resend, Postmark eller motsvarande — en bostads-IP är i praktiken svartlistad.
POD-partnerns API.
Assets och backup: R2.

Google Fonts-katalogen (#329, L27): **enbart designerns webbläsare når den**, och bara när hon
öppnar väljaren. Servern och renderaren rör aldrig Google — typsnittsfilen laddas upp som projektets
egen asset via `POST /assets`, och renderingen läser den därifrån som vilken uppladdad fil som helst.
Lådan får alltså inget nytt utgående beroende, och ett projekt renderar med utgången blockerad.

Byggt 2026-09-21: familjenamnen reser med webbygget och hämtas inte alls — Googles kataloglistor
svarar utan CORS, och en proxy för dem hade varit exakt det utgående beroendet den här paragrafen
säger nej till. Det webbläsaren hämtar är ansiktena: ett `css2`-ark när väljaren öppnas, och
typsnittsfilen från `fonts.gstatic.com` när en familj väljs.
Speltemas färdiga teman (L57, #632) följer samma regel: fliken öppnas utan Google, ett ark per
familj hämtas när «Visa temana i sina typsnitt» trycks, och filerna när ett tema väljs. Mätt på trafiken i
`packages/e2e/test/surfaces/font-catalog.spec.ts`.

## 13. Komprimering är lådans ansvar, kanten är ett tillägg

Beslutat och byggt 2026-09-21 (#372, mätt i #366).

`app` sätter själv `Content-Encoding` på det den serverar statiskt: brotli till den som tar det, gzip till övriga, oförändrade byte till den som inte ber om något.
Komprimeringen reser därmed med bygget och gäller även utan Cloudflare — lokal drift, en direktexponerad port, en ändrad kantinställning.
Kanten får gärna fortsätta komprimera ovanpå; poängen är att produkten inte längre vilar på att den gör det.

Skälet är en mätning, inte en princip: det blockerande CSS-arket serverat okomprimerat kostar +2 692 ms på förstamålningen (Slow 4G, 4× CPU) mot 2 104 ms som det är — trettiofem gånger vad det skulle kosta att fördubbla hela CSS-budgeten, och den största enskilda posten i förstamålningens pris.
Fram till nu satte ingenting i repot rubriken alls.

Två avvägningar, båda om att lådan är en delad maskin med fyra kärnor och ett minnestak på 512 MB för `app` (§1):

Varje fil komprimeras **en gång per bygge, inte en gång per förfrågan** — den byggda webben är oföränderlig under imagens livstid, så `vite build` skriver `app.css.br` och `app.css.gz` bredvid filen (`precompress` i `packages/server/src/compress.ts`), och lådan strömmar den kopian från disk.
Lådan lägger alltså varken CPU eller minne på det, och det är enda skälet till att brotlis dyraste nivå är försvarbar.
En kopia som är äldre än sin fil används inte, eftersom den är en kopia av filen som låg där före.

Ändrat 2026-10-23 (#1087): fram till dess komprimerade lådan själv varje fil första gången någon bad om den och sparade svaret.
Det höll så länge webben var under en megabyte text.
Game-icons-chunken är 6,4 MB, och brotlis dyraste nivå över den tar 14 s på en ledig Mac och 72 s på en belastad maskin.
Första designern efter en deploy väntade så länge med ikonarket öppet, och alla som frågade under tiden väntade på samma svar.
Det lådan inte fått färdigt — en fil som skrivits under en körande server, sidan som servern själv skriver (#1084), en körning utan bygge — komprimeras fortfarande en gång och sparas, utanför händelseloopen, så den förfrågan som betalar för det håller inte upp ett bords patchar.

**Dynamiska svar komprimeras inte.** De är kilobyte JSON, de skiljer sig åt mellan förfrågningar, och att komprimera dem vore precis den CPU per förfrågan som cachen ovan finns till för att slippa.
Redan komprimerade byte — texturer, ikoner, en woff2 som någon gång hamnar bredvid appen — rörs inte heller, och filer under ett paket lämnas i fred eftersom rubriken kostar mer än vinsten.

Följdkrav:
Grinden läser `Content-Encoding` på det blockerande arket mot en riktigt serverad instans, aldrig mot en påhittad förfrågan: `packages/e2e/test/surfaces/blocking-sheet-encoding.spec.ts`, som också väger byten på tråden och avkodar dem tillbaka mot filen på disk.
Samma fil håller att byggets största skript skickas som kopian bredvid det på disk, i båda kodningarna.
Bortfallet går rött, inte tyst grönt — varje väg till att inte mäta något (inget ark i dokumentet, ingen instans som svarar, ingen rubrik) är skriven som ett fel med en mening om vilken det var.
En proxy framför lådan måste respektera `Vary: Accept-Encoding`, som svaren bär.

Sidan är den enda fil som inte serveras som den ligger på disk (#1084).
En förhandsvisare vill ha `og:image` som absolut adress, och appen känner sitt origin bara ur `PUBLIC_ORIGIN` (A5).
`index.html` namnger därför bilden med sin sökväg, och servern skriver `PUBLIC_ORIGIN` framför när sidan går ut (`packages/server/src/share.ts`).
Det är en gång per fil på disk och origin, inte en gång per förfrågan, så den komprimerade kopian görs fortfarande en gång per deploy.
Förfrågans `Host` används aldrig: det är vad klienten sa, och en förhandsvisare sparar det den fick höra.
Utan `PUBLIC_ORIGIN` står sökvägen kvar som bygget skrev den.
Bara bildernas meta-taggar ändras, så inline-skripten som §14 hashar är orörda.

## 14. Innehållspolicyn (CSP) sätts av appen

Byggt 2026-10-19 (#1008).

`app` skickar själv en verkställd `Content-Security-Policy` med varje HTML-svar från den byggda webben.
Policyn reser därmed med bygget, som komprimeringen i §13: den gäller på lådan bakom sin proxy, i E2E-stacken och på en port som öppnats direkt, och vilar inte på att något framför lådan minns den.
Den skrivs i `packages/server/src/csp.ts`.

Skälet är kontots kaka och designernas opublicerade spel.
AI-nyckeln når aldrig webbläsaren (§5), men ett inskjutet skript på sidan kan ändå göra allt den inloggade designern kan, och editorn visar alltmer text som någon annan — en medspelare, en modell — har skrivit.
Policyn är ett lager under React, inte i stället för det: ett `<img onerror=…>` i ett korts text eller ett skript från en främmande adress körs inte även om något annat har släppt in det.

Policyn, direktiv för direktiv:

- `default-src 'self'` — det som inte nämns nedan (manifestet, ramar, workers, media) får bara komma från appens eget origin.
- `script-src 'self' 'sha256-…' 'nonce-…'` — appens egna chunkar och de tre inline-skripten i `index.html` (skalets språk och dess ifyllning från #749, förladdningen från #760), godkända med sina hashar, och en nonce per svar för det skript Cloudflare lägger in i sidan (nedan, #1043).
  Inget `'unsafe-inline'`, inget `'unsafe-eval'`.
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — `'unsafe-inline'` eftersom React skriver `style=`-attribut, kortförhandsvisningen sätter det kompilerade kortets ark som `<style>` i sin skuggrot och kortets markup bär egna `style=`; inget av det finns vid bygget, så det finns inget att hasha.
  En stil kan inte köra kod.
  Googles `css2`-ark är typsnittsväljarens prover (§12).
- `font-src 'self' data: https://fonts.gstatic.com` — filtens typsnitt reser i arket som data-URL (#95), projektets typsnitt kommer från `/assets/<hash>/bytes` (§4), och katalogens filer från Google när väljaren är öppen (§12).
- `img-src 'self' data: <objektlagret>` — bilder och texturer omdirigeras till R2 (§4); data: är QR-koden, symbolerna, temarutorna och en bild som visas innan den laddats upp.
- `connect-src 'self' ws(s)://<värden> https://fonts.googleapis.com https://fonts.gstatic.com <objektlagret>` — API:t och bordets WebSocket på eget origin, katalogens ark och fil när en familj väljs, och objektlagret för det som hämtas genom en omdirigering dit.
  WebSocket-adressen står utskriven eftersom äldre Safari inte räknar `ws:` som `'self'`; den byggs av förfrågans `Host` och schemat proxyn anger (`X-Forwarded-Proto`), och ett `Host` som inte är ett värdnamn lämnas utanför i stället för att skrivas in i rubriken.
- `object-src 'none'`, `base-uri 'none'`, `form-action 'self'` — inga insticksprogram, ingen `<base>` som flyttar relativa adresser, inga formulär som postar någon annanstans.
- `frame-ancestors 'none'` — ingenting i produkten bäddas in i en annan sida, och ingen annan sida får rama in appen.

Objektlagrets origin läses ur samma konfiguration som omdirigeringarna (`R2_ENDPOINT`, annars kontots R2-adress), aldrig hårdkodat; utan R2 nämns det inte alls.

Inline-skripten godkänns med hash och inte med nonce.
Servern läser hasharna ur exakt den fil den skickar, en gång per ändring på disken, så de kan inte glida isär från sidan vad bygget än lägger i den härnäst.
En nonce på appens egna skript hade krävt att sidan skrevs om vid varje förfrågan, och då hade den förkomprimerade kopian i §13 inte längre varit samma bytes som svaret.

Kanten lägger däremot in ett eget skript i varje sida: Cloudflares JavaScript Detections, ett inline-skript som laddar `/cdn-cgi/challenge-platform/scripts/jsd/main.js` och vars bytes är olika vid varje förfrågan (#1043).
Ingen hash i bygget kan nämna det, och under Bot Fight Mode går detekteringen inte att stänga av.
Cloudflare läser i stället svarets CSP-rubrik och sätter dess nonce på skriptet det lägger in; det fungerar bara med en rubrik, inte med en `<meta>`.
Servern skriver därför en ny nonce, 128 slumpade bitar, i rubriken på varje HTML-svar (`pageNonce` i `csp.ts`).
Den står bara i rubriken och aldrig i sidan, så sidans bytes och den förkomprimerade kopian är desamma som förut, och det finns inget i dokumentet för ett inskjutet skript att läsa av.
Skriptet det laddar ligger på eget origin och släpps in av `'self'`.

zod provar en gång om den får kompilera en snabbväg med `new Function`.
Den fångar felet och går vidare, men webbläsaren har redan rapporterat försöket som ett brott mot policyn, på varje sida; webben sätter därför `jitless` innan något tolkas (`packages/web/src/no-eval.ts`).
I webbläsaren är svaret nej oavsett, så inget blir långsammare.

En uppladdad bild som serveras från appens eget origin — utan R2 (§4) — får en egen policy, `default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox`.
En SVG som öppnas på sin egen adress är annars ett dokument på appens origin, och sidans policy släpper in `'self'`.

`?server=<api>` är utvecklingsläget med Vite på en port och API:t på en annan, och där skickar Vite sidan utan policy.
I produktion stoppar `connect-src` en sådan länk som pekar ut appen mot en annan server, vilket är avsikten.

Det sviten hittade när policyn slogs på, och vad som gjordes:

- zod:s `new Function`-prov på varje sida, ovan.
- Skalets omladdningsknapp (#749) bar `onclick="location.reload()"` i markupen och var död under policyn; lyssnaren sätts nu av skalets eget skript, som är godkänt med sin hash.
- «Öppna häftet» (#678) frågade om häftet var klart genom att följa omdirigeringen till R2, som svarar utan CORS, så länken kom aldrig på lådan.
  Det var inget policyfel utan ett produktionsfel som syntes först när stacken fick ett objektlager; nu räcker omdirigeringen själv som svar.
- Två specar hämtade sina egna data-URL:er eller spelade R2 med en påhittad adress; de läser nu sina bytes utan att ansluta, och använder stackens objektlager.

Byggt 2026-10-25 (#1278): varje HTML-svar bär också `Referrer-Policy: strict-origin` (`REFERRER_POLICY` i `csp.ts`), satt på samma ställe som policyn.
En sida säger då bara sitt origin som `Referer`, aldrig sökvägen eller frågan, till lådan, till objektlagrets signerade länkar och till Googles typsnitt, och ingenting alls från https till http.
Bordets och platsens id i en telefons adress följer därmed inte med något anrop.
Värdnyckeln står sedan #1306 i bordsskärmens fragment och aldrig i dess fråga (§9), så den följer inte heller med något anrop; policyn hade redan hållit den ur `Referer`, men inte ur sidans egen begäran.
Som policyn reser huvudet med bygget och vilar inte på proxyn; `packages/server/test/guest-address.test.ts` kräver det på sidorna och E2E-resan i `guest-address.spec.ts` läser det på svaret, och resan i `owner-address.spec.ts` läser varje `Referer` från editorn, bordsskärmen och ägarens plats.
Lådans middleware får gärna strama åt det (`no-referrer`) men inte lätta på det.

Följdkrav:
**Lådans egna middleware får inte skicka en andra CSP.**
Två policyer gäller båda samtidigt, så en till kan bara strama åt, och en som inte känner till hasharna stänger av skalet.
`chain-no-auth@file` ligger utanför repot och ska hållas fri från `Content-Security-Policy`.
E2E-sviten kör den byggda appen med policyn påslagen och med ett objektlager på ett eget origin bredvid stacken (`packages/e2e/support/objects.ts`), som svarar utan CORS precis som R2, så att produktionsvägen med 302 till R2 är den som testas; `packages/e2e/test/csp-bucket.spec.ts` visar att en bild verkligen hämtas därifrån.
Varje spec körs genom svitens egen `test` (`packages/e2e/support/test.ts`), som fäller den spec där policyn vägrade något, och lint förbjuder Playwrights bara `test` i specarna.
`packages/e2e/test/csp.spec.ts` visar att ett inskjutet externt skript och ett inline-attribut vägras, och att ett skript som en kant lägger in med rubrikens nonce körs; `packages/server/test/csp.test.ts` kräver varje direktiv i rubriken och en ny nonce på varje sida.
En ny källa — ett nytt CDN, en inbäddning, en tredje part — är en ändring här och i `csp.ts`, med motivering.

---

## Compose-stacken i ett stycke

`app` — Node, aktörer, WebSockets, HTTP, auth.
`postgres` — domändata, händelselogg, jobbkö.
`render` — Chromium-worker, minnestak ~2 GB, en sida i taget.
`backup` — WAL-arkivering till R2, nattlig basbackup, schemalagt återställningstest.
`cloudflared` — tunnel.
`updater` — pollar GHCR och rullar nya images.

Minnesbudget, reviderad 2026-09-11 vid första produktionssättningen:
`render` 1,5 GB, `postgres` 768 MB, `app` 512 MB, `backup` 256 MB, `cloudflared` 128 MB.

Den ursprungliga budgeten — `render` 2 GB, `postgres` 1–1,5 GB, `app` 0,5–1 GB — räknade med hela lådans 8 GB.
Lådan är inte vår ensam: den bär redan ett trettiotal containrar bakom sin egen reverse proxy, tog 3,5 GB av 7,9 och hade 2,9 GB i swap innan något av det här startades.
Att behålla den gamla budgeten hade varit att låta OOM-killern välja mellan vår Chromium och husets Plex, vilket är precis vad taken finns för att slippa.
De tre som alltid är uppe ryms nu under 3 GB tillsammans, vilket är den andel av lådan stacken gör anspråk på.
`packages/server/test/deploy.test.ts` är där siffrorna står skrivna som ett krav; de kan inte glida isär tyst.

Följdkrav:
Ett tryckjobb som behöver mer än 1,5 GB dör av sitt eget tak i stället för att ta huset med sig, och det ska synas som ett misslyckat jobb i kön, inte som tystnad.
Den dagen tjänsten får riktiga användare är en egen låda — eller en tömd — det första som ska omprövas.

---

## Byggt 2026-09-06

Stacken finns som `docker-compose.yml` med `postgres`, `app`, `render`, samt `cloudflared` och `backup` bakom profiler som slås på av `.env`.
Minnestak per container och loggrotation enligt §1 och §8.
`app` serverar den byggda webben från samma origin (`STATIC_DIR`), och `/health` svarar 503 om Postgres inte svarar (§2).
Appen kör `tsx` mot källorna, som workern; arbetsytans paket exporterar TypeScript och en separat dist-kodväg vore en andra sanning.
Deploy är pull-baserad (§7): `ops/deploy.sh` via en systemd-timer hämtar taggar, rullar till den nyaste `v*`-taggen som nås från `origin/main`, drar CI:s bilder från GHCR för det SHA:t (eller bygger på lådan utan registry), kör `compose up` och väntar på `/health`.
CI (`.github/workflows/ci.yml`) kör lint, typecheck och alla tester mot Postgres och Chromium på varje pull request, med replay-korpusen i `corpus/` som grind, och bygger bilderna till GHCR när en `v*`-tagg pushas.
Trunken har ingen CI framför sig; `.githooks/pre-push` kör samma grindar lokalt innan något når `main`.
Korpusen anonymiserar både människorna och spelet (#540, beställarens beslut 2026-09-28), eftersom repot är publikt och en riktig logg bär designerns opublicerade spel.
Människorna: gästernas namn blir `Spelare N`, flaggornas kommentarer `(kommentar)`, observatörernas namn `Observatör` och anteckningsblockets rader `(anteckning)`.
Vilka fält det är står på ett ställe sedan 2026-10-25 (#1276): `PERSONAL_FIELDS` i `packages/protocol`, som `anonymise` går igenom i stället för att räkna upp verben, så att ett personfält som läggs till i protokollet anonymiseras samma dag som det listas.
Ett test i protokollet går igenom varje fält i varje intent och utfall som kan bära text och faller för ett som varken är listat där eller uttryckligen sagt inte vara en persons (`IMPERSONAL_FIELDS`), och ett test i servern gör detsamma för varje kolumn i de två schemana.
`redactLine` och `redactLog` i motorn maskar samma fält till ett reserverat värde, `REDACTED`, utan att spelet ändras; det är den maskning som G6 (F7, väg A) tillåter som §7:s enda undantag, och att skriva den i lagret är #1279.
Spelet: kortens id blir `kort-N` i den ordning de först förekommer, kortens kolumner blir `fält-N` och deras innehåll `värde-N` (kolumn för kolumn, så att en fråga till korten hittar samma kort), och zonernas, genvägarnas och åtgärdernas text blir `Zon N`, `Genväg N` och `Åtgärd N`.
Zonernas id står kvar, eftersom intents och motorn pekar på dem och editorn ger dem generiska namn.
Tidsstämplarna står kvar som de loggades.
Spelets anonymisering går igenom hela posten, också en tillbakaspolnings lagrade bord; det bordet är zoner och komponenter och bär inga platser och inga namn, vilket motorns `redact.test.ts` håller.
`pnpm --filter @byd/engine corpus <namn> <https://…/sessions/:id/export>` lägger till en riktig logg, med ägarens kaka i `BYD_COOKIE`, och tar bara bord ur spel som kontot äger tills villkoren säger något annat.
Exporten och enkätsvaren (`GET /sessions/:id/surveys`) lämnas bara till ett konto som projektet låter öppna sina bord som värd, eftersom loggen bär varje hand, gästernas namn och flaggornas text; skriptet tar kontots kaka i `BYD_COOKIE`.
Undantaget med samtycke, och hur det blir en behörighet på lådan, står i §7 (#1011).
Händelseschemats `schemaVersion` och upcasters (§7) byggda 2026-09-07: varje ny rad bär `SCHEMA_VERSION`, rader utan fält är version 0, motorn lyfter dem steg för steg vid inläsning (`liftLine`), Postgres skriver versionen i `schema_version` och lämnar gamla rader orörda, och korpusens filer ligger kvar som de spelades in medan grinden lyfter dem.
Backup (§5) byggd 2026-09-07 med WAL-G, se §5; den nattliga `pg_dump`-dumpen är ersatt.
Assets i R2 (§4) byggt 2026-09-07, se §4.
Administration över Tailscale (§10) är lådans sak; Postgres lyssnar bara på 127.0.0.1.

## Öppna frågor

Hur replay-korpusen anonymiseras utan att förlora det som gör den värdefull.
UPS för lådan — billig, men inte beslutad.
~~Om en extern pulskoll ska läggas till trots beslut 8.~~ Besvarad 2026-10-18: ja, inför betan, se §8.
