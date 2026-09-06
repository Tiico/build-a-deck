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

### C9. Livscykel: persistenta bord med uttrycklig avslutning (fråga 25)

Tillståndet överlever att alla kopplar ner, så gruppen kan återuppta med samma ställning och samma platser.
Ett uttryckligt avslut låser loggen, bokför versionen och triggar enkäten.
En timeout avslutar åt dem som glömmer.

Följdkrav:
Tappad anslutning håller platsen.
En spelare som lämnar för gott lämnar en tom plats med dolda kort i sig — att frigöra platsen blandar tillbaka korten i rätt hög, konsistent med C6.
Övergivna bord måste städas automatiskt.

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
Migreringsstrategin är fortfarande en öppen fråga.

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
CSV-import bör ligga inuti wizarden som ett steg, inte som en konkurrerande ingång.
Ingen levande tvåvägssynk mot Google Sheets — import och ominport med diff, eftersom synk ger två sanningskällor och krockar med oföränderlig historik och samredigering.

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
Missbruk av öppna rumskoder måste hanteras — fortfarande öppen fråga.

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

### K7. Inget ljud

Inga ljud, ingen haptik, inga notiser.

Konsekvens att vara medveten om:
På distans är ljudet den enda signalen att något hände utanför blickfånget; utan det bär markörerna i K6 hela den bördan.

### K8. Inspektion: håll för att förstora

Tryck-och-håll på ett kort visar det i full upplösning ovanpå bordet, bara för den som håller.
Ett dolt kort förstoras som baksida — samma ansiktsanrop som texturen, ingen ny synlighetsregel.
Förstoringen är privat; "titta på det här" är peka-gesten i K6.

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

Följdkrav:
Parsern är liten och kan aldrig producera farlig HTML.
Valideringen ser text och ikoner som separata saker.
Tabeller och färgad text i en cell finns inte — det löses med mallens element.

### L3. Varianter valda av en kolumn plus villkorade element, inga fria undantag

Mallen har en bas och namngivna varianter som ärver och skriver över element.
En kolumn väljer variant per rad.
Varje element kan vara villkorat på att ett fält är ifyllt eller har ett visst värde.
Ett kort kan aldrig avvika utanför sin variant.

Motivering:
Fria undantag per kort är där mall-och-data-modellen brukar dö: när 30 av 200 kort avviker finns ingen mall längre.
Promokortet blir en variant med ett kort i, vilket är ärligt.

### L4. Datatabellen: kolumntyper från registryt, systemkolumn `antal`

Kolumntyper följer typregistryts `editorSchema`: text, tal, bild, boolean.
En bildcell är en referens till en innehållsadresserad asset; vid import löses URL eller filnamn upp mot uppladdade filer.
Varje rad har en systemkolumn `antal` med standard 1.
Setup skapar så många instanser med samma `cardRef`; tryckmanifestet summerar.

Följdkrav:
`cardRef` är en rad, inte ett fysiskt kort.
"Vilket av de tre" finns bara som instans-id i loggen.

### L5. Editor till bord: uttrycklig knapp, förrenderade texturer

Editorn visar vilka bord som kör en äldre version och en knapp som skickar `version.change`.
Knappen är inaktiv tills texturerna för den nya versionen är renderade, så bytet är atomiskt för spelarna.
Bordet visar att en nyare version finns.

Motivering:
Varje tangenttryck som versionsbyte skulle fragmentera loggen och få kort att flimra.
Loggen ska få ett segment per medvetet beslut.

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

### L7. Baksidan är en egen mall per sida

Typregistryts `faces` ger en mall per sida.
Baksidan är en vanlig elementmall, oftast med en bild och utan bindningar, men kan ha bindningar och väljas per variant.

Följdkrav:
En baksida med bindningar ger unik textur per kort även bak och fördubblar renderjobben — editorn varnar när det sker.

---

## I. Öppna frågor

Ekonomi och juridik:
Moms, tull och leveransvillkor för fysiska varor till EU-kunder från amerikansk eller asiatisk partner — DDP eller DDU, vem står för tullavgiften, IOSS-registrering.
Prisnivåernas exakta tak och gratisnivåns gränser.
GDPR för gästdeltagare, särskilt enkätsvar och flaggor från personer utan konto.
Fontlicensiering, som krockar med kravet i B3 att behålla fontfiler permanent.

Teknik:
Migreringsstrategi för händelseschemat — riktning beslutad i DRIFT.md avsnitt 7 (`schemaVersion` på varje rad, upcasters vid inläsning), detaljer kvar.
Behörighetsroller i detalj: ägare, medredigerare, testledare, observatör.
Hantering av missbruk av öppna rumskoder.
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
