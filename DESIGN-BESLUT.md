# Designbeslut — plattform för kortspelsdesign, playtest och tryck

Status: utkast efter grillningssession 2026-09-05.
Fyrtio beslut, fattade i beroendeordning.
Varje beslut anges med motivering och de följdkrav det lägger på andra delar av systemet.
Följdkraven är den viktiga delen — de är det som är dyrt att rekonstruera i efterhand.

## Produktdefinition

En webbplattform där en speldesigner skapar sitt eget kortspel, playtestar det digitalt utan regelmotor, och beställer hem det fysiskt.
Playtest sker antingen runt en delad skärm med telefoner som händer, eller helt på distans.
Säljpunkten är att hela kedjan skapa → speltesta → trycka finns på ett ställe.

---

## A. Produkt och marknad

### A1. Målgrupp: semi-pro / Kickstarter-designer (fråga 1)

Den första användaren är en designer på väg mot förlag eller crowdfunding, inte en hobbyist och inte en spelgrupp.

Följdkrav:
Tryckunderlaget måste hålla en nivå ett riktigt tryckeri accepterar.
Blindtestning med främlingar måste fungera.
Versionshantering blir ett kärnbegrepp i domänmodellen, inte en bekvämlighetsfunktion.

### A2. Affärsmodell: abonnemang för skapare plus tryckmarginal (fråga 15)

Gratisnivå med tak på projekt, kort och sessioner.
Betald nivå ger obegränsat, playtest-analys, samarbete och exportvägar.
Gäster spelar alltid gratis.

Motivering:
En designer beställer 4–6 prototyper om året, vilket ger runt 25 USD i årlig marginal.
Det bär inte realtidsdrift, en Chromium-renderfarm, oföränderlig lagring och screening.
Intäkten måste följa den kontinuerliga användningen, inte den sällsynta beställningen.

Följdkrav:
Kvoter och mätning måste finnas i domänmodellen från början.
Skaparen bär kostnaden för sina egna testare.

### A3. Testarrekrytering: enbart delbar länk (fråga 22)

Ingen testpanel, ingen matchning, ingen ömsesidighetsmekanik, ingen öppen lobbylista.
Designern rekryterar själv i Discord, på Protospiel eller bland vänner.

Konsekvens att vara medveten om:
Ni löser verktygsproblemet men inte det problem som faktiskt stoppar målgruppen.
Tillväxten måste komma från att verktyget är påtagligt bättre, inte från nätverkseffekter.

### A4. Språk: flerspråkigt från start (fråga 39)

i18n-infrastruktur från dag ett, engelska och svenska som första språk.

Följdkrav:
Även felmeddelanden från fysisk validering och från POD-adaptern måste vara översättningsbara.
Innehållsspråket är separat och obegränsat — renderaren behöver fonter för alla skriftsystem.
Den fysiska valideringen behöver olika minimigränser per skriftsystem, eftersom CJK kräver större punktstorlek än latinsk skrift.

---

## B. Domänmodellen

### B1. Full typad komponentmodell (fråga 2)

Kort, tärning, meeple, bräde, mat, kub, låda och inlägg är var sin egen typ, inte varianter av en generisk primitiv.

### B2. Typerna bärs av ett datadrivet typregistry (fråga 3)

Varje komponenttyp är en deklarativ definition: fysisk spec, ytor, tillåtna beteenden, editor-schema och tryckprofil.
Motorn känner bara definitionen.
Ny typ är en ny fil, inte en ny gren i editor, bordsbeteende, synk och tryck.

Följdkrav:
Definitionsspråket måste designas mot minst fem till tio verkliga typer för att bli ärligt.
Typerna blir testbara som data.

### B3. Typdefinitioner versioneras och pinnas av spelet (fråga 40)

Varje typdefinition är själv oföränderlig och versionerad.
En spelversion pinnar exakt de typversioner, fonter och biblioteksassets den använde.
Uppgradering är ett uttryckligt val med diff.

Motivering:
Utan detta renderas en låst version annorlunda i morgon än när den testades.
Ett omtryck ett år senare skulle ge kort som inte matchar de redan levererade.

Följdkrav:
Allt renderingspåverkande måste innehållsadresseras, inklusive fontfiler.
Fontlicenser måste tillåta att filerna behålls permanent — det gör få licenser, och det är en öppen fråga.

### B4. Versionering: automatisk oföränderlig historik plus namngivna milstolpar (fråga 13)

Varje redigering läggs till i en oföränderlig historik.
En session låses vid start till exakt det tillståndet.
Användaren behöver aldrig committa, men kan namnge de versioner som betyder något.
Diff mellan versioner visas som förändringar i korttabellen.

Följdkrav:
Assets måste vara innehållsadresserade, annars sväller lagringen ohållbart.
Historiken måste presenteras utan att lära ut git.

### B5. Logikgräns: affordances plus deklarativ setup (fråga 5)

Systemet kan manipulera — blanda, dra, vända, rotera, stapla, räkna, slå — och känner till spelets struktur: namngivna zoner, per-spelare-områden, startuppställning, drag- och kasthögar.
Systemet validerar aldrig regler, hindrar aldrig och rättar aldrig.

Följdkrav:
Zon- och setupdefinitionen återanvänds för regelbokens uppställningsbild och för lådans inlägg.
Zonnamn blir användarsynlig UX på telefonen, inte kosmetik.
Setup måste redigeras när spelet ändras.

### B6. Synlighet: zonhärledd standard med undantag per komponent (fråga 35)

Synlighet är i grunden en egenskap hos zonen: hand är bara ägaren, bord är alla, draghög är ingen.
Varje komponent kan bära en egen synlighetsmängd som avviker, till exempel visad för en specifik spelare.
Servern filtrerar utgående diffar mot den mängden.
Varje titt loggas som händelse, eftersom en titt ändrar kunskap utan att ändra tillstånd.

Följdkrav:
Undantag måste städas när komponenten byter zon, annars läcker gamla rättigheter.
Detta är den mest sannolika källan till informationsläckor och behöver testas hårt.

### B7. Regelboken är ett förstklassigt versionerat dokument (fråga 27)

Reglerna bor i projektet, versioneras i samma oföränderliga historik som korten, och kan referera komponenter och zoner så att namnändringar följer med.
Renderas till referenspanel vid bordet och till tryckfärdigt häfte.

Motivering:
Trycket kräver en regelbok för att ordern ska kunna läggas.
Blindtest kräver att testare kan läsa reglerna utan designern.
Ett playtest låst till kortversion v0.7 med reglerna i ett Google Doc är fortfarande omätbart.

---

## C. Bordet och spelupplevelsen

### C1. Fidelity: 2.5D — deterministisk 2D-logik, 3D-vy (fråga 4)

Tillståndet är plant och deterministiskt: position, rotation, z-ordning.
Renderingen är perspektivisk med tjocklek och skuggor.
Ingen fysikmotor.

Motivering:
Det som är älskat i Tabletop Simulator är friheten, inte fysiken.
Ett playtest där kort glider iväg mäter fysikmotorn, inte speldesignen.

Följdkrav:
Renderingen blir WebGL, exempelvis three.js eller React-Three-Fiber.
Telefonens handvy kan vara ren DOM mot samma tillstånd.

### C2. Inga spellägen — bara vyroller (fråga 7)

En sessionstyp, godtyckligt många anslutna vyer.
Rollen `table` är en publik projektion utan hemlig information.
Rollen `player` äger hand, privata zoner och egna kontroller.
Helt online betyder att båda rollerna körs hopslagna i ett fönster.

Motivering:
Två uttalade lägen ger 90 procent gemensam kod med 10 procent divergens, i evighet.

