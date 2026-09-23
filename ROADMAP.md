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
- ✅ Ett spel utan den guidade starten: från wizardens steg 1 med bara namn och spelarantal till ett tomt spel i editorn — inga kort, inga fält, tomma sidor, receptets bord — genom samma `POST /projects` som den guidade vägen (E3, L42).
- ✅ Ett fält görs i editorn: samma blankett från tabellhuvudets sista cell och från mallens bindning, wizardens tre typer och wizardens nyckelförslag, blanketten ligger över raden så huvudet aldrig växer, och `addField`/`removeField` är en redigering var — kolumnen tas bort med värdena och de element som ritade den, och `antal` är motorns (L4, B4, A4, #32).
- ✅ Bildernas storlek jämnas ut på motivet: tomrummet runt det som är ritat mäts en gång per innehållshash i webbläsaren och lagras bredvid asseten, kompilatorn passar in motivet i stället för filen när elementet säger `trim`, och en omätt fil passas in som en fil — mätt på skärmen i Chromium, där två filer med samma motiv och olika mycket luft ritar det lika stort (E1, E2).
- ✅ Tabellens kolumner är formgivarens: bredden följer innehållet tills hon drar i en rubrikkant, och ordningen ändras genom att dra en rubrik på en annan eller med Alt och en pil. Ordningen skrivs i dokumentet — alla ser den, CSV:n följer den, Ctrl+Z tar tillbaka den — och bredden minns i webbläsaren per projekt, som sortering och filter. `×` och hänglaset lämnar rubriken för huvudets egen dörr, där kolumnerna listas (L4, #46, #32).
- ✅ Editor till bord med förrenderade texturer; bytet är atomiskt för spelarna (L5).
- ✅ "Bord"-fliken: spelets alla bord med miniatyr ur bordets egen snapshot, vem som spelar, vilken version som körs och vägarna in — TV, bordsläge, spela härifrån, titta på, QR — plus avslut med bekräftelse (L5, K9, C7, C9).
- ✅ Former bortom rektangeln: varje form ritas som en path i en SVG, en parametrisk kärna (polygon och stjärna) under ett galleri av sjutton namngivna konturer, formen passas in i sin ruta och konturen ligger innanför den; mönster som ett lager över fyllningen i fem sorter med färg, storlek och vinkel; skugga som fyra förval med fem tal bakom `Anpassa`; och färdiga baksidor som läggs ut som vanliga lager i en enda redigering (L1, L16, L17, E5).
- ✅ Kortgrupper som regler på en kolumn: en flik per grupp över duken, fram- och baksida redigeras likadant, lagerpanelen säger om ett lager är basens eller gruppens, och tabellen visar vilken grupp en rad faller i; dolda kort får gruppens baksida utan identitetsläcka och tryckmanifestet håller varje fram-/baksidespar ihop (L3, L7).
- ✅ "Mina spel" och inloggningskortet (G1).
- ✅ Skydd för osparat arbete: osparat mätt mot servern, fråga vid vägen ut, `beforeunload` vid stängning och omladdning, bekräftelse innan ett kort tas bort, och sparat/osparat i huvudet (L9).
- ✅ Editorn, wizarden och observatören på små skärmar: namngivna etapper under 1024 px, ingen duk under 768 px och gränssnittet säger det, tre steg i wizarden, bordet först och ingen banner över spelet hos observatören (L10, #4, #5, #6).
- ✅ Handsolfjädrarna i bordets eget mått: fläkten skalar med filten, inpassningen räknar in händerna och ett kvartsvridet bord passas in i den form det ritas i, mätt i Chromium vid 390, 768 och 1280 i alla fyra konsumenter (K9, C5, #23).
- ✅ Distansvyns nedre band: bågen kapad vid 30°, kortet kvar i läsbar storlek, steget bottnat på 44 px och en hand bredare än bandet som rullar i sidled; hörnen uppe i en topplist och hela handen som rutnät bakom `Visa alla` (K17, C4, #24, #25).
- ✅ Observatörens filt möter fönstret hon håller: ett landskapsbord i ett porträttfönster vänds ett kvartsvarv så att dess långsida löper nedför skärmen, luften mellan filt och ram är två tal för två skäl i stället för ett, och namnen går fria från högarnas antalsbrickor — noll namnpar på varandra vid 320 och 390, kortets kortsida 12 → 20 px och 15 → 27 px (C8, L12, K19, #76).
- ✅ Distansvyns filt får fönstret den står i: en sidoplats vänds inte i ett fönster som redan ligger rätt, luften kring träet är 12 px i stället för 44, handen står som en lodrät lista i en kolumn vid fönstrets inline-slut i ett liggande fönster, och den egna fläkten på filten viks ihop till sin bricka — kortets kortsida 31 → 46 px vid 1280 × 800 och 49 → 62 vid 1920 × 1080, vid varje plats och varje handstorlek, med det stående fönstrets band orört (K9, K17, C5, C8, #77).
- ✅ Filten mot ramens yta i stället för mot dess kortare sida: två femtedelar av ramen, minst 44 px luft, en enda regel för `/online`, `/table`, TV:n och Bord-flikens miniatyrer (K9, K17, #24).
- ✅ Ett grepp är ett steg tillbaka: en dragning och ett ord skrivet i en cell är ett Ctrl+Z var, och trafiken på tråden är oförändrad (L14, #35).
- ✅ Fyllningen kan följa en kolumn: en färg per värde i mallen, lekens värden erbjudna i panelen, och en standardfärg för allt annat (L16).
- ✅ Lagerpanelen som rutnät: lagret heter det designern kallar det och säger vad det visar, låset ligger i raden, dropplinjen säger var en dragning hamnar, och ett låst lager går varken att dra, storleksändra, nudga eller radera (L15).

Drift:
- ✅ Compose-stack med minnestak och loggrotation: Postgres, app som serverar webben från samma origin, render-worker, och en väg in som är lådans egen — dess omvända proxy genom ett överlägg, eller tunneln i stacken (DRIFT §1, §2, §6, §8).
- ✅ Pull-baserad deploy på lådan via systemd-timer, som drar CI:s bilder eller bygger själv (DRIFT §7).
- ✅ CI med lint, typecheck, tester mot Postgres och Chromium, bilder till GHCR, replay-korpusen som grind (DRIFT §7, D4).
- ✅ E2E-svit i Playwright ovanpå återspelningen: flera samtidiga klienter, anslutning, telefon och QR, mot den byggda webben serverad av servern på ett ursprung (D4, `packages/e2e`).
- ✅ Nattlig `pg_dump` till R2 med återställningsprov (DRIFT §5, första steget).

---

## Fas 1 — Spelupplevelsen färdig

Målet är att en grupp kan spela vilket kortspel som helst utan att sakna något fysiken tillåter.

- ✅ Kamera i TV-läge: bordet ramar in det som är i spel och glider med, tillfällig zoom kring pekaren med återgång (C5).
- ✅ Högens topp som adress i `stack` och `flip`, så att översta kortet i en dold hög kan staplas på ett löst kort och vändas; ett uppvänt kort överst i en hög ses av alla (K15).
- ✅ Fel-, tom- och anslutningslägen som en familj: nio lägen med gemensam modell och en form per route, initial timeout på anslutningen, tappad och återansluten ovanpå vyn, avvisade drag vid kontrollen, och en egen dokumenttitel per huvudroute (D5).
- ✅ Räknare och privata zoner på telefonen: en räknartyp `token.counter`, en yta "Framför mig" och en räknarzon per plats från wizarden; telefonen visar räknarna som piller och korten framför sig som en remsa med vänd, ta upp och spela; bordet ritar räknare som brickor (C4).
- ✅ Aktivitetshistorik i snapshoten: de senaste femtio raderna följer med vid anslutning, så en skärm som ansluter mitt i ett spel ser vad som hänt (I, teknik).
- ✅ En hög kvadrerar sina kort, och zoner får överlappa med minsta zonen som vinnare, lika stora efter setupens ordning (K1, K2).
- ✅ Rumskoder: sex tecken utan förväxlingsbara, går ut tre timmar efter senaste anslutning, köper tokens för plats och observatör; bordet öppnas med värdnyckel; värden roterar koden och sparkar från editorn (DRIFT §9, G1 följdkrav).
- ✅ Zongenvägar per spel: varje zon kan bära ett verb för telefonen ("Kasta", "Lägg underst") skilt från bordets namn, med placering överst eller underst; editorns flik "Bord" redigerar namn och genvägar med telefonens ark som förhandsvisning (C4 följdkrav).
- ✅ En hög kan ha egna åtgärder, och en zon kan säga vilka kort som börjar i den (K21): frågespråket är tabellens filter lyft till ett dokumentvärde, ett steg är ett verb ur det slutna vokabuläret med parametrarna ifyllda, antalet är en källa och aldrig en formel, och `split`/`draw`/`deal` fick `face` och `which` — två parametrar och inget nytt verb. Ringen står orörd och spelets egna hänger under den som en lista; tangentbordets panel läser samma lista. Författandet i fliken Bord är meningar med rattarna inne i texten (B5, K14, K16, L4).
- ✅ Spelet startas av ett kommando vid bordet (K25): en åtgärd säger själv om den körs på begäran, vid spelstart eller båda, och en bricka på filten kör varje startåtgärd på varje hög som ett enda kuvert. Inget nytt verb — starten är vanliga verb, och slumpen ligger i loggen som förut (D4). Tidpunkten ställs in som en ratt i meningen, där K21 lade alla andra rattar. Receptet föreslår en blandning på draghögen när det lägger bordet (#453), så ett nytt spel inte längre föds med leken i dokumentets ordning; verktyget skeppar fortfarande inga åtgärder, och designern tar bort den som allt annat receptet lägger.
- ✅ En zon går att klippa, kopiera och klistra i fliken Bord (K22): kopian bär frågan, åtgärderna, genvägen, ägaren, synligheten och storleken, och landar bredvid originalet. En hand kopieras aldrig (C3).
- ✅ Filten säger när ett kort är på väg in i en hand, och bara då (K24): det burna kortet vänder ryggen till medan det bärs, och platsens egna 500 mm av kanten tänds med antalet uppräknat. Ett släpp i en hand är det enda släppet som tar bort information ur allas syn, och det enda som träffas på en yta större än den ser ut. Den fällda handen i distansvyn får samma besked, vilket gör en osynlig träffyta synlig.
- ❓ Fler komponenttyper än standardkortet — tärning, bricka, meeple, bräde (B1, B2, B3).
  Registryt och tryckprofilerna är byggda för det, men bara ett kort finns.
  Frågan är om release är "kortspel" eller "kort- och brädspel"; A1 talar för kort först.

## Fas 2 — Editorn färdig ✅

Målet är att designern aldrig behöver ett annat verktyg för att göra leken.
Klar 2026-09-08: varje punkt nedan är byggd, och besluten bakom dem står i DESIGN-BESLUT.

- ✅ Setup-editor: recept som start, bordet som finjustering — zoner, platser, händer, högar, räknare och egna zoner i editorns flik "Bord" (B5, K2).
- ✅ Bordet är designerns (2026-09-15): receptet lägger bara öppningsbordet, varje zon och hög går att ta bort och stannar borta, leken är en roll en hög bär, och fliken "Bord" är listan över bordets alla zoner med filten bredvid (B5 reviderat).
- ✅ Bilder: bildceller i editorns tabell, spelets bilder en gång var, innehållsadresserad lagring i R2 via `/assets` (E1, DRIFT §4).
- ✅ Symbolbibliotek: fliken "Symboler" med sök och kategorier, väljare vid klammern i tabellen, symboler som projektets assets och licenser hela vägen till trycket (E4).
- ✅ Symbolerna bär färg: spelet namnger sina betydelser med var sin färg, `{namn|roll}` i korttext och i ikonraden, biblioteket omritat som en form i en färg med hålen skurna så masken kan målas, och paletten dömd med kortkontrollens egna mått för kontrast och färgblindhet (E4, E5).
- ✅ Bildens källa går att öppna och ramas mot ett mått: bildelementet bär hur stor andel av ramen motivet fyller och var det står, kortväggen bär måttet, listan över de filer som inte kan svara och lådan som öppnar en källa, och kortets egen avvikelse är ett recept bredvid raden — filen skrivs aldrig om (E1).
- ✅ Fysisk validering: minsta textstorlek, kontrast, färgblindhet, utfall och linjetjocklek, som rapport på kortväggen och blockerande fel vid order (E5, E6).
- ✅ Versionering: oföränderlig historik, namngivna milstolpar, diff i korttabellen och att ta tillbaka en äldre version (B4).
- ✅ Regelboken: versionerat dokument med referenser till zoner och kort, skrivet i fliken "Regler", läst vid bordet och på telefonen, och tryckt som häfte i A5 genom samma renderare som korten (B7).
- ✅ Samredigering: en aktör per projekt med en redigeringslogg, live över `/projects/:id/edit`, med närvaro, roller, inbjudningar och återuppkoppling (D3).
- ✅ Typsnitt: familjen väljs i mallens egenskapspanel, filen laddas upp som projektets asset och pinnas av versionen, licensen anges bredvid familjen och följer med till trycket, och en familj utan fil är ett varsel i den fysiska kontrollen (B3, E5) — licensfrågan i (I) står kvar, verktyget levererar inga egna fontfiler.
- ✅ Typsnittskatalogen: hela Google Fonts söks från Template-sidan i ett ark under kortet, där varje träff sätter kortets egen rubrik och dess regeltext i kortets egen grad; den valda familjen kopieras in som projektets egen asset med licensen ifylld, och Google nås bara av designerns webbläsare och bara när väljaren öppnas (L27, #329).
- ✅ Flerspråkighet i verktyget: en katalog per språk och yta, en språkväljare, och hela editorn, bordet, telefonen, kontot och guiden på svenska eller engelska; mejlen och regelhäftets enda verktygsrubrik följer med, och ett spel som skapas på engelska får engelska zoner, räknare och kolumnnamn (A4).
- ✅ "Mina spel" med senast spelat, starta bord direkt från kortet och ta bort spel med hela dess historia (G1).

## Fas 3 — Konton, betalning och data

Målet är att kunna ta betalt och lämna ifrån sig allt.

- ⬜ Abonnemang via Stripe: gratisnivå med tak på projekt, kort och sessioner, betalnivåer, kvoter (A2, DRIFT §12).
- ⬜ Full export i dokumenterat JSON med assets, mallar, historik och tryckfiler; läsläge vid utgånget abonnemang (G5).
- ✅ Att claima en gästsession till ett konto efteråt: telefonen erbjuder det när sessionen är slut, claim-sidan knyter gästens admission till kontot, och startsidan visar "Bord du spelat vid" med plats, namn, utfall och vägen tillbaka (G1).
- ⬜ Passkeys och OAuth som bekvämlighet; passkey-återställning som UX (DRIFT §11).
- ✅ Behörighetsroller: ägare, medredigerare, testledare, betraktare, med inbjudan per adress; byggt med D3 i fas 2.
- ⬜ GDPR för gäster: enkätsvar och flaggor från personer utan konto, radering (I).
- ⬜ Villkor med garantiklausul om IP (F4).

## Fas 4 — Drift i produktion

Målet är att tjänsten tål riktiga användare, dygnet runt, på en låda hemma.

Första produktionssättningen gjordes 2026-09-12: `v0.4.0` kör på `deck.ockelberg.com`, bakom lådans egen omvända proxy (DRIFT §2, reviderad), med assets och WAL-arkivering i R2:s europeiska jurisdiktion och inloggningsmejl genom Resend.
Deployen är pull-baserad och timern är på: att tagga är att deploya.

- ✅ Assets i R2: renderade texturer och tryckfiler i R2, `/faces/:hash` svarar 302 till en signerad URL som lever en timme och cachas i femtio minuter; hashen är förmågan (DRIFT §4).
- ✅ WAL-arkivering till R2 med WAL-G i Postgres-bilden, nattlig basbackup, återställningsprov som spelar upp den senaste sessionen genom motorn (DRIFT §5).
- ✅ Hälsokontroll som även prövar R2 (DRIFT §2).
- ✅ Händelseschemats `schemaVersion` på varje rad och upcasters vid inläsning; korpusens filer lyfts, aldrig skrivs om (DRIFT §7).
- ⬜ Riktiga loggar i replay-korpusen, anonymiserade; svar på hur anonymiseringen behåller det värdefulla (DRIFT §7, öppen fråga).
- 🔶 Rate limiting mot join- och login-endpointerna (DRIFT §9): lådans egen proxy gör det sedan 2026-09-11, 100 i sekunden med burst 50, räknat på riktiga besökar-IP:n eftersom proxyn litar på Cloudflares vidarebefordrade huvuden. Kvar är att flytta den framför huset, vilket §9 ber om — den här stoppar inget innan det når fibern.
- 🔶 Tailscale för administration är i drift sedan 2026-09-11; UPS för lådan och beslutet om en extern pulskoll står kvar (DRIFT §10, öppna frågor).
- 🔶 Minnesbudgeten reviderad och mätt i vila 2026-09-11: taken är render 1,5 GB, Postgres 768 MB, app 512 MB på en låda som delas med ett trettiotal andra containrar, och stacken tar 605 MB av dem när ingen spelar (DRIFT §1). Under last är den oprövad.
- 🔶 Dokumenterad återställning från noll: ny låda, `.env`, restore, deploy — skriven som [ops/RUNBOOK.md](ops/RUNBOOK.md); vägen från R2 till den riktiga datavolymen är körd först den dag den behövs.

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
- Tillgänglighet utöver grundnivån (fas 6).

---

## Arbetssättet fram till release

Varje punkt byggs med `/tdd`, röd → grön → refaktorering, och allt visuellt prototypas med `/prototype` i tre strukturellt olika varianter innan det byggs på riktigt ([CLAUDE.md](CLAUDE.md)).
Ett beslut ändras i DESIGN-BESLUT.md eller DRIFT.md, aldrig genom att koden tyst avviker.
När en punkt är klar markeras den här, med det beslut den uppfyller.
Faserna är en ordning, inte en tidplan: utvecklingstid är inte en begränsande faktor (H2), men beroendena är det.
