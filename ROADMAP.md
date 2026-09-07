# Roadmap till release

Status: sammanställd 2026-09-06 ur [DESIGN-BESLUT.md](DESIGN-BESLUT.md), [DRIFT.md](DRIFT.md), [TUNN-SKIVA.md](TUNN-SKIVA.md) och git-loggen.
Det här dokumentet sammanfattar och ordnar besluten; det fattar inga nya.
Ett beslut ändras i sitt eget dokument, och den här roadmapen följer efter.

Läsanvisning:
`✅` betyder byggt och verifierat i tester, `🔶` betyder delvis byggt, `⬜` betyder beslutat men inte påbörjat, `❓` betyder att ett beslut saknas.
Varje rad pekar på det beslut som styr den, till exempel C6 eller DRIFT §5.

---

## Vad release betyder

Produkten är en webbplattform där en speldesigner skapar sitt kortspel, playtestar det digitalt utan regelmotor, och beställer hem det fysiskt (produktdefinitionen).
Första användaren är en semi-pro designer på väg mot förlag eller crowdfunding (A1).

Release är nådd när en sådan designer, utan hjälp av oss, kan:

1. Skapa ett konto, bygga en kortlek i editorn och spara den i en versionerad historik (G1, E1–E6, B4).
2. Playtesta den runt en TV med telefoner som händer, eller helt på distans, med ångra, närvaro, flaggor och enkät (C2–C9, K1–K14, G3).
3. Beställa leken tryckt hos en riktig partner med pris i kassan och få den hem (F1–F3, H1).
4. Betala för en abonnemangsnivå över gratisnivån och exportera allt när som helst (A2, G5).

Och när tjänsten:

5. Kör på lådan bakom Cloudflare med backup som provats tillbaka, assets utanför huset och en CI-grind på riktiga loggar (DRIFT §1–§8).
6. Håller juridiken: villkor, GDPR för gäster, moms och tull för fysiska varor (F4, I).

Sekvensen är fastlagd: allt digitalt före tryck (H3), och den tunna skivan (H1) räknas som klar först när en tryckt lek ligger i brevlådan.

---

## Fas 0 — Grunden: klar

Det här är byggt, testat och committat, i den ordning det kom.

Protokoll och motor:
- ✅ Slutet fysiskt intent-vokabulär, atomiska kuvert, slump som resultat i loggen, deterministisk återspelning (D1, D4, K3, TUNN-SKIVA §2).
- ✅ Zonhärledd synlighet med undantag per komponent, verifierad på råa nätverksframes (B6, TUNN-SKIVA §5).
- ✅ Dynamiska högar, fri placering med zonrektanglar, atomisk batch (K1, K2, K3).
- ✅ Personlig ångra och gruppens tillbakaspolning som återställningsrader i loggen, dolda högar blandas om (C6, K13).
- ✅ Versionsbyte mitt i sessionen: leken följer projektet, korten på bordet ligger kvar (C7, L5).
- ✅ Observatör med full insyn, flaggade ögonblick som loggrader, avslutad session som låst logg (C8, C9, G3).

Server:
- ✅ En aktör per bord i en Node-process, ordningen decide → commit → apply → patchar, drain på SIGTERM (D2, DRIFT §3).
- ✅ Händelselogg och projekt i Postgres eller minne, render-kö i Postgres med SKIP LOCKED, texturer per innehållshash (DRIFT §4, §6).
- ✅ Närvaro som efemär kanal vid sidan av loggen (K6).
- ✅ Övergivna bord avslutas efter ett dygn (C9).
- ✅ Konton med magisk länk, sessionskaka, projekt som tillhör kontot; gäster loggar aldrig in (G1, DRIFT §11).
- ✅ Enkätsvar lagrade bredvid loggen, knutna till versionen (G3).

Bordet och telefonen:
- ✅ Filtbord i bordsläge och sändningslayout i TV-läge med rumskod och QR (C5, K9).
- ✅ Telefonens hand som remsa med tryck, dra upp, håll; zongenvägar; spela vänder kortet om målet är publikt (C4, K4, K10, K11).
- ✅ Anslutning: bordet som platsväljare, "Bara titta", "Spela på den här skärmen" (K12, C8, C2).
- ✅ Bordet spelas direkt: dra, släpp, håll för en ring med verb; perspektivet projiceras exakt (K14, C1).
- ✅ Distansläget: bordet vridet till din kant, handen som solfjäder på filten, båda rollerna i ett fönster (C2, C5).
- ✅ Närvaro: prickar med namn, speglade dragningar, pekpulser, kort som bär färg när de flyttas (K6).
- ✅ Håll för att förstora, inget ljud (K7, K8).
- ✅ Texturer på bordet och i handen, serverade per hash som kapabilitet (TUNN-SKIVA §5).