Följdkrav:
Hybridspel — några på plats, någon på distans — fungerar utan specialkod.
Lobbyn måste hålla isär vem du är och vilken skärm du är.

Byggt 2026-09-06 (prototypat, variant "handen utfläktad på filten"):
`/online?session=…&seat=…&name=…` är båda rollerna i ett fönster: en anslutning med plats, bordet i bordsläge vridet så platsens kant är nederst (C5), spelbart som bordsskärmen, och den egna handen som en solfjäder vid kanten — håll över för att läsa, dra rakt upp på bordet så landar kortet där det släpps, uppvänt om zonen är publik (K11).
Den egna handen visas som baksidor och antal på filten som för alla andra; fläkten är en komponent runt renderaren.
Telefonens kontroller (ångra, flagga, avsluta), tillbakaspolning och enkät delas med telefonen genom samma komponenter.
Anslutningssidan erbjuder "Spela på den här skärmen" bredvid "Sätt dig"; med en telefon i handen och en TV i rummet väljer man det förra bara på distans.

### C3. Identitetens tre begrepp (fråga 12)

Användare äger spel och lägger beställningar.
Plats är spelarrollen vid bordet och äger en hand och privata zoner.
Anslutning är en skärm.
En person kan ha två anslutningar, och en telefon kan byta plats mitt i spelet.

### C4. Telefonens `player`-vy: hand plus zongenvägar (fråga 24)

Telefonen äger hand, privata zoner, räknare och flagga-knappen.
Den har genvägar mot zonerna som setup-definitionen redan namngett: spela framför mig, kasta, lägg underst.
Fullt bord går att fälla ut vid behov.

Följdkrav:
Zonnamn måste vara begripliga utan att man ser bordet.

### C5. Rumslig modell: konfigurerbart TV- eller bordsläge (fråga 32)

Sessionen väljer vid start mellan TV-läge, där allt orienteras mot betraktaren och platser radas längs nedre kanten, och bordsläge, där platser ligger runt om och orientering följer platsen.
Kameran ramar automatiskt in allt aktivt innehåll.
Vem som helst kan tillfälligt zooma, men vyn återgår av sig själv.

Följdkrav:
Läget hör hemma i lobbyn, inte i användarinställningar, eftersom det varierar per tillfälle.

