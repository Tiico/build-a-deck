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

Två undantag, båda för bytes som webbläsaren måste *läsa* och inte bara visa:
R2:s svar bär inget `access-control-allow-origin`, och en CORS-kontroll gäller varje svar i omdirigeringskedjan, så sådana bytes går genom `GET /assets/:hash/bytes` på lådans eget ursprung.
Mätningen av en bild (#469) läser varje hash en gång under tjänstens livstid, eftersom mätningen lagras.
Ett projekts typsnitt i editorn (#472) laddas med `@font-face`, som alltid hämtar i CORS-läge; det kostar ~50 kB per typsnitt och webbläsare, en gång, eftersom svaret är `immutable`.
Beslutat av beställaren 2026-09-27 framför en CORS-regel på bucketen, som ligger utanför repot och måste gälla varje framtida bucket.

Uppladdade bilder (E1) byggt 2026-09-07:
`POST /assets` tar en bild (png, jpeg, webp, gif, svg; högst 8 MB) från en inloggad skapare och svarar med dess sha256-hash; samma bytes ger samma hash och kostar inget andra gången.
Bytesen ligger under `assets/<hash>` i R2 och tabellen `assets` håller hash, typ och storlek; utan R2 ligger bytesen i tabellen.
`GET /assets/<hash>` svarar som `/faces`: 302 till en signerad länk när R2 finns, annars bytesen med oföränderlig cache. Hashen är kapabiliteten, som för ansikten.
När ett bord eller ett tryck görs av projektet löses radernas `asset:<hash>` till data-URL:er innan kompileringen, så sessionens lek bär sina bilder som förut och renderworkern behöver inget annat än sidan.

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

## 6. Renderfarm: Postgres-kö, en worker, cache per innehållshash

Jobbtabell i Postgres med `SELECT … FOR UPDATE SKIP LOCKED`.
Två prioriteter: bordstextur före tryck-PDF.
En Chromium-container med en sida i taget och det minnestak §1 ger den — 1,5 GB sedan 2026-09-11.
Utdata i R2 under hash av mall, rad, typversion och fontset; ett jobb vars hash redan finns är en no-op.
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

Ingen permanent staging på lådan.
Grinden är replay-korpusen i CI: anonymiserade riktiga loggar som måste spela upp identiskt.

## 8. Observabilitet: enbart docker logs

Inget utöver containerloggar med rotation.

Konsekvens att vara medveten om:
Lådan kan inte berätta att den är nere; när fibern ligger är varje övervakning i huset också nere.
Den enda signalen blir en användare som skriver.
En gratis extern pulskoll är tio minuters arbete om det behövs senare, och ändrar inget annat.

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
Ett avslutat bord svarar fortfarande 410 (C9, #485), eftersom koden då leder till ett bord som finns men är slut.
`GET /rooms/:kod` säger också spelets namn när bordet startades ur ett spel — det `GET /sessions/:id` redan sa till den som har id:t svaret lämnar ut — och aldrig projektet.
Generatorn drar om en kod som stavar ett av appens egna vägord (`ROUTE_WORDS` i `packages/protocol`): `ASSETS` och `GUESTS` är de enda sex tecknen ur alfabetet som redan är en adress.

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
Passkeys och OAuth återstår.

## 12. Vad som inte bor på lådan

Betalning: Stripe.
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

Varje fil komprimeras **en gång per deploy, inte en gång per förfrågan** — den byggda webben är oföränderlig under imagens livstid, så svaret sparas första gången någon ber om det och varje senare förfrågan är byte som redan ligger i handen.
Löpande CPU är alltså noll, och det är enda skälet till att brotlis dyraste nivå är försvarbar här.
Komprimeringen körs utanför händelseloopen, så den förfrågan som betalar för den håller inte upp ett bords patchar.

**Dynamiska svar komprimeras inte.** De är kilobyte JSON, de skiljer sig åt mellan förfrågningar, och att komprimera dem vore precis den CPU per förfrågan som cachen ovan finns till för att slippa.
Redan komprimerade byte — texturer, ikoner, en woff2 som någon gång hamnar bredvid appen — rörs inte heller, och filer under ett paket lämnas i fred eftersom rubriken kostar mer än vinsten.

Följdkrav:
Grinden läser `Content-Encoding` på det blockerande arket mot en riktigt serverad instans, aldrig mot en påhittad förfrågan: `packages/e2e/test/surfaces/blocking-sheet-encoding.spec.ts`, som också väger byten på tråden och avkodar dem tillbaka mot filen på disk.
Bortfallet går rött, inte tyst grönt — varje väg till att inte mäta något (inget ark i dokumentet, ingen instans som svarar, ingen rubrik) är skriven som ett fel med en mening om vilken det var.
En proxy framför lådan måste respektera `Vary: Accept-Encoding`, som svaren bär.

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
Människorna: gästernas namn blir `Spelare N`, och flaggornas text och observatörerna tas bort.
Spelet: kortens id blir `kort-N` i den ordning de först förekommer, kortens kolumner blir `fält-N` och deras innehåll `värde-N` (kolumn för kolumn, så att en fråga till korten hittar samma kort), och zonernas, genvägarnas och åtgärdernas text blir `Zon N`, `Genväg N` och `Åtgärd N`.
Zonernas id står kvar, eftersom intents och motorn pekar på dem och editorn ger dem generiska namn.
Tidsstämplarna står kvar som de loggades.
Anonymiseringen går igenom hela posten, också en tillbakaspolnings lagrade bord.
`pnpm --filter @byd/engine corpus <namn> <https://…/sessions/:id/export>` lägger till en riktig logg, med ägarens kaka i `BYD_COOKIE`, och tar bara bord ur spel som kontot äger tills villkoren säger något annat.
Exporten och enkätsvaren (`GET /sessions/:id/surveys`) lämnas bara till ett konto som projektet låter öppna sina bord som värd, eftersom loggen bär varje hand, gästernas namn och flaggornas text; skriptet tar kontots kaka i `BYD_COOKIE`.
Händelseschemats `schemaVersion` och upcasters (§7) byggda 2026-09-07: varje ny rad bär `SCHEMA_VERSION`, rader utan fält är version 0, motorn lyfter dem steg för steg vid inläsning (`liftLine`), Postgres skriver versionen i `schema_version` och lämnar gamla rader orörda, och korpusens filer ligger kvar som de spelades in medan grinden lyfter dem.
Backup (§5) byggd 2026-09-07 med WAL-G, se §5; den nattliga `pg_dump`-dumpen är ersatt.
Assets i R2 (§4) byggt 2026-09-07, se §4.
Administration över Tailscale (§10) är lådans sak; Postgres lyssnar bara på 127.0.0.1.

## Öppna frågor

Hur replay-korpusen anonymiseras utan att förlora det som gör den värdefull.
UPS för lådan — billig, men inte beslutad.
Om en extern pulskoll ska läggas till trots beslut 8.