Editorn:
- ✅ Elementmodell kompilerad till HTML/CSS, inline-syntax, varianter, datatabell med `antal`, baksida som egen mall (E1, E2, L1–L4, L7).
- ✅ Textanpassning ned till minimigräns, mätt i DOM (E6).
- ✅ Kortväggen som hem, duken för mallen, tabellen som flik (L8).
- ✅ Grafisk wizard för en liten startlek: fält syns direkt på exempelkorten, bildfält kan fyllas och editorn är den tydliga nästa vägen; CSV importeras och exporteras i editorns tabell (E1, E3, L6).
- ✅ Editor till bord med förrenderade texturer; bytet är atomiskt för spelarna (L5).
- ✅ "Bord"-fliken: spelets alla bord med miniatyr ur bordets egen snapshot, vem som spelar, vilken version som körs och vägarna in — TV, bordsläge, spela härifrån, titta på, QR — plus avslut med bekräftelse (L5, K9, C7, C9).
- ✅ "Mina spel" och inloggningskortet (G1).

Drift:
- ✅ Compose-stack med minnestak och loggrotation: Postgres, app som serverar webben från samma origin, render-worker, tunnel- och backupprofiler (DRIFT §1, §2, §6, §8).
- ✅ Pull-baserad deploy på lådan via systemd-timer, som drar CI:s bilder eller bygger själv (DRIFT §7).
- ✅ CI med lint, typecheck, tester mot Postgres och Chromium, bilder till GHCR, replay-korpusen som grind (DRIFT §7, D4).
- ✅ Nattlig `pg_dump` till R2 med återställningsprov (DRIFT §5, första steget).

---

## Fas 1 — Spelupplevelsen färdig

Målet är att en grupp kan spela vilket kortspel som helst utan att sakna något fysiken tillåter.

- ✅ Kamera i TV-läge: bordet ramar in det som är i spel och glider med, tillfällig zoom kring pekaren med återgång (C5).
- ✅ Högens topp som adress i `stack` och `flip`, så att översta kortet i en dold hög kan staplas på ett löst kort och vändas; ett uppvänt kort överst i en hög ses av alla (K15).
- ⬜ Räknare och privata zoner på telefonen utöver handen (C4).
- ✅ Aktivitetshistorik i snapshoten: de senaste femtio raderna följer med vid anslutning, så en skärm som ansluter mitt i ett spel ser vad som hänt (I, teknik).
- ⬜ Hur en hög i en area visas med blandad orientering, och om zonrektanglar får överlappa (I, spelupplevelse).
- ✅ Rumskoder: sex tecken utan förväxlingsbara, går ut tre timmar efter senaste anslutning, köper tokens för plats och observatör; bordet öppnas med värdnyckel; värden roterar koden och sparkar från editorn (DRIFT §9, G1 följdkrav).
- ⬜ Zongenvägar per spel med begripliga namn utan att se bordet (C4 följdkrav): namnen kommer från setupen, men setupen redigeras inte i editorn ännu.
- ❓ Fler komponenttyper än standardkortet — tärning, bricka, meeple, bräde (B1, B2, B3).
  Registryt och tryckprofilerna är byggda för det, men bara ett kort finns.
  Frågan är om release är "kortspel" eller "kort- och brädspel"; A1 talar för kort först.

## Fas 2 — Editorn färdig

Målet är att designern aldrig behöver ett annat verktyg för att göra leken.

- ⬜ Setup-editor: zoner, platser, händer, draghög och startuppställning i editorn i stället för wizardens fasta setup (B5, K2).
- 🔶 Bilder: wizarden kan lägga in illustrationer på startkort; kvar är editorns fulla assetflöde med innehållsadresserad lagring i R2 (E1, DRIFT §4).
- ⬜ Symbolbibliotek med CC0- och CC-BY-ikoner, platshållarramar och färgblock (E4).
- 🔶 Fysisk validering: textanpassning finns (E6); kvar är minsta textstorlek som varning, kontrast, färgblindhet, utfall och linjetjocklek (E5).
- 🔶 Versionering: revisionsräknare finns; kvar är oföränderlig historik med namngivna milstolpar, diff och att öppna en äldre version (B4).
- ⬜ Regelboken som versionerat dokument som refererar komponenter och zoner (B7).
- ⬜ Samredigering med en aktör per projekt och en logg, samma mönster som bordet (D3).
- ⬜ Typsnitt: val av font i mallen, med fontfiler som bevaras per version (B3) — kolliderar med fontlicensieringen (I).
- ⬜ Flerspråkighet i verktyget: i18n-infrastruktur, engelska och svenska (A4).
- ⬜ "Mina spel" med senast spelat, starta bord direkt, ta bort spel (G1 följdkrav från prototypen).

## Fas 3 — Konton, betalning och data

Målet är att kunna ta betalt och lämna ifrån sig allt.

