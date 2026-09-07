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

## 2. Exponering: Cloudflare Tunnel

`cloudflared` i stacken; inga öppna portar mot bostadsnätet.
Tunneln löser dynamisk IP, TLS och WebSockets.

Följdkrav:
Health-endpointen bör kontrollera Postgres och R2, inte bara att processen svarar.

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
En Chromium-container med minnestak runt 2 GB och en sida i taget.
Utdata i R2 under hash av mall, rad, typversion och fontset; ett jobb vars hash redan finns är en no-op.
En reaper återställer jobb vars `started_at` är äldre än en gräns, eftersom Chromium ibland hänger utan att dö.

## 7. Deploy: CI bygger, lådan hämtar

GitHub Actions kör lint, typecheck, tester och replay-korpusen, och bygger images till GHCR taggade med git-SHA.
På lådan pollar en liten tjänst registret, kör schemamigrering och `compose up`.
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

## 9. Missbruk: Cloudflare rate limiting, korta koder, värdkontroll

Cloudflares rate limiting stoppar brute force mot join-endpointen innan det når huset.
Rumskoder är 6–8 tecken utan förväxlingsbara tecken, går ut efter några timmar utan anslutning, och kan roteras av värden.
Värden kan sparka en gäst, vilket ogiltigförklarar dennes anslutningstoken.

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

---

## Compose-stacken i ett stycke

`app` — Node, aktörer, WebSockets, HTTP, auth.
`postgres` — domändata, händelselogg, jobbkö.
`render` — Chromium-worker, minnestak ~2 GB, en sida i taget.
`backup` — WAL-arkivering till R2, nattlig basbackup, schemalagt återställningstest.
`cloudflared` — tunnel.
`updater` — pollar GHCR och rullar nya images.

Minnesbudget på 8 GB, ungefärlig:
`render` 2 GB, `postgres` 1–1,5 GB, `app` 0,5–1 GB, övrigt 0,5 GB, resten till OS och sidcache.

---

## Byggt 2026-09-06

Stacken finns som `docker-compose.yml` med `postgres`, `app`, `render`, samt `cloudflared` och `backup` bakom profiler som slås på av `.env`.
Minnestak per container och loggrotation enligt §1 och §8.
`app` serverar den byggda webben från samma origin (`STATIC_DIR`), och `/health` svarar 503 om Postgres inte svarar (§2).
Appen kör `tsx` mot källorna, som workern; arbetsytans paket exporterar TypeScript och en separat dist-kodväg vore en andra sanning.
Deploy är pull-baserad (§7): `ops/deploy.sh` via en systemd-timer hämtar `origin/main`, drar CI:s bilder från GHCR för det SHA:t (eller bygger på lådan utan registry), kör `compose up` och väntar på `/health`.
CI (`.github/workflows/ci.yml`) kör lint, typecheck och alla tester mot Postgres och Chromium, med replay-korpusen i `corpus/` som grind, och bygger bilderna till GHCR på `main`.
Korpusen anonymiserar namn, kommentarer och observatörer men behåller kortens id:n; `GET /sessions/:id/export` och `pnpm --filter @byd/engine corpus` lägger till riktiga loggar.
Händelseschemats `schemaVersion` och upcasters (§7) återstår; tills vidare är grinden att varje rad i korpusen parsas av dagens schema.
Backup (§5) byggd 2026-09-07 med WAL-G, se §5; den nattliga `pg_dump`-dumpen är ersatt.
Assets i R2 (§4) byggt 2026-09-07, se §4.
Administration över Tailscale (§10) är lådans sak; Postgres lyssnar bara på 127.0.0.1.

## Öppna frågor

Hur replay-korpusen anonymiseras utan att förlora det som gör den värdefull.
UPS för lådan — billig, men inte beslutad.
Om en extern pulskoll ska läggas till trots beslut 8.