Byggt 2026-09-06:
Renderaren kan vridas i kvartsvarv (`rotate`), pekaren projiceras tillbaka genom vridningen, och etiketter (högnamn, zonnamn, markörnamn) vrids tillbaka så de förblir läsbara medan korten följer bordet som vid ett riktigt bord.
Distansvyn använder det för att lägga den egna platsen nederst.
Reviderat 2026-09-07 (#20): platsens namn är undantaget och vrids inte tillbaka.
Det ligger längs sin egen kant vänt mot den som sitter där, som ett namnkort på ett riktigt bord, vilket är vad prototyp B visade och vad distansvyn gör rätt av sig själv: den egna platsen ligger nederst och är därmed den enda som står upprätt.

Kameran (prototypad och byggd 2026-09-07):
Tre varianter prövades: en kamera som följer innehållet, en regissör som klipper mellan fasta bilder, och hela bordet med en lupp. Valet blev den följande kameran: den är C5:s ordalydelse och behöver inget av protokollet.
I TV-läge ramar bilden in det som är i spel med marginal och glider när det ändras; den går aldrig närmare än att drygt åtta kort ryms i bredd, aldrig utanför bordet och det som ligger på det.
I spel är de lösa korten, setupens högar och areor (spelplanen, tomma eller inte) och högar som bildats under spel så länge de finns. Händerna räknas inte: de ligger vid kanten och finns alltid, så med dem inräknade blev bilden nästan alltid hela bordet. Docken nederst visar ändå varje plats.
Scroll eller nyp zoomar kring pekaren, dubbeltryck går nära och tillbaka; efter sex sekunder återgår kameran av sig själv. Under ett drag står kameran stilla, eftersom pekarens avbildning låstes när draget började.
Det lutade bordsläget har ingen kamera: en panorering på det lutade planet bryter perspektivet.

Reviderat 2026-09-07 (#20): kameran får sträcka sig utanför bordets kant, men bara så långt som något som är i spel faktiskt ligger där.
Ett kort kan hamna utanför filten — en delning bredvid en hög vid kanten lägger det där (K1, K15) — och då är valet mellan att visa en strimma tomrum utanför bordets kant och att kapa ett kort mitt itu vid skärmkanten.
Det senare läses som ett fel, det förra som en bildram, så kameran följer med ut.
Räckvidden är bordet plus det som är i spel, omarginalerat: marginalen runt spelet är luft och får beskäras vid kanten, så kameran driver aldrig ut i tomrummet bara för att ge plats.
En zoomning är en vy och inte innehåll, och vidgar därför aldrig räckvidden: att zooma ut stannar vid bordet som förut.
Följden är den invariant som mäts i renderaren: inget kort som kameran är riktad mot skärs av av ramen.

### C6. Ångra: personlig ångra plus gruppens tillbakaspolning (fråga 18)

Din egen senaste handling ångras direkt och tyst om ingen hunnit röra samma objekt.
Utöver det kan vem som helst föreslå tillbakaspolning till en punkt, övriga bekräftar, och servern återspelar loggen dit.
Högar vars innehåll exponerats på vägen blandas om, eftersom att backa tillstånd inte återställer kunskap.

Följdkrav:
Loggen måste vara deterministiskt återspelbar.
Slumpen lagras som resultat i loggen, aldrig som fröer som körs om.
Fritt bläddrande i tidslinjen är rätt svar efter sessionen, för analys, med annan behörighet.

### C7. Live-ändring tillåts som versionsbyte i loggen (fråga 36)

Ägaren kan ändra kort mitt i sessionen.
Ändringen skapar en ny version och läggs som en händelse i loggen.
Bordet uppdateras på plats, alla ser en notis, och analysen segmenteras per version.

Motivering:
Att stoppa henne är att bekämpa arbetsflödet hon kom för.
Att tillåta det tyst gör analysen till lögn.

Följdkrav:
Tillbakaspolning förbi ett versionsbyte måste återställa korten också.
Enkäten måste kunna fråga om två versioner.

### C8. Observatörsrollen: full insyn, alltid synlig (fråga 37)

Observatören ser allt — alla händer, alla dolda högar — och alla vid bordet ser att hon är där och vad rollen innebär.
Hon kan flagga ögonblick men inte röra något.
Osynliga observatörer finns inte.

Motivering:
Halva insikten i ett playtest ligger i varför någon gjorde ett dåligt drag, och svaret finns i handen hon annars inte ser.

Följdkrav:
Observatörens flaggor bör märkas som hennes, eftersom de väger annorlunda än en testares.
Observatörseffekten är verklig och gör datan något mindre naturlig.

Byggt 2026-09-06:
En anslutning med `?role=observer&name=` projiceras med full insyn och får bara skicka `flag`; servern stämplar flaggan med namnet, en spelare kan inte låtsas vara observatör.
Aktören skickar en `roster` till alla vid varje förändring, så bordsskärmen visar "Eva tittar på · ser allt" i docken.
Observatörens egen vy (`/observe`) är TV-vyn med allas händer utfläktade, en banderoll om vad hon är, och en enda knapp: Flagga.
Anslutningssidan erbjuder "Bara titta" bredvid "Sätt dig".
Vem som helst med rumskoden kan observera; det är G1:s öppna fråga om missbruk.

### C9. Livscykel: persistenta bord med uttrycklig avslutning (fråga 25)

Tillståndet överlever att alla kopplar ner, så gruppen kan återuppta med samma ställning och samma platser.
Ett uttryckligt avslut låser loggen, bokför versionen och triggar enkäten.
En timeout avslutar åt dem som glömmer.

Följdkrav:
Tappad anslutning håller platsen.
En spelare som lämnar för gott lämnar en tom plats med dolda kort i sig — att frigöra platsen blandar tillbaka korten i rätt hög, konsistent med C6.
Övergivna bord måste städas automatiskt.

Byggt 2026-09-06 (prototypat, variant "knappar i huvudet"):
"Avsluta" i telefonens huvud öppnar ett ark som säger vad som händer och avslutar för alla (`session.end`); snapshoten bär `ended`.
Bordsskärmen visar "Sessionen är avslutad", versionen loggen låstes på, en summering och att enkäten finns på telefonerna; bordet kan inte spelas.
Servern avslutar bord som ingen rört på ett dygn (`IDLE_END_MS`), som bordet, en gång i timmen.
`GET /sessions/:id` säger version och om sessionen avslutats.

---

## D. Synk, stack och testbarhet

### D1. Auktoritativ server med intents (fråga 6)

Klienten skickar avsikter, servern äger sanningen och skickar tillbaka per plats filtrerade diffar.
Dold information är serverhävdad — det är informationsintegritet, inte spelregler, och är inte förhandlingsbart.
Händelseloggen är tillståndet.

Följdkrav:
Latens döljs med optimistisk lokal rendering.
Playtest-analys och tillbakaspolning följer gratis ur arkitekturen.

### D2. Stack: TypeScript rakt igenom, aktör per bord i en egen Node-process (fråga 16, reviderad 2026-09-06)

React med React-Three-Fiber som klient.
En Node-process på en självhostad server håller alla aktiva bord och projekt som in-memory-aktörer med en seriell kö per aktör.
Postgres på samma maskin för domändata, händelselogg och jobbkö.
Cloudflare R2 för innehållsadresserade assets.
Chromium som separat container på samma maskin.
Stripe för betalning.

Ursprungligt beslut var Cloudflare Durable Objects.
Det reviderades när driften grillades: en befintlig hemmaserver ska bära så mycket som möjligt för att hålla nere kostnaden.
Det som gjorde egenbyggd aktör dyr — placering och överlämning mellan instanser — försvinner på en enda maskin.
Driften i sin helhet finns i [DRIFT.md](DRIFT.md).

Följdkrav:
Delade typer för hela intent-protokollet mellan klient och server.
Aktörsvärden är ett gränssnitt; motorn känner aldrig processen, så Durable Objects kan bytas in senare utan att motorn märker det.
Ordningen `decide` → commit i Postgres → `apply` → patchar är oförhandlingsbar.

### D3. Samredigering på samma aktörsmönster (fråga 21)

En aktör per projekt, precis som per bord, i samma process.
Intents är sätt cell, flytta mallelement, ersätt asset.
Roller: ägare, medredigerare, testledare, betraktare.

Motivering:
Ett projekt är strukturellt samma sak som ett bord — delat tillstånd som flera ändrar samtidigt och som ska hamna i historiken.
Att bygga en andra, sämre synkmodell bredvid den som redan finns är exakt det duplikat arkitekturen undviker.

Följdkrav:
Närvaro och konflikthantering i mallytan måste lösas.
Behörigheter blir en riktig modell, inte ett fält.

### D4. Teststrategi: deterministisk återspelning som ryggrad (fråga 28)

Inspelade sessionsloggar är testfall.
Spela upp, jämför sluttillstånd, och jämför varje spelares synliga vy vid varje steg så att informationsläckor fångas automatiskt.
Ovanpå det E2E med flera samtidiga klienter för anslutning, telefon och QR.

Motivering:
En buggrapport blir ett regressionstest utan översättning.
Svåra buggar är samtidighet och synlighet, inte utseende, och de reproduceras inte manuellt.

Följdkrav:
Händelseschemat är ett kontrakt som måste versioneras och migreras vid varje ändring.
Migreringsstrategin är beslutad i DRIFT §7 och byggd 2026-09-07: version per rad, upcasters vid inläsning.

---

## E. Editorn

### E1. Visuell mall plus datatabell (fråga 8)

Kortmallen ritas visuellt med textrutor, bildytor, ikonrader och villkorade element, där varje element binds till ett fält.
Leken är en tabell med en rad per kort, importerbar från CSV eller Sheets.
En ändring i mallen slår igenom på alla kort.

Motivering:
Målgruppen lever redan i kalkylblad.
Playtest-iterationen är att ändra kostnaden på 40 kort, inte att rita om ett kort.

Följdkrav:
Enstaka avvikande kort kräver en genomtänkt undantagsmekanism i form av mallvarianter.
Datan blir diffbar, vilket ger versionshanteringen dess mening.

### E2. En enda renderare: HTML/CSS via headless Chromium (fråga 9)

Mallen är HTML och CSS.
Editorn renderar den i DOM, bordet får samma render bakad till textur, och trycket görs serverside i headless Chromium vid 300 DPI med vektortext i PDF.

Motivering:
Tre renderare glider isär, och den buggen upptäcks först när kunden håller 500 tryckta kort som inte ser ut som på skärmen.

Följdkrav:
Regeln är helig — renderas något någonsin av en andra kodväg är den förlorad.
CMYK löses som ett ICC-konverteringssteg efteråt.
En Chromium-flotta måste driftas och kostar RAM.

### E3. Onboarding: guidad wizard (fråga 26)

Ny användare möts av ett steg-för-steg-flöde: antal spelare, komponenter, antal kort, fält.

Villkor som gör valet hållbart:
Wizarden måste skapa exakt samma domänobjekt som den vanliga editorn — ingen parallell kodväg.
Wizarden är en kort grafisk start, inte en förenklad full editor: varje valt fält visas direkt på några exempelkort och bildfält kan fyllas med en bild.
Hela leken, mallplacering och CSV-import/export hör hemma i editorn; wizarden ska tydligt hänvisa dit som nästa steg.
Ingen levande tvåvägssynk mot Google Sheets — import och ominport med diff, eftersom synk ger två sanningskällor och krockar med oföränderlig historik och samredigering.

Reviderat och byggt 2026-09-06 efter prototypvariant A, ”Guidad start”.
CSV-steget togs bort eftersom det gjorde onboarding beroende av ett externt kalkylblad och dolde sambandet mellan fält och kortdata.

### E4. Assets: kurerat CC0- och CC-BY-bibliotek för symboler (fråga 23)

Inbyggt sökbart bibliotek med fritt licensierade ikoner och symboler, plus platshållarramar och färgblock för illustrationsytor.
Ingen inbyggd AI-generering.

Motivering:
Prototyper som ser färdiga ut får fel feedback — testare kritiserar konsten och blir artiga om mekaniken.
Fritt licensierat material ger noll rättslig risk vid tryck.

Följdkrav:
Licensmetadata per asset måste följa med hela vägen in i tryckunderlaget.
Kuratering och licensbokföring blir ett löpande arbete.

### E5. Fysisk validering med varningar (fråga 30)

Kontinuerliga kontroller mot fysiskt mått: minsta textstorlek i punkter, kontrastförhållande, färgblindhetssimulering, skärmargin mot utfall, minsta linjetjocklek.
Varningar i editorn, blockerande fel vid order.

Motivering:
Text som ser lagom ut på en 27-tumsskärm blir 5 punkter i handen.
Effektsymboler som bara skiljs åt av rött och grönt är osynliga för åtta procent av männen som spelar spelet.
Inget av detta upptäcks vid ett digitalt playtest, eftersom bordet zoomar in.

Följdkrav:
Reglerna måste kalibreras mot faktiskt tryckta provkort, annars blir de brus som stängs av.

### E6. Textanpassning: automatisk krympning ned till validerad minimigräns (fråga 34)

Texten skalas ned stegvis tills den ryms, men aldrig under minsta läsbara punktstorlek från E5.
Därefter en varning som pekar på exakt det kortet.

Följdkrav:
Varningen måste länka direkt till raden i tabellen.
Textstorleken varierar mellan kort, vilket är estetiskt ojämnt jämfört med hur förlag gör.

---

## F. Tryck

### F1. Enbart integrerad POD-partner (fråga 10)

All beställning går via plattformen, i alla upplagor.
Ingen separat exportväg för produktionsupplagor hos externt tryckeri.

Konsekvens att vara medveten om:
Partnerns katalog är produkttaket — typregistryt kan aldrig innehålla något ingen partner tillverkar.
POD-styckpris är fem till tio gånger offsettryck, så stora upplagor lämnar plattformen ändå.
Frakt, tull och reklamationer blir er supportbörda.

### F2. Adapterlager mot flera partner (fråga 11)

En intern `PrintProvider`-abstraktion: komponenttyp till partnerns SKU, tryckunderlagskrav, prissättning, orderläggning och spårning.

Motivering:
Enda skyddet mot att en extern katalog fryser produkten.
Låter er dirigera EU-kunder till EU-tryck och US-kunder till US-tryck.

Följdkrav:
Gränssnittet måste designas mot minst två verkliga partner, annars formas det efter en enda leverantörs egenheter.
Fraktkostnad till EU är avgörande för om prototypslingan över huvud taget används.

### F3. Kostnadsbesked först i beställningsflödet (fråga 29)

Ingen löpande prisvisning i editorn.

Rekommenderad kompensation:
Typregistryt bör bära en statisk flagga för att en typ tillverkas av minst en partner, så att editorn aldrig låter någon bygga något omöjligt.
Det kräver inga live-anrop och tar bort den värsta felmoden.

### F4. IP och moderering: automatisk screening med manuell eskalering (fråga 14)

Villkor med garantiklausul från användaren.
Automatisk klassificering av allt som går till tryck: NSFW, våld, kända varumärken via bildhash.
Manuell granskning av första ordern per spel och vid varje träff.
Dokumenterad anmälningsprocess.

Motivering:
I samma sekund som ni tar betalt för en fysisk låda är ni tillverkare och distributör.
Det finns ingen safe harbor för fysiska varor motsvarande den som gäller hostat innehåll.

Följdkrav:
Screening cachas per assets innehållshash, så samma bild granskas en gång.
Falska positiva mitt i ett köpflöde är en verklig kostnad.

---

## G. Data, feedback och förtroende

### G1. Identitet: konto för skapare, gäst för spelare (fråga 12)

Att äga spel, spara versioner och beställa tryck kräver konto.
Att joina ett bord kräver rumskod eller QR från storskärmen plus ett namn.
Gästen kan efteråt claima sin session till ett konto.

Motivering:
Fem personer runt ett bord som ska skapa konto på sina telefoner är en död session.

Följdkrav:
QR-knappen i `table`-vyn är produktens viktigaste knapp.
Feedback från gäster är svagt attribuerad.
Missbruk av öppna rumskoder hanteras i DRIFT §9 (byggt 2026-09-07): koden köper en token, går ut och kan roteras, och värden kan sparka.

Byggt 2026-09-06 (prototypat, variant "kort i mitten"):
Skaparen loggar in med en magisk länk (DRIFT §11): `POST /auth/login` mejlar en engångslänk som gäller i 15 minuter och svarar alltid 200, `GET /auth/verify` löser in den, skapar kontot första gången och sätter en HttpOnly-kaka i 30 dagar.
Projekt som skapas med konto tillhör kontot: bara ägaren läser, skriver, listar och startar bord; projekt från före konton förblir öppna.
Startsidan `/` är inloggningskortet tills länken följts, sedan "Mina spel" som ett rutnät av spelkort med "Nytt spel"; editorn och wizarden skickar vidare till `/login?next=` vid 401. Ett inskickat wizardutkast och dess mål bevaras under auth-rundan i samma flik och återupptas automatiskt efter login, så att skaparen inte behöver bygga spelet två gånger.
Gäster loggar aldrig in: bord, telefon, distansvy och observatör nås med rumskod; inloggningskortet säger det.
Att claima en gästsession till ett konto, passkeys och OAuth återstår.

### G2. Kommunikation: ingen inbyggd röst (fråga 19)

Användarna kör Discord eller motsvarande vid sidan om.

Konsekvens att vara medveten om:
Den rikaste playtest-signalen ligger utanför produkten samtidigt som ni tar betalt för playtest-analys.
Ni mäter kortrörelser och kan inte svara på varför något hände.

### G3. Feedback: flagga ögonblick under spel plus enkät efter (fråga 20)

En knapp på telefonen med valfri kort kommentar, tidsstämplad mot händelseloggen.
Efter sessionen en kort strukturerad enkät per deltagare, knuten till den låsta versionen.

Motivering:
Det som gör ont i ett playtest är enskilda ögonblick, och de glöms inom minuter.

Följdkrav:
Flaggan är gratis att bygga, eftersom den bara är ännu en intent i loggen.

Byggt 2026-09-06 (prototypat, variant "knappar i huvudet · enkät steg för steg"):
"Flagga" i telefonens huvud öppnar ett ark med frivillig kommentar och skickar `flag` med `note`; flaggan syns i aktivitetsflödet som "Ada flaggade: …" och är varken drag eller ångringsbar.
Efter avslut visar telefonen enkäten en fråga i taget: kul, tydlighet, balans (1–5) och "Vad skulle du ändra?", och skickar till `POST /sessions/:id/survey`, som bara tar emot när loggen är låst och knyter svaret till versionen.
Observatören svarar också, märkt `observer: true`.
Enkäter lagras bredvid loggen (tabellen `surveys`), aldrig i den.

### G4. Fysiska playtests mäts inte (fråga 38)

Endast digitala sessioner registreras.

Konsekvens att vara medveten om:
Det dyraste och mest avslöjande testet — det med de tryckta korten vid köksbordet — är också det enda ni saknar data om.
Loggen har ett hål i mitten, direkt efter det steg ni tar betalt för.

### G5. Dataägande: full export alltid, läsläge vid utgånget abonnemang (fråga 33)

Komplett export när som helst i dokumenterat JSON-format med alla assets, mallar, hela historiken och tryckfärdiga filer, även på gratisnivån.
Utgånget abonnemang ger läsläge, aldrig radering.

Motivering:
Målgruppen investerar två till fyra år i ett spel innan det når Kickstarter.
Frågan om vad som händer om bolaget läggs ner är den vanligaste invändningen ni kommer att möta.

Följdkrav:
Domänmodellen måste vara serialiserbar i sin helhet — vilket behövs för backup och migrering ändå.
Lagringskostnad för icke-betalande konton kvarstår permanent.

---

## H. Sekvensering

### H1. Första snittet: tunn vertikal skiva genom alla tre pelarna (fråga 17)

En komponenttyp, en mall med databindning, ett spelbart bord med två platser plus en telefon, en versionslåsning, och en verklig POD-order som landar i brevlådan.
Inget mer.

Motivering:
Varje söm i arkitekturen — typregistry, mall, bord, synk, tryck — tvingas fungera på riktigt medan den fortfarande är billig att flytta.

### H2. Utvecklingstid är inte en begränsande faktor (fråga 31)

Beslutet att inte väga utvecklingskostnad tungt är uttalat och gäller genomgående.

### H3. Allt digitalt före tryck (2026-09-06)

Pelare ett och två — skapa och speltesta — byggs färdiga innan pelare tre påbörjas.
Renderaren ger redan tryckfärdig PDF med utfall; `PrintProvider`-adaptern och partnervalet (F2) väntar tills det digitala är komplett.

---

## K. Spelupplevelsen (grillad 2026-09-06)

Verben var låsta; det här är känslan, och tre av besluten slår tillbaka på protokollet.

### K1. Ad hoc-högar är dynamiska zoner

`stack` på ett löst kort i en area skapar en ny pile-zon på platsen med areans synlighet, och flyttar in båda korten.
En hög med ett kort kvar löses upp tillbaka till arean.
Högen kan blandas, dras ur, delas och flyttas som en enhet.

Följdkrav på protokollet:
Zoner kan tillkomma och försvinna i patchar.
Pile-zoner har en position.
Ett verb för att flytta en hel hög som enhet — ett medvetet tillägg till det slutna vokabuläret, eftersom "plocka upp högen" är en fysisk handling.

### K2. Fri placering, zoner som rektanglar med släpp-in

Setup ger varje zon en rektangel, eller en punkt för högar, i bordskoordinater.
Släpp inom rektangeln är `move` till zonen med relativ position; släpp utanför är fri placering i bakgrundsarean.
Ingen grid, inga slots.

Följdkrav:
Zonrektanglarna är direkt återanvändbara som spelplansunderlag vid tryck.
En `slots`-zonkind kan läggas till additivt när ett riktigt spel kräver det.

### K3. Flera kort på en gång: atomisk batch i kuvertet

`Envelope` bär `intents: Intent[]`.
Servern validerar alla först mot ett temporärt tillstånd, applicerar sedan alla med löpande seq och en gemensam batch-id, eller inget.
`undo.self` och tillbakaspolning behandlar en batch som en enhet.

Motivering:
Inget nytt verb; "en handling" får en definition i loggen som analysen kan lita på.

Följdkrav:
Motorn behöver tvåfasig validering, vilket tillbakaspolning också kommer att behöva.
Batchar med flera slumputfall bestämmer utfallen i ordning.

### K4. Handen på telefonen: horisontell remsa

Korten i en scrollbar remsa i nästan full bredd.
Tryck öppnar kortet i full upplösning.
Dra uppåt lyfter kortet till ett ark med zongenvägarna från C4.
Långtryck startar flerval; dra i sidled inom remsan sorterar om handen.
Översikten är samma remsa nedzoomad.

### K5. Inga objekt utanför spelets setup

Ingen inbyggd låda med generiska tärningar, kuber eller lappar.
Behöver gruppen en markör mitt i ett test lägger designern till den via versionsbyte enligt C7 — vilket är precis den insikten loggen bör fånga.

### K6. Närvaro: markörer, peka-gest, tillskrivna rörelser

Varje anslutnings markör syns på `table`-vyn i platsens färg med namn, och tonar bort vid stillhet.
Långtryck skickar en kort peka-puls som alla ser.
Ett kort som flyttas bär kort platsens färg.
Allt går i en separat efemär kanal och hamnar aldrig i loggen.

Prototypat och byggt 2026-09-06, variant "mjuka markörer + speglade dragningar":
Markörerna är prickar med namn, inte pilar, och en anslutnings pågående dragning speglas live på de andras bord — kortet lyfts, följer handen och bär namnbricka tills det släpps och loggen säger var det landade.
Kanalen är ett `presence`-meddelande på samma WebSocket (`cursor`, `away`, `drag`, `drop`, `point`) som aktören vidarebefordrar till övriga anslutningar; avsändaren är anslutningens plats (null för en bordsskärm) och ett anslutnings-id.
Markörrörelser stryps till ~20 per sekund i klienten; en bruten anslutning ger de andra `drop` och `away`.
Tillskrivningen behöver ingen kanal: aktivitetsraden bär `by`, så bordet låter kortet glöda i platsens färg när raden kommer.
Överlägget ligger inne i bordsplanet, så det följer perspektivet i bordsläget.

### K7. Inget ljud

Inga ljud, ingen haptik, inga notiser.

Konsekvens att vara medveten om:
På distans är ljudet den enda signalen att något hände utanför blickfånget; utan det bär markörerna i K6 hela den bördan.

### K8. Inspektion: håll för att förstora

Tryck-och-håll på ett kort visar det i full upplösning ovanpå bordet, bara för den som håller.
Ett dolt kort förstoras som baksida — samma ansiktsanrop som texturen, ingen ny synlighetsregel.
Förstoringen är privat; "titta på det här" är peka-gesten i K6.

### K9. Bordsvyns utseende: filtbord som renderare, sändningslayout som TV-omgivning (prototypat 2026-09-06)

Tre prototyper byggdes och jämfördes: planritning, filtbord med perspektiv, och en mörk sändningslayout.
Valet blev filtbordet som enda bordsrenderare — filt, perspektiv, högar med tjocklek, handfläktar med antal, orientering per kant — och sändningslayoutens omgivning i TV-läge: header med rumskod och QR, dock med platspaneler, aktivitetsflöde.
Planritningen kan bli ett felsökningsläge senare.

Följdkrav som prototypen avslöjade och som nu är införda:
Snapshot bär platserna med namn och golvzonen.
Servern skickar varje committad rad som redigerad aktivitet, utan utfall.
Snapshoten bär de senaste femtio raderna på samma sätt (2026-09-07), så att en skärm som ansluter mitt i ett spel ser vad som hänt; klienten byter ut sitt flöde mot dem vid varje återanslutning.

Byggt 2026-09-07 (bordet ställt sida vid sida med de godkända prototyperna B och C, #20):
TV-läget har åter rubriken — spelets namn och den version aktören kör — där hela join-URL:en tidigare stod i klartext; adressen finns kvar som QR-kodens alternativtext, så den går att skriva av utan kamera.
Namnet kommer ur projektet bordet startades ur (L5) och `GET /sessions/:id` svarar därför också med det; ett bord som startats utan projekt heter bara "Bordet".
INSPEKTION är tillbaka: kortet pekaren vilar på visas stort bredvid bordet genom samma texturväg som bordet självt (K9, E2), och panelen ber om "peka på ett kort" när ingen pekar.
Ett kort skärmen inte får se heter "dolt kort" och inget annat (B6).
SENAST fylls från loggen vid anslutning: aktören skickar de senaste femtio raderna som ett vanligt `activity`-meddelande direkt efter ögonblicksbilden, med samma redigering som under spel, och klienten slår ihop på `seq` så en återanslutning aldrig säger samma rad två gånger.
Raderna är numrerade och färgade av platsen som gjorde dem, och platsdocken bär avatar med initial, "n kort på hand" och platsens senaste handling.
Högarna säger antalet på två sätt, som prototyperna gjorde: en bricka på högen med versalt namn under i TV-läge, en pill under högen på filten.
Bordsläget har rubrikraden "spel · version · rumskod", och platsernas namn ligger längs sin egen kant vända mot den som sitter där, ritade efter korten så att en giv inte begraver namnet; antalet ligger kvar som bricka på handen.
Zonens namn ligger utanför zonens innehåll, ovanför överkanten, i båda lägena — prototyperna la det innanför, där ett kort i zonens övre vänstra hörn döljer det.

Avvikelser från prototyperna som är avsiktliga och står kvar:
Händerna ritas som solfjädrar även i TV-läge, fast variant C inte ritade några: utan dem säger bilden inte var någon sitter, och eftersom docken redan säger namnen bär solfjädern där bara antalet.
Avatarens initial står i mörk text på platsens färg, inte i ljus som prototypen, eftersom ljus text på gult och grönt inte går att läsa på avstånd.
Versionen är projektets revision (`rev-n`), inte prototypens påhittade "v0.7".
Kortens yta är texturen (E2), inte prototypens färg per kortnamn; utan renderade texturer visas väntetillståndet från #10.
Kameran ramar in det som är i spel och beskär därför bordets kant (C5), vilket den fasta prototypbilden aldrig gjorde; genom ett kort skär den däremot aldrig.

Reviderat 2026-09-07 (andra genomgången sida vid sida, #20):
Platsernas färger följer prototyperna i deras ordning — röd, blå, grön, gul — och inte en egen.
Färgen är platsens identitet överallt (hand, markör, dock, flöde), så ordningen i paletten är beslutet och inte en detalj i docken.
Filten i bordsläge håller prototyp B:s proportion i stället för att fylla ramen: marginalen är 0,16 av ramens kortare sida, vilket ger 0,85 av naturlig storlek på en skärm på 1600 × 1000 — skalan B godkändes i — och samma proportion på varje annan skärm.
Den fasta marginalen i pixlar som fanns dessförinnan gav bordet nästan hela skärmen på en stor skärm och trängde undan det mörka omlandet som B lever av.
INSPEKTION:s väntetext ligger överst i det tomma kortet som i prototyp C, inte mitt i det, där den läses som ett kort som inte gick att ladda.
Kameran skär inte längre genom ett kort som ligger utanför filten; beslutet och dess skäl står under C5.

Referensprototypen `packages/web/src/prototype/table-ref` togs bort när den hade svarat.

### K10. Telefonvyns utseende: remsan (prototypat 2026-09-06)

Tre prototyper: remsan, ett kort i taget i fullskärm, och minibord med brickor plus handen i rutnät.
Valet blev remsan, som K4 beslutat: stora kort i horisontell remsa nederst där tummen är; tryck inspekterar i fullstorlek; dra upp öppnar ett ark med zongenvägarna ur setup (C4), golvet sist som "Bordet"; håll väljer flera, och flera valda spelas som ett atomiskt kuvert (K3).
Mitten är den kollapsade bordsöversikten — zoner med antal och senaste-flödet — som C4:s "fäll ut bordet" i minsta format.

Följdkrav:
Zonernas namn är genvägarnas etiketter; ett spel med zoner som heter "Zon 3" får obegripliga knappar (B5).
Platsen claimas med namnet ur länken vid första anslutning om den är ledig; annars visas den som sitter där.

### K11. Att spela ett kort vänder det upp om målet är publikt (2026-09-06)

Zongenvägen skickar `move` och `flip` till framsidan som ett kuvert när målzonen är publik, och enbart `move` när målet är en dold hög.
Det är vad handen gör fysiskt, och det är en affordance, inte en regel — kortet kan vändas tillbaka.

Följdkrav:
Spel med "spela nedvänt" som mekanik behöver ett andra val i arket.

### K12. Anslutningsflödet: bordet som platsväljare med nästa lediga förvald (prototypat 2026-09-06)

QR-koden i TV-läget pekar på `/join?code=…` (från 2026-09-07 en rumskod, DRIFT §9).
Telefonen ser platserna live genom lobbyrollen — upptagna med namn, lediga tryckbara — runt ett litet bord vars kanter följer setupens handzoner, med nästa lediga plats förvald.
Namn plus "Sätt dig" köper en token för platsen och leder till `/play`, som claimar platsen.

Motivering:
I bordsläge betyder platsen något — den avgör vilken kant handen orienteras mot — så valet ska vara rumsligt.
På distans betyder den inget, så förvalet gör det till en gest.

Följdkrav:
Snapshot saknar spelets namn; lobbyn visar rumskoden i stället. Spelets namn hör hemma i snapshot.

### K13. Ångra och tillbakaspolning: förhandsvisning på bordet, beslut på telefonerna (prototypat 2026-09-06)

C6 gav principen; det här är hur den blir konkret.
En tillbakaspolning är en ny loggrad vars resultat bär det återställda bordet, så loggen förblir append-only och återspelbar.
Dolda högar som tappat kort sedan målet blandas om med nya id:n; publika högar behåller sin ordning.
Platser, version och setup är sessionens och rörs inte av en tillbakaspolning.

Telefonens "Ångra" är ett tryck.
Är ingen annan inblandad tar det tillbaka platsens senaste batch (`undo.self`).
Har någon annan spelat sedan dess skickas i stället ett förslag till samma punkt (`rewind.propose`).
Servern talar om vad ångra betyder just nu per plats i snapshoten (`undo: { toSeq, contested } | null`), så klienten räknar inget ur loggen.

Under ett förslag visar bordsskärmen hur bordet såg ut vid målet, projicerat per vy, med ram och etikett om vem som väntas på.
Skärmen har inga knappar: en TV har ingen fjärr, och flödet blir detsamma på distans.
Övriga telefoner får en helskärmsfråga med Godkänn/Neka; förslagsställaren kan dra tillbaka.
Att sitta ner, lämna, föreslå eller avvisa är inte drag: de ångras inte och kontesterar ingen.

Följdkrav:
Ett nytt sessionsverb, `rewind.reject`, för att avvisa eller dra tillbaka ett förslag.
Kuvert-id blir loggens batch och måste vara unikt per session, inte per anslutning; motorn avvisar ett återanvänt id.
Aktören håller sin logg i minnet för att kunna se bakåt.
Utan andra sittande kan ett kontesterat förslag bara dras tillbaka; bordsskärmen får aldrig bekräfta.

### K14. Bordet spelas direkt: dra, släpp, håll för en ring med verb (prototypat 2026-09-06)

K1 och K2 gav reglerna; det här är hur handen gör dem.
Lösa kort, översta kortet i en hög och hela högen (i etiketten) dras med pekare eller finger.
Släpp på ett löst kort staplar, på en hög lägger överst, i en zonrektangel flyttar dit, annars fri placering på golvet.
Översta kortet ur en hög går samma väg som en `split`; en hel hög som `movePile`.
Bordsskärmen agerar som bordet (plats null): den som står vid den handlar för gruppen.

Det en dragning inte kan säga nås genom att hålla på kort eller hög: en ring med verb öppnas runt fingret, man glider till ett och släpper.
Kort: Vänd, Vrid, Titta, Avslöja.
Hög: Blanda, Dra 1, Dela på hälften, Vänd översta, Titta.
K8:s håll-för-att-titta är "Titta" i ringen.
Ingen markering finns på bordet; flerval hör till telefonen (K4).

Motivering:
Samma gester fungerar med finger på en TV-platta och mus på distans, kräver inget tillstånd och lämnar bordet rent.
En verktygsrad förutsätter en markering, som på ett delat bord är någons och ingens.

Följdkrav:
Bordsläget lutar bordet (`rotateX` under perspektiv), så pekaren projiceras exakt tillbaka på bordsplanet; matten ligger i `geometry.ts` med test.
Att dra översta kortet ur en dold hög och släppa det på ett löst kort, och att vända översta kortet i en dold hög, gick först inte: tråden ger inget id. Löst i K15 genom att högen adresseras i stället för kortet.
Under ett tillbakaspolningsförslag (K13) är bordet inte spelbart.

### K15. Högens topp som adress: `stack` och `flip` tar `{ top: hög }` (2026-09-06)

`component` i `stack` och `flip` är antingen ett komponent-id eller `{ top: ZoneId }`: översta kortet i den högen, upplöst av motorn när raden appliceras.
Det stänger K14:s två luckor utan nytt verb: att stapla en dold högs topp på ett löst kort och att vända den.
Bordet använder alltid högformen när källan är en hög, även för publika högar.

Ett uppvänt kort överst i en hög ses av alla, oavsett högens synlighet.
Zonvyn i count-läge namnger då toppen i `top`, och kortet finns i `components` som vanligt.
Täcks det av ett nedvänt kort eller vänds ner försvinner det igen; dras det in i en hand följer ingen kunskap med (B6).

Motivering:
Samma fysiska handling ska inte bli två verb för att adressen skiljer sig; vokabuläret räknar handlingar, inte sätt att peka.
En dold hög ska fortsätta vara en räkning och inget annat på tråden — id:n för dolda kort får aldrig lämna servern, så adressen måste vara högen.
Att toppen syns när den ligger uppvänd är vad en fysisk lek visar: utan den regeln vore vändningen meningslös.

Följdkrav:
Gamla loggrader parsar oförändrade; korpusen har en skriptad session med högformen.
Synlighetsoraklet i motorns test känner den fjärde rätten: uppvänd överst i en hög.
`peek`, `reveal` och `rotate` tar fortfarande bara id; att ge dem högformen är ett nytt beslut om det behövs.

---

## L. Editorn (grillad 2026-09-06)

E1, E2 och E3 gav principerna; det här är hur de blir konkreta.

### L1. Mallen är en begränsad elementmodell som kompileras till HTML/CSS

Mallen är ett träd av typade element: textruta, bildyta, ikonrad, form, grupp, villkor.
Varje element har position, storlek och stil ur en fast palett av egenskaper.
Kompilatorn producerar HTML/CSS för DOM, textur och tryck — samma väg, enligt E2.
Ingen rå-CSS-lucka.

Motivering:
Fysisk validering måste veta vad som är text, textanpassning måste veta vilka rutor som får krympa, och wizarden måste kunna generera en mall.
Inget av det går mot fri HTML.

Följdkrav:
Allt en designer vill göra måste finnas som element eller egenskap — en önskelista som förvaltas för evigt.
Mallen är data som versioneras, diffas och migreras.

### L2. Inline-syntax i korttext: fyra konstruktioner

`**fet**`, `*kursiv*`, `{ikon}`, blankrad för stycke.
Ingen HTML, inga länkar, inga rubriker.
`{namn}` slås upp i projektets ikonuppsättning, som fylls från CC0-biblioteket eller egna uppladdningar.
Okänt ikonnamn renderas som synlig varning, aldrig som tomhet.
Ett rent tal i klamrar, `{2}`, renderas som en pip — talet i en cirkel i textens färg — utan varning; finns en ikon med det namnet i uppsättningen vinner ikonen (tillägg 2026-09-06).

Följdkrav:
Parsern är liten och kan aldrig producera farlig HTML.
Valideringen ser text och ikoner som separata saker.
Tabeller och färgad text i en cell finns inte — det löses med mallens element.

### L3. Varianter valda av en kolumn plus villkorade element, inga fria undantag

Mallen har en bas och namngivna varianter som ärver och skriver över element.
En kolumn väljer variant per rad.
Varje element kan vara villkorat på att ett fält är ifyllt eller har ett visst värde.
Ett kort kan aldrig avvika utanför sin variant.
Ett kolumnvärde utan variant av det namnet ger basutseendet utan varning — de flesta kort är bas (tillägg 2026-09-06).

Motivering:
Fria undantag per kort är där mall-och-data-modellen brukar dö: när 30 av 200 kort avviker finns ingen mall längre.
Promokortet blir en variant med ett kort i, vilket är ärligt.

Byggt 2026-09-07 (prototypat i tre varianter, godkänd variant A med variant C:s dragbara lagerpanel — #18):
Mallen redigeras på duken, inte i sifferfält.
En verktygsrad till vänster lägger till text, bild, ikonrad och form; det nya elementet hamnar mitt på kortet, blir markerat och bundet till lekens första fält.
Elementen flyttas med pekaren — pointer capture och `touch-action: none`, så att pekplatta och pekskärm flyttar elementet i stället för att rulla duken — och storleksändras med handtag i kortets fyra hörn.
Piltangenterna flyttar 0,5 mm och med shift 5 mm; de ignoreras när fokus ligger i ett fält och när en lista redan har svarat på tangenten. Delete och backsteg tar bort det markerade elementet.
Hjälplinjer visas mot andra elements kanter och kortets mitt, och det som hamnar närmare än en millimeter snäpper dit.
Rutnätet från variant C finns som ett valfritt lager, av som standard, och är något att se efter — det snäpper inte, för ett rutnät på en millimeter skulle ta ifrån en halvmillimetersjustering.
Duken renderar fortfarande genom `CardPreview` och kompilatorn (E2): lagret som tar pekaren ligger ovanpå kortet i kortets egna millimeter och ritar inget kortinnehåll.
Lagerordningen ändras genom att dra en rad i panelen och, eftersom en lista som bara kan dras är en lista tangentbordet har förlorat, med Alt och piltangent.
Prototypen `packages/web/src/prototype/canvas` togs bort när den hade svarat.

Byggt 2026-09-07 (prototypat i tre varianter, godkänd variant A med variant B:s regellista som sammanfattning — #13):
En grupp är en regel på en kolumn, aldrig en lista med kort-id:n.
Kolumnen är `variantBy` och gruppens namn är kolumnens värde, alltså precis den modell L3 redan beskriver — kompilatorn behövde inga nya begrepp.
Kolumnen väljs en gång för hela leken och sätts på varje ansikte, så att en grupp är en sak med både fram- och baksida (L7) och inte en regel per sida.
Grupperna är kolumnens värden: ett nytt kort med värdet får gruppens utseende utan att någon rör mallen, och en grupp vars kort försvunnit finns kvar så länge mallen har ritat den.
Duken får en flik per grupp plus "Bas (alla)"; det som ändras med en gruppflik vald blir gruppens `override` på det ansiktet, det som tas bort blir gruppens `remove`, och "Återgå till basen" tar bort båda.
Lagerordningen är basens och delas av alla grupper — den ändras därför bara med basfliken vald.
Lagerpanelen säger per lager om det är basens eller gruppens och hur många kort gruppen gäller; variant B:s regellista står kvar som sammanfattning i samma panel.
Variant C valdes bort som redigeringsväg — tjugo fällor skulle kräva tjugo val — men tabellen visar vilken grupp en rad faller i, läsbart och inte redigerbart.
Prototypen `packages/web/src/prototype/groups` står kvar tills #14 har svarat.

### L4. Datatabellen: kolumntyper från registryt, systemkolumn `antal`

Kolumntyper följer typregistryts `editorSchema`: text, tal, bild, boolean.
En bildcell är en referens till en innehållsadresserad asset; vid import löses URL eller filnamn upp mot uppladdade filer.
Varje rad har en systemkolumn `antal` med standard 1.
Setup skapar så många instanser med samma `cardRef`; tryckmanifestet summerar.

Följdkrav:
`cardRef` är en rad, inte ett fysiskt kort.
"Vilket av de tre" finns bara som instans-id i loggen.

Byggt 2026-09-07 (prototypat i tre varianter, godkänd variant A — kalkylarket):
Rubrikerna sorterar (#15), ett sökfält över alla fält plus chips för lekens egen kategorikolumn filtrerar (#16), och kryssrutor per rad och i rubriken markerar för en åtgärdsrad som visas först när något är markerat (#17).
Sortering, filter och markering är vyer av projektet: de rör aldrig `doc.rows`.
Markeringen mäts mot skärmen — "markera alla synliga" betyder de rader filtret släpper fram, och ett kort som filtret tar bort släpps ur markeringen och kommer inte tillbaka när frågan tas tillbaka, så en borttagning aldrig kan träffa ett kort ingen har sett.
Åtgärderna (ta bort med bekräftelse som säger antalet, duplicera, sätt en kolumn, ändra antal) går som en enda ny radlista genom `replaceRows`, alltså en ändring i historiken som sparas och ångras som varje annan.
Prototypen `packages/web/src/prototype/datatable` togs bort när den hade svarat.

### L5. Editor till bord: uttrycklig knapp, förrenderade texturer

Editorn har en knapp, "Uppdatera bordet", som startar ett bord från projektet eller skickar `version.change` till det bord den startat.
Bytet är atomiskt för spelarna: knappen köar först den nya revisionens texturer (`POST /sessions/:id/prepare`), visar "renderar kort n/m", och skickar bytet först när alla är renderade (byggt 2026-09-06).
Ett nystartat bord får sin länk först när dess texturer är klara (`GET /sessions/:id/textures`).
Telefonens hand och inspektion visar samma texturer som bordet; saknas en texturs hash visas namnet på färg.
Bordet visar att en nyare version finns.

Motivering:
Varje tangenttryck som versionsbyte skulle fragmentera loggen och få kort att flimra.
Loggen ska få ett segment per medvetet beslut.

Byggt 2026-09-07 (prototypat i tre varianter, godkänd variant A med B:s meny som snabbväg):
Editorn har en fjärde flik, "Bord", som listar spelets alla bord — miniatyr, vilken version bordet kör, vem som sitter och tittar på, när det senast rörde sig — och vägarna in: TV-vyn, bordsläget, spela härifrån (`/online`), titta på (`/observe`) och QR-koden telefonerna läser.
Flera bord per spel är verkligheten så fort man testat två gånger, vilket är varför fliken och inte "det senaste bordet" blev hemmet för dem; en statusrad längst ner (variant C) valdes bort för att den stjäl höjd från duken på mallfliken.
Från de andra flikarna når man samma sak genom en pil bredvid "Uppdatera bordet" som fäller ut det nyaste bordets rad, alltså samma komponent och inte en andra beskrivning av bordet.
Listan är serverns svar: `GET /projects/:id/sessions` säger vilka sessioner som startats ur projektet, med versionen aktören faktiskt kör och om loggen är låst.
Miniatyren är bordet ritat av bordsrenderaren ur den snapshot TV:n läser, genom en vanlig seat-lös anslutning — inte en egen ritväg (K9) — så en rad som spelas rör sig i listan medan man tittar.
Ett bord som projektet har lämnat efter sig märks med "ligger efter rev-n" (C7); ett avslutat bord säger "avslutat", tappar vägarna som sätter någon vid det och märks aldrig som efter, eftersom en låst logg inte kan uppdateras (C9).
"Avsluta bordet" frågar först i en `alertdialog` som namnger bordet, tar och lämnar tillbaka fokus och svarar på Escape, och skickar sedan `session.end` över radens egen anslutning — samma väg som telefonens avslut.
Prototypen `packages/web/src/prototype/editor-nav` togs bort när den hade svarat.

### L6. Wizardens steg: namn, spelare, fält, ram, data, spela

Spelets namn.
Antal spelare, vilket ger platser och händer.
Vilka fält korten har, med förslag som titel, kostnad, text, bild.
Kortram ur ett galleri, som binder fälten automatiskt.
Data: klistra in CSV, importera fil, eller fem tomma rader.
Direkt till ett bord med standardzoner.

Motivering:
Fält före ram gör att ramen kan bindas utan manuell mappning; data sist landar i en färdig struktur.

Villkoren från E3 gäller: wizarden skapar samma domänobjekt som editorn, och importen är ett steg i den.

Utseende (prototypat och reviderat 2026-09-06): allt på en sida. Ramgalleriet i steg 4 är den vanliga livepreviewn — fält blir rutor och ram blir utseende. I datasteget kan den som bygger många kort frivilligt öppna en kompakt stor previewspalt med huvudkort och miniatyrer; den är stängd som standard så att formuläret behåller sin bredd.
Tre ramar i galleriet binder fälten automatiskt och utelämnar rutor för fält spelet saknar.
Slutar med "Öppna bordet" och "Till editorn".

### L7. Baksidan är en egen mall per sida

Typregistryts `faces` ger en mall per sida.
Baksidan är en vanlig elementmall, oftast med en bild och utan bindningar, men kan ha bindningar och väljas per variant.

Följdkrav:
En baksida med bindningar ger unik textur per kort även bak och fördubblar renderjobben — editorn varnar när det sker.

Byggt 2026-09-07 (#13):
Mallfliken har en fram-/baksideväxel, så att baksidan redigeras med samma duk, samma lagerpanel och samma verktyg som framsidan.
Växeln är en radiogrupp med rovande tabindex: hela växeln är ett tabstopp och pilarna både flyttar och väljer.
En grupp kan skriva över element på båda ansiktena; det som inte skrivs över ärvs från basen, vilket är det som gör en särskild baksida per grupp möjlig (#14).

### L8. Editorns utseende: kortväggen som hem, duken för mallen, tabellen som flik (prototypat 2026-09-06)

Tre prototyper: trepanel, kalkylbladet först, och kortväggen.
Valet blev kortväggen som startvy — hela leken renderad, antal och varningar per kort — med den stora duken (lager, valbara element, egenskaper) för mallarbete och tabellen som flik för massredigering.
Förhandsvisningen går genom `compile` och `fitInDocument` i DOM: samma kod som renderaren, så editorn visar vad trycket blir (E2).

Följdkrav som prototypen avslöjade och som nu är införda:
Kompilatorn har ett `scope`-alternativ så att många kort kan dela sida.
Ett rent tal i klamrar är en pip (L2).
Projekt är revisionerade dokument på servern med optimistisk samtidighet tills projektaktören (D3) finns; "uppdatera bordet" startar ett bord ur projektet (L5).

---

## I. Öppna frågor

Ekonomi och juridik:
Moms, tull och leveransvillkor för fysiska varor till EU-kunder från amerikansk eller asiatisk partner — DDP eller DDU, vem står för tullavgiften, IOSS-registrering.
Prisnivåernas exakta tak och gratisnivåns gränser.
GDPR för gästdeltagare, särskilt enkätsvar och flaggor från personer utan konto.
Fontlicensiering, som krockar med kravet i B3 att behålla fontfiler permanent.

Teknik:
Aktivitetsflödet vid anslutning: löst 2026-09-07, snapshoten bär de senaste femtio raderna, se K9.
Behörighetsroller i detalj: ägare, medredigerare, testledare, observatör.
Tillgänglighet i verktyget självt, till skillnad från i de spel som skapas i det.

Spelupplevelse, kvar efter avsnitt K:
Hur en hög i en area visas med blandad orientering av kort.
Om zonrektanglar ska kunna överlappa, och vad ett släpp i överlappet betyder.

---

## J. Ett mönster värt att bära med sig

Fyra beslut gick emot rekommendationen: enbart POD, ingen inbyggd röst, kostnadsbesked först i kassan, och inga fysiska playtests i mätningen.
Var för sig är alla fyra försvarbara.
Tillsammans skär de bort kopplingarna mellan pelarna.
Resultatet är tre bra verktyg bredvid varandra snarare än en sluten slinga, och slingan var den ursprungliga säljpunkten.
Detta är en observation, inte en invändning — men det är den axel produkten kan komma att behöva omprövas längs.