- ⬜ Abonnemang via Stripe: gratisnivå med tak på projekt, kort och sessioner, betalnivåer, kvoter (A2, DRIFT §12).
- ⬜ Full export i dokumenterat JSON med assets, mallar, historik och tryckfiler; läsläge vid utgånget abonnemang (G5).
- ⬜ Att claima en gästsession till ett konto efteråt (G1).
- ⬜ Passkeys och OAuth som bekvämlighet; passkey-återställning som UX (DRIFT §11).
- ⬜ Behörighetsroller: ägare, medredigerare, testledare, observatör (I).
- ⬜ GDPR för gäster: enkätsvar och flaggor från personer utan konto, radering (I).
- ⬜ Villkor med garantiklausul om IP (F4).

## Fas 4 — Drift i produktion

Målet är att tjänsten tål riktiga användare, dygnet runt, på en låda hemma.

- ✅ Assets i R2: renderade texturer och tryckfiler i R2, `/faces/:hash` svarar 302 till en signerad URL som lever en timme och cachas i femtio minuter; hashen är förmågan (DRIFT §4).
- ✅ WAL-arkivering till R2 med WAL-G i Postgres-bilden, nattlig basbackup, återställningsprov som spelar upp den senaste sessionen genom motorn (DRIFT §5).
- ✅ Hälsokontroll som även prövar R2 (DRIFT §2).
- ⬜ Händelseschemats `schemaVersion` och upcasters vid inläsning (DRIFT §7).
- ⬜ Riktiga loggar i replay-korpusen, anonymiserade; svar på hur anonymiseringen behåller det värdefulla (DRIFT §7, öppen fråga).
- ⬜ Cloudflare rate limiting mot join- och login-endpointerna (DRIFT §9).
- ⬜ Tailscale för administration, UPS för lådan, och beslutet om en extern pulskoll (DRIFT §10, öppna frågor).
- ⬜ Minnesbudgeten provad under last: render 2 GB, Postgres 1,5 GB, app 1 GB (DRIFT §1).
- ⬜ Dokumenterad återställning från noll: ny låda, `.env`, restore, deploy.

## Fas 5 — Tryck

Byggs sist (H3), och stänger den tunna skivan (H1).

- ⬜ `PrintProvider`-abstraktionen: komponenttyp till SKU, tryckunderlagskrav, prissättning, orderläggning och spårning (F2).
- ⬜ En verklig POD-partner integrerad; all beställning går via plattformen (F1).
- 🔶 Tryckunderlag: renderaren gör PDF med utfall och passmärken från samma HTML/CSS som texturerna (E2); kvar är partnerns exakta krav och tryckprofil per typ (B2).
- ⬜ Kassa med kostnadsbesked först i flödet, ingen prisvisning i editorn (F3).
- ⬜ Automatisk IP-screening med manuell eskalering före tryck (F4).
- ⬜ Moms, tull och leveransvillkor för EU-kunder: DDP eller DDU, IOSS (I, ekonomi).
- ⬜ Fontlicensiering för tryck (I).
- ⬜ En riktig order som landar i brevlådan (H1, TUNN-SKIVA).

## Fas 6 — Releasegrind

Innan första betalande användaren:

- ⬜ Betabruk med tre till fem designers ur målgruppen (A1), rekryterade med delbar länk (A3), med enkäterna som mått (G3).
- ⬜ Replay-korpusen innehåller deras sessioner och spelar upp identiskt på varje commit (D4).
- ⬜ Återställningsprovet har körts mot en riktig backup (DRIFT §5).
- ⬜ Tillgänglighet i verktyget självt på en grundnivå: tangentbord, kontrast, skärmläsarnamn (I).
- ⬜ Prisnivåernas tak och gratisnivåns gränser beslutade (I, A2).
- ⬜ Villkor, integritetspolicy och GDPR-rutiner på plats (I).
- ⬜ En sista genomgång av mönstret i avsnitt J: att de fyra besluten som skär bort kopplingarna mellan pelarna fortfarande är rätt.

---

## Öppna frågor som blockerar release

Från DESIGN-BESLUT I och DRIFT:
- Moms, tull och leveransvillkor för fysiska varor (fas 5).
- GDPR för gästdeltagare (fas 3).
- Fontlicensiering mot kravet att bevara fontfiler (fas 2 och 5).
- Prisnivåernas tak (fas 3 och 6).
- Om release omfattar fler komponenttyper än kort (fas 1).

## Öppna frågor som inte blockerar release

- Anonymisering av replay-korpusen (fas 4).
- UPS och extern pulskoll (fas 4).
- Behörighetsroller i detalj (fas 3).
- Blandad orientering i högar, överlappande zoner (fas 1).
- Tillgänglighet utöver grundnivån (fas 6).

---

## Arbetssättet fram till release

Varje punkt byggs med `/tdd`, röd → grön → refaktorering, och allt visuellt prototypas med `/prototype` i tre strukturellt olika varianter innan det byggs på riktigt ([CLAUDE.md](CLAUDE.md)).
Ett beslut ändras i DESIGN-BESLUT.md eller DRIFT.md, aldrig genom att koden tyst avviker.
När en punkt är klar markeras den här, med det beslut den uppfyller.
Faserna är en ordning, inte en tidplan: utvecklingstid är inte en begränsande faktor (H2), men beroendena är det.
