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

Byggt 2026-09-08:
Ingen i18n-motor. Behovet är en uppslagning och en insättning, så infrastrukturen är en katalog per språk, en `translate`, och en React-kontext som säger vilket språk som är på.
Svenska är katalogen: varje text skrivs där först, och engelskan skrivs mot den nyckel för nyckel. Katalogens typ är löftet — en nyckel som saknas i ett språk kompilerar inte, och en text som saknas vid körning visar svenskan i stället för en nyckel.
Katalogen är delad per yta — editorn, spelandet, kontot — så att flera kan skriva i den samtidigt utan att mötas, och slås ihop till en.
Nyckeln säger var texten hör hemma, inte vad den råkar heta: `editor.tab.wall`, aldrig `kortvagg`. `{namn}` byts mot det anropet skickar med. Räkneord har `.one` och `.other` och anropet väljer vilken; en plural-motor vore mer maskineri än de två språken kräver.
En yta som monteras ensam — en förhandsvisning, ett test — talar svenska. Hela appen ligger under en språkleverantör som tar läsarens eget val först, sedan adressens `?lang=`, sedan webbläsarens. Valet minns till nästa besök, och ett val skriver också `lang` på sidan självt, eftersom uppläsning läser sidan på det språk sidan säger sig vara på. En webbläsare som vägrar lagra något byter ändå språk; den glömmer bara.
Det verktyget säger översätts. Det en designer skrivit — korttext, regler, zonnamn, spelets namn — översätts aldrig: det är spelets språk, inte verktygets.
Mejlen följer med: inloggningslänken och inbjudan skrivs på det språk den som utlöste dem läser verktyget i, och ett språk verktyget inte talar är inget fel — då går brevet på svenska.
Gränsen mellan verktygets ord och designerns går vid vem som äger ordet efteråt, inte vid vem som skrev det först. Det verktyget föreslår när ett spel skapas — fältnamnen, exempelkortets titel, räknaren, zonerna receptet lägger ut, en symbol som tas in ur biblioteket — skrivs på designerns språk och blir sedan deras. Det som redan står i dokumentet rörs aldrig: en zon behåller sitt namn när receptet vrids om, och ett spel byter inte språk för att någon annan öppnar det.
Symbolbiblioteket är verktygets, så det söks och läses på läsarens språk; namnet den tar in är det designern såg.
Den fysiska kontrollen (E5) mäter och lämnar ifrån sig siffrorna, inte meningen: felet bär `code`, `severity` och `values`, och orden sätts där de läses. Samma sak går ut över tråden vid en tryckorder, så den som tar emot den skriver den på sitt språk.
En engelsk mening är längre än en svensk, och det är layouten som får veta det: filtens namn under högar, zoner och räknare göms när filten är telefonsmal, och raden längst ner på filten är en rad — namnet viker undan i stället för att växa över knapparna.

Ordlistan, 2026-09-09:
Ett begrepp, ett ord.
Katalogen kallade formgivarens spel för både `spelet` och `projektet`, och bordet för både `bordet` och `sessionen` — kodens egna ord, läckta ut i läsarens text.
Att texterna var översatta hjälpte inte: samma inkonsekvens fanns på båda språken.

| Begrepp | Ordet | Utgår |
| --- | --- | --- |
| Formgivarens spel | `spelet` | `projekt`, `projektet` |
| Korten i spelet | `leken` | — |
| Ytan man spelar på | `bordet` | `rummet`, `sessionen` |
| Koden telefonen skriver in | `rumskod` | — |
| Biblioteket med symboler, ramar och färgblock | `symbol` | — |
| Den lilla bilden i en korttext eller på duken | `ikon` | — |

`leken` är inte spelet, och står därför kvar.
En lek är korten, ett spel är det designade spelet, och båda språken höll redan skillnaden: `Ta bort {n} kort ur leken?` mot `Remove {n} card from the deck?`.
Ett ord som bär sitt eget begrepp är inte en avvikelse bara för att det finns flera ord i närheten.
`sessionen` är motorns ord. Det stannar i loggen, i koden och i exporten och står inte i läsarens text.
Att koden och API:t säger `project` är medvetet och rörs inte: koden är kodens språk.
`rumskod` står kvar därför att koden är ett eget begrepp och inte bordet (K12); den skrivs in på en telefon och hör till vägen in.
Biblioteket heter `symbol` därför att det rymmer mer än ikoner — också platshållarramar och färgblock. `ikon` är den enskilda bilden, och det ordet står där en sätts: i tabellcellen och på duken.

Ordlistan gäller strängarnas värden, inte koden runt dem.
En kommentar får kalla saker vad den vill; det är läsarens text som ska vara enhetlig.

Knappform: verb, plus objekt när sammanhanget inte säger vad.
"Spara" där det är tydligt, "Uppdatera bordet" där det inte är det.
Det är en bedömning och inte en mekanisk regel, så inget test kan låsa den.

Skiljetecken: punkt i hela meningar, också i live-regioner, där en uppläsning behöver pausen.
Ingen punkt i fragment: knappar, etiketter, flikar, rubriker.
Det går att låsa: en knapps eller etiketts text slutar inte på punkt.

Rösterna i `status/notice.ts` är avsiktliga och plattas inte ut: bordet dukar, telefonen hämtar en hand, editorn öppnar spelet.
Det är samma tillstånd sagt i den yta läsaren står i, och det är hela poängen med dem.
Vad ordlistan tar bort är de oavsiktliga varianterna — fyra olika sätt att säga att något laddas.

Utanför ordlistan står spelets egna ord: fältnamn, symbolnamn, zonnamn, kortnamn, och allt en formgivare skrivit.
Gränsen är A4:s egen: verktyget talar läsarens språk, spelet sitt eget.

Den andra stammen, 2026-09-09:
De nio delade tillstånden (#12, #7), rummen och frågorna innan arbete går förlorat växte fram vid sidan av katalogen och slogs ihop med den i `0c8cd71`.
De texter som kom in utan konflikt stod kvar på svenska i koden och följde alltså inte språkväljaren.
De går nu genom katalogen som allt annat: `packages/web/src/i18n/sv.status.ts` bär tillstånden, flikens namn och vad bordet vägrar med; resten flyttade in i de kataloger ytorna redan hade.
Tillstånden hade också missat ordlistan: bordet hette `rummet` i tre av fyra röster och i fliken. Det heter `bordet` nu, på båda språken.
Tangentbordets verb är ringens och delar nycklar med den — `ring.flip`, `ring.shuffle`, `ring.half` — eftersom tangentbordet säger exakt de verb pekdonet säger och aldrig ett nytt.
`Question` har inget svenskt standardsvar kvar: en fråga som inte namnger sitt trygga svar får katalogens ord på läsarens språk.

Två fall på gränsen, avgjorda:

Nyckeln ett nytt fält får i wizarden (`bild2`, `värde3`) byter *inte* språk med läsaren.
En nyckel är en identifierare i dokumentet, inte en text, och två personer som trycker på samma knapp måste få samma kolumn — annars binder en mall `bild2` för den ena och `image2` för den andra.
Att de fyra nycklar wizarden redan lägger ut heter `title`, `cost`, `body` och `art` på en svensk yta är samma beslut, taget tidigare.
Det verktyget föreslår vid skapandet och sedan lämnar ifrån sig är *etiketten*, och den skrivs på formgivarens språk och fryses där.

Namnet en redigerare utan konto visas som för de andra (D3) skrivs på det språk den som kommer in läser verktyget i, och blir sedan hennes.
Det kan inte följa varje läsare: namnet går över tråden en gång, vid uppkopplingen, och läses av alla andra i spelet.
Ett namn tillhör den det namnger — samma gräns som gör att den som skriver in sitt namn vid ett bord får stå som hon skrev det.
Att byta språk mitt i döper därför inte om någon som redan är inne.

Filnamnet, 2026-09-10:

Namnet på filen tabellen exporterar (`skogens-herrar-kort.csv`) är två ord i ett, och gränsen går rakt igenom det.
Spelets eget namn är spelets: det viks bara ihop till något ett filsystem bär och översätts aldrig.
Att vika ihop är inte att skriva om.
Bokstäver och siffror står kvar i vilket skriftsystem de än är skrivna i — innehållsspråket är obegränsat, så `森の王` exporteras som `森の王-kort.csv` — och det som faller bort är bara det en sökväg kan byggas av: avgränsare, punkter, mellanslag.
Ett filnamn rymmer 255 byte, inte 255 tecken, och ett namn som är längre klipps av räknat i byte, mellan bokstäver och aldrig genom en.
Ordet verktyget lägger till om filen — `kort`, och `spel` när spelets namn inte lämnar något kvar att bygga ett filnamn av — är verktygets, och följer läsaren som allt annat verktyget säger.
En engelsk läsare får alltså `skogens-herrar-cards.csv`, och ett namnlöst spel `game-cards.csv`.
Det är samma gräns som i de två fallen ovan, sedd från andra hållet: där var det verktyget lämnar ifrån sig formgivarens, här är det verktyget behåller sitt eget.

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

Typsnitten, byggt 2026-09-08:
Ett spel namnger sina typsnitt själv: en familj i dokumentet är en CSS-stack och, när designern laddat upp en fil, en asset (E1) som versionen därmed pinnar.
Filen laddas upp dit varje annan asset går, `POST /assets`, och namnges av sitt innehåll. Formaten är de Chromium kan rita ur ett `@font-face`: woff2, woff, ttf och otf. Allt annat avvisas.
Kompilatorn skriver ett `@font-face` för varje familj som både har en fil och används av mallen, och aldrig för en som inte används: en fil som ingen sätter text i följer inte med kortet.
Servern löser en familjs asset till bytes innan den kompilerar, eftersom renderarens webbläsare varken har session eller kaka att hämta med. Editorn löser samma familj till `/assets/<hash>`, så förhandsvisningen visar det som kommer att tryckas.
En familj utan fil är ett varsel i den fysiska kontrollen (E5): "följer inte med spelet — trycket kan bli ett annat typsnitt än det du ser". Ett varsel per kort, med familjerna uppräknade, eftersom fyrtio element i samma typsnitt är ett misstag.
Typsnittet väljs där elementet ritas, i mallens egenskapspanel, och familjerna spelet har står under den: vilka som följer med, vad de är lånade under, och en väg in för en fil till. Ett typsnitt som ingen text är satt i går att ta bort; ett som används har ingen sådan knapp.
Licensen står inte i filen — bara designern vet den — så den anges bredvid familjen och följer med i tryckordern precis som en symbols licens (E4). Båda halvorna behövs: en licens utan upphovsperson krediterar ingen.
Inga typsnittsfiler följer med produkten: verktyget levererar ingen tredjepartsfont, det pinnar bara den designern själv har rätt att använda. Frågan i I står kvar.

### B4. Versionering: automatisk oföränderlig historik plus namngivna milstolpar (fråga 13)

Varje redigering läggs till i en oföränderlig historik.
En session låses vid start till exakt det tillståndet.
Användaren behöver aldrig committa, men kan namnge de versioner som betyder något.
Diff mellan versioner visas som förändringar i korttabellen.

Följdkrav:
Assets måste vara innehållsadresserade, annars sväller lagringen ohållbart.
Historiken måste presenteras utan att lära ut git.

Byggt 2026-09-08:
Varje sparning lägger till en version som behålls hel och aldrig skrivs om, i minnet och i Postgres (`project_versions`). En version kan namnges, öppnas och jämföras.
Diffen är den korttabellen visar: kort tillagda, borttagna och ändrade med fältet som rörde sig och vad det rörde sig från. Lekens ordning är en egen sorts ändring, och mall, uppställning och symboler nämns som ändrade utan att stavas ut — en diff av ett elementträd är en diff för en maskin.
Diffen ligger i `packages/server` men exporteras på egen väg (`@byd/server/diff`), så editorn kan använda den utan att dra in servern i webbläsaren.
Ytan prototypades i tre former: en lista med versioner, skillnaden i korttabellen, och en remsa att dra leken genom. Valet blev listan plus skillnaden i tabellen.
Historiken öppnas från revisionsnumret i editorns huvud, där versionen redan står namngiven. Panelen listar versionerna med datum, namn och — när en rad öppnas — vad den ändrade i ord. Vad en version ändrade hämtas först när raden öppnas; en lång historia ska inte vara en lång väntan på något ingen tittade på.
Att ta tillbaka en äldre version är en redigering som vilken annan: den blir nästa version när den sparas, och den den kom från står kvar orörd.
"Jämför med den här i tabellen" öppnar Tabell-fliken hållen mot den versionen: det gamla värdet överstruket i cellen, tillagda och borttagna rader tonade, och de borttagna korten kvar sist så att de går att se alls.
Revisionsknappen blev editorns första tabbstopp, före fliklistan. Det är avsiktligt: den står där versionen står, och tangentbordstesterna dokumenterar ordningen.

### B5. Logikgräns: affordances plus deklarativ setup (fråga 5)

Systemet kan manipulera — blanda, dra, vända, rotera, stapla, räkna, slå — och känner till spelets struktur: namngivna zoner, per-spelare-områden, startuppställning, drag- och kasthögar.
Systemet validerar aldrig regler, hindrar aldrig och rättar aldrig.

Följdkrav:
Zon- och setupdefinitionen återanvänds för regelbokens uppställningsbild och för lådans inlägg.
Zonnamn blir användarsynlig UX på telefonen, inte kosmetik.
Setup måste redigeras när spelet ändras.

Setup-editorn (prototypad och byggd 2026-09-07):
Tre sätt prövades: en lista med mått i millimeter, bordet som arbetsyta med handtag, och ett recept med några rattar.
Valet blev recept som start och bordet som finjustering.
Receptet är wizardens rattar, vridbara efteråt i editorns flik "Bord": antal spelare, om varje plats har en yta framför sig, räknarna med startvärden, om bordet har en kasthög och en marknad.
Receptet äger en namnrymd av zoner (golv, draghög, kasthög, marknad, varje plats hand, yta och räknarzon); byte av antal spelare lägger dem på nytt, allt annat rör det inte.
Bordet är den riktiga renderaren matad ur setupen, med tjugo platshållarkort i draghögen och varje plats räknare: varje zon utom golvet är ett handtag att dra, ändra storlek på (hörnet) och knuffa med piltangenterna, i hela millimeter på ett femmillimetersraster.
Egna zoner läggs till som yta eller hög, får namn, genväg, ägare och synlighet, och kan tas bort; receptets zoner får namn och genväg men ägare och synlighet är receptets.
Setupen valideras av motorn i webbläsaren: går bordet inte att bygga säger editorn det i stället för att rita.
Telefonens ark står bredvid som förhandsvisning av spelarens verb.

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

Byggt 2026-09-08:
Reglerna ligger i projektdokumentet, så de versioneras i samma historia som korten (B4) och låses in i en session vid start som allt annat.
En regel namnger en zon eller ett kort med dess id, aldrig med dess namn: `[[zon:discard]]` och `[[kort:drake]]`. Att döpa om kasthögen skriver om varje regel som nämner den, eftersom reglerna aldrig höll namnet.
En referens till något spelet inte längre har visas som det som skrevs, markerad, precis som en okänd ikon på ett kort (L2).
Inline-parsern fick en konstruktion till, som bara regelboken ber om, så korttexten har fortfarande exakt de fyra L2 tillåter.
Renderaren returnerar block, inte HTML, eftersom samma rendering ska till tre ställen: editorn, bordets referenspanel och det tryckta häftet.
Ytan prototypades i tre former: block bredvid boken, ett fält i stenografi, och sidan själv som redigerare. Valet blev sidan själv: ett stycke öppnas där det står och stängs när det lämnas, så det man skriver alltid är det läsaren möter.
Fliken "Regler" i editorn är boken. Referenser sätts in ur en lista över vad spelet har. Uppställningsbilden är spelets egna zoner (B5), inte en teckning bredvid dem.
Reglerna vid bordet, byggt 2026-09-08:
`GET /sessions/:id/rules` renderar regelboken mot just den version sessionen låstes till vid start, så ett pågående spel aldrig skrivs om under spelarna.
Ytan prototypades i tre former: en lucka från kanten, boken som föremål på bordet, och en fråga som ger de stycken som svarar. Valet blev luckan med frågan överst.
Luckan finns på både bordets skärm och telefonen, ett tryck bort. Är frågerutan tom står hela boken där, för den som aldrig spelat; skrivs något i den svarar den med de stycken som nämner ordet, under den rubrik de står. En lista är ett stycke: dess steg går inte att dela.
Sökningen läser den renderade texten, alltså de namn läsaren ser, aldrig id:n bakom dem. Ett spel utan regelbok erbjuder ingenting alls.
Den renderade utdatan bär numera namnet i referensnoden, så den som ritar den — editorn, bordet, häftet — inte behöver något mer.

Häftet för tryck, byggt 2026-09-08:
Samma rendering som editorn och bordet läser läggs ut som sidor i A5 och går genom samma Chromium-worker som varje kort (E2). Ett häfte är ett dokument, inte ett kort, så det är en egen renderingssort: sidstorleken kommer ur `@page` och Chromium bryter sidorna. Inget `[data-card]` finns, och kortets väg är orörd.
Ingenting en designer skrivit når renderaren som markup: varje sträng escapas i häftet.
Uppställningsbilden är spelets egna zoner (B5), och symbolernas licenser trycks sist (E4).
`POST /projects/:id/rulebook` köar en rendering av reglerna som de står och svarar med dess hash; samma regler två gånger kostar en rendering, eftersom kön nycklas på sidan. Filen hämtas där varje annan rendering hämtas.
Fliken "Regler" har knappen; länken erbjuds först när det finns en fil bakom den.

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

Räknare och privata zoner (prototypat och byggt 2026-09-07):
En räknare är en komponent av en egen typ, `token.counter` (B1, B2), med ett värde och en yta; `setCounter` är dess verb och protokollet är orört.
Wizarden ger varje plats en yta "Framför mig" som bara ägaren ser och en räknarzon som alla ser, med räknarna ur en lista (en poängräknare som standard).
Tre varianter prövades för telefonen; valet blev staplat: räknarna som piller under huvudet, bordsöversikten som förut, korten framför dig som en mindre remsa ovanför handen med vänd, ta upp och spela. Bordet ritar en räknare som en bricka med värdet.
Arket och översikten erbjuder aldrig en annan plats privata yta, och aldrig en zon som bara håller räknare.

Byggt 2026-09-07: en zon kan bära en genväg (`shortcut`) med verbet telefonen visar och var i en hög kortet hamnar, överst eller underst; utan genväg visar telefonen zonens namn.
Wizarden ger draghögen "Lägg underst" och kasthögen "Kasta". Editorns flik "Bord" redigerar namn och genvägar för varje zon som inte är en hand, med telefonens ark som förhandsvisning; sedan 2026-09-07 är fliken hela setup-editorn (B5).

Reviderat 2026-09-08 (#24, #25): i distansvyn ligger Ångra, Flagga och Avsluta överst, inte nederst.
C4 la dem nederst för tummens skull, och det beslutet står kvar för `/play` — telefonens egen vy, där handen är K10:s remsa och botten rymmer båda.
`/online` rymmer det inte, och det är mätt och inte tyckt: vid 390 px är det nedre bandet 358 px brett, och 358 px rymmer **åtta** träffytor på 44 px och inte fler.
Handen ensam behöver dem alla, och därtill ligger `Ada · n kort` och de tre verktygen redan i samma band; krocken började vid **tre** kort och vid varje bredd, inte vid tjugoen och inte bara på telefon.
Två ytor kan inte dela en pixel, så en av dem måste flytta, och den som flyttar är den som inte är själva spelet.

Priset är uttryckligt och accepterat av produktägaren när variant A valdes: på just den skärm där tummen betyder mest ligger verktygen längst från den.
Det mildras av att de tre är sällanhandlingar — ångra, flagga ett ögonblick, avsluta sessionen — medan handen är varje drag, och en yta ger det närmaste rummet åt det som görs oftast.
Alternativen var att ta bort solfjädern (K9, C2) eller att gömma handen tills den kallas fram, och båda kostade mer.
Vad som faktiskt ligger i bandet, och de två lägen handen har, står i K17.

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

Byggt 2026-09-08:
Redigeringarna är en sluten vokabulär av intents som en enda ren funktion applicerar. Editorn kör den på det den håller, aktören på sanningen, och båda får samma dokument.
En aktör per projekt, med samma ordning som bordets: den måste gå att applicera, den committas i loggen, den appliceras, och alla får veta. En aktör byggs om från den sparade versionen plus de redigeringar som skett sedan; inget i minnet är sanningen.
Sparandet är fortfarande det som gör en version (B4). Loggen bär svansen mellan sparningar och varje version noterar hur långt den kommit, så två redigerare ser varandras arbete utan att någon behöver spara. Sparkonflikten är därmed borta: aktören är den enda som skriver.
`/projects/:id/edit` är tråden: dokumentet vid uppkoppling, varje redigering när den landar, vilka som är inne, och varför en redigering avvisades. En avvisad redigerare får dokumentet med avslaget och kan fortsätta från det som är verkligt.
Editorn applicerar sin egen redigering direkt och skickar den; ekot säger bara att den landade. Det som skrevs innan socketen hann öppna skickas när den öppnar och läggs tillbaka ovanpå om aktören lämnar över sitt dokument.
Att ta tillbaka en äldre version är en redigering som vilken annan och går samma väg.
Huvudet visar vilka andra som har spelet öppet, med kontots adress som namn.
Roller och inbjudningar, byggt 2026-09-08:
Behörigheter är en modell, inte ett fält: ägare, medredigerare, testledare, betraktare, och varje väg frågar vad rollen får göra i stället för att minnas reglerna.
Ägaren delar spelet och tar bort det. En medredigerare ändrar det. En testledare startar bord och kör speltest utan att röra leken. En betraktare ser projektet ändras på tråden utan att kunna ändra det, och får veta det i huvudet i stället för att varje ändring avvisas.
En inbjudan mejlas till en adress, lever en vecka och går att använda en gång. Den säger ingenting om spelet förrän den använts, så en vilsen länk berättar inget för en främling. Den som följer den medan hen är inloggad går med i den roll den nämner och landar i editorn.
Ytan prototypades i tre former: en panel från editorns huvud, ett ark på spelets kort, och de som är inne som dörren. Valet blev det sista: vilka som är inne nu och vilka som får vara med är samma fråga, så en lista svarar på den, med de närvarande överst.
Ett projekt från före konton tillhör fortfarande ingen och är öppet för alla, som det alltid varit.
Återuppkoppling, byggt 2026-09-08:
Ett brutet socket kopplar upp sig igen av sig självt, med allt längre väntan mellan försöken så en nere server inte hamras, och aldrig så länge att någon sitter och väntar.
Det som skrivs medan linjen är borta stannar i editorn och skickas när den är tillbaka, i den ordning det skrevs. Aktören lämnar över sitt dokument på den nya förbindelsen, så ingenting behöver frågas efter.
Editorn säger att förbindelsen är borta medan den är det. Ett socket som editorn själv stängde kopplar aldrig upp sig igen.

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

### D5. Fel-, tom- och anslutningslägen: nio lägen med en modell och en form per route (prototypat 2026-09-07)

Ett saknat projekt, en tappad WebSocket och ett avvisat drag är inte tre saker.
Det är nio lägen ur samma familj: laddar, laddar länge, 404 saknas, 401/403 stängt, nät-/serverfel, ansluter, tappad anslutning, återansluten och avvisad handling.
Modellen är gemensam och ligger på ett ställe: en ton per läge, en regel för polite kontra assertive, en regel för om väntan hjälper, och en uppsättning vägar ut.
Formen är routens egen.

Sex av de nio inträffar i stället för en vy och tar då hela skärmen, formulerade för routen: "Vi hittar inte spelet" i editorn, "Rummet är slut" på bordet, "Rummet finns inte — läs QR-koden på TV:n igen" på telefonen.
Tre av dem — tappad, återansluten och avvisad — inträffar ovanpå en vy som redan håller data, och lägger sig där routen har plats: ett kort mitt på filten som rummet kan läsa på tre meters håll, en sheet under tummen på telefonen, en rad i editorns chrome där spar-statusen redan bor.
Ett avvisat drag står inline vid kontrollen som avvisades, med `aria-describedby` från knappen till svaret.
En route väljer placering och formulering ur modellen; den hittar inte på egna lägen.

Assertive används bara när det som står på skärmen har slutat vara sant, eller när något någon bad om inte hände: tappad, avvisad, 404, 401/403 och nätfel.
Laddar, ansluter och återansluten är polite.
Båda regionerna ligger i trädet från start och tomma, i `App`, av samma skäl som `TextureFailures` gör det (#10): en live-region som skapas tillsammans med sin text är en region ingen lyssnade på.
När ett läge tar hela vyn flyttas fokus till rubriken, annars står tangentbordsläsaren kvar i ett dokument som inte längre innehåller det hon läste.

Återhämtning är både och, aldrig `location.reload()`.
Transporten försöker själv med synlig nedräkning och ger sedan upp och väntar på en människa; allt en människa måste besluta får en knapp eller en länk från första stund, för ett 404 som görs om är fortfarande ett 404.
Den initiala anslutningen har en tidsgräns, vilket den inte hade förut: `ansluter` blir `laddar länge` och sedan `nät-/serverfel` med förklaring, återförsök och hemväg.
Gammal data tonas och tas ur tabbordningen med `inert` så länge den inte går att lita på, och beskedet säger vilken tidpunkt bilden är från — annars ser ett fruset bord ut som ett bord som står stilla.
Serverns egna meningar når aldrig skärmen: en avvisad `SendResult` översätts till en svensk mening, med en egen mening som reserv för ett skäl översättningen inte känner igen.

Dokumenttiteln sätts på ett ställe, av routen, med lägets överskrivning: `Bordet · Rum 4KJ2 · build-your-deck` när allt är uppe, `Frånkopplad · build-your-deck` när linan är nere.
Namnet ligger först eftersom en flik klipps från höger, och titeln är inte ett meddelande: den som behöver ordet "fel" får det i vyn och i live-regionen, inte i fliken.
En okänd sökväg är en egen route som säger att sidan inte finns; förut föll den igenom till startsidan, så en felstavad länk visade tyst någon annans spel.

Motivering:
Ett bord på en TV och en telefon i en hand är inte samma yta.
En enda helsidesmall river ner bordet för att sätta upp det igen när fyra personer tappar nätet i två sekunder; en enda statusremsa går inte att läsa från en soffa, och lämnar vid ett 404 kvar en kuliss av ett rum som inte finns.
Det som ska vara gemensamt är därför modellen och inte formen.

Följdkrav:
`TableClient` äger tidsgränsen och återförsöksplanen, rapporterar varför den har slutat försöka och kan startas om av en människa utan att vyn kastas bort.
Priset är fler formuleringar att hålla i sär: rutterna kan glida isär i ton om ingen vaktar dem, och det är den enda verkliga risken med valet.

Byggt 2026-09-07 (prototypat i tre varianter, godkänd variant C — #12 och #7).
Planen 2, 4, 8 sekunder fick ett snabbt första försök på 500 ms före sig, så att en blink läker innan någon hinner läsa ett besked om den.
Fem frågor från prototypen är fortfarande obesvarade och står kvar i avsnitt I.

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

Illustrationer i editorn (prototypat och byggt 2026-09-07):
Tre sätt prövades: bildceller i tabellen, släpp på kortet på väggen med spelets bilder i en bricka, och ett bibliotek som matchar filer mot kort på namn.
Valet blev bildceller i tabellen: bildfältet är en cell med tumnagel, en knapp att välja eller byta, ett kryss att ta bort, och en plats att släppa en fil eller en av spelets bilder på.
Ovanför tabellen står spelets bilder en gång var med hur många kort de sitter på; en bild dras därifrån till en cell för att användas igen.
En bild är en innehållsadresserad asset (DRIFT §4): raden bär `asset:<hash>`, inte bytesen, så projektdokumentet är litet och samma bild på tio kort är en uppladdning.
Kompilatorn får en URL där den anropas: i webbläsaren `/assets/<hash>`, på servern en data-URL ur lagret, så den kompilerade sidan bär sina bilder och renderworkern behöver inget annat än sidan.
Wizarden laddar upp sina valda bilder innan projektet skapas och pekar på dem på samma sätt.

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

Symbolbiblioteket i editorn (prototypat och byggt 2026-09-08):
Tre sätt prövades: en bibliotekspanel, en väljare som öppnas vid klammern medan man skriver, och en bricka att dra symboler från till kortet.
Valet blev panelen som hem och klammern medan man skriver; båda fyller samma sak.
Fliken "Symboler" i editorn är biblioteket: sökning på namn, nyckelord eller kategori, kategorierna Resurser, Handlingar, Tillstånd och Platshållare, och licensen skriven på varje symbol.
Att skriva `{` i en textcell i tabellen öppnar samma sökning där markören står; piltangenter väljer, Enter skriver in `{namn}` och tar in symbolen. Ett rent tal i klamrar är en pip (L2) och slår inte upp något.
Spelets egen uppsättning står bredvid biblioteket med vad man skriver, vilken licens symbolen har och hur många kort den används på; namnet går att byta och symbolen att ta bort.
En symbol som tas in blir ett av projektets assets (E1): bytesen laddas upp och uppsättningen pekar på `asset:<hash>`, så kortens utseende inte hänger på att biblioteket står stilla.
Licensen lagras i dokumentets `credits` bredvid uppsättningen, så kompilatorns `icons` förblir namn → URL, och `POST /projects/:id/print` svarar med licenserna tillsammans med korten — det är följdkravet att licensmetadata når tryckunderlaget.
Biblioteket är ritat för projektet och släppt som CC0; strukturen bär licens och upphovsman per symbol, så kurerat CC-BY-material kan läggas till utan ändring.

### E5. Fysisk validering med varningar (fråga 30)

Kontinuerliga kontroller mot fysiskt mått: minsta textstorlek i punkter, kontrastförhållande, färgblindhetssimulering, skärmargin mot utfall, minsta linjetjocklek.
Varningar i editorn, blockerande fel vid order.

Motivering:
Text som ser lagom ut på en 27-tumsskärm blir 5 punkter i handen.
Effektsymboler som bara skiljs åt av rött och grönt är osynliga för åtta procent av männen som spelar spelet.
Inget av detta upptäcks vid ett digitalt playtest, eftersom bordet zoomar in.

Byggt 2026-09-08:
Kontrollerna sitter i `packages/template` och körs både i editorn och vid order, så det är samma dom på båda ställena.
Sex slag: text mot komponenttypens egen minsta storlek för skriften, kontrast mot det som ligger bakom, innehåll innanför skyddsmarginalen, bakgrunder som når snittet men inte utfallet, linjer tunnare än pressen klarar, och färgpar som blir ett vid simulerad färgblindhet.
Varje anmärkning är antingen fel eller varning. `POST /projects/:id/print` svarar 422 med kort, sida och element så länge ett fel står kvar; varningar följer med ordern i stället för att stoppa den.
Ytan prototypades i tre former: markerat på kortet, en rapport över hela leken, och att se leken med läsarens ögon. Valet blev rapporten plus ögonen, båda på kortväggen.
Rapporten samlar anmärkningarna per slag med hur många kort de gäller, eftersom ett fel i mallen är ett fel på varje kort som ärver elementet; en rad öppnar detaljen och ramar in korten den gäller.
Ögonen är lägen över de riktiga korten: deuteranopi, protanopi, tritanopi och gråskala som filter med samma matriser som kontrollen använder, snitt och skyddsmarginal inritade i millimeter, och kortet på armlängds avstånd. Färgblindhet går inte att beskriva i ord.
Kortets eget märke räknar fortfarande bara kortets egna varningar; ett mallfel sägs en gång i rapporten i stället för fyrtio gånger på väggen.
Kontrollen fann tre fel i vårt eget arbete första gången den kördes: startramarna målade bakgrunder ända till snittet, en ram låg en millimeter från kniven, och en mörk variant i testleken behöll en nästan svart titel.

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
Passkeys och OAuth återstår.

Claimat (prototypat och byggt 2026-09-07):
Gästens admission, den token telefonen spelade under (DRIFT §9), är det som claimas: `POST /guests/claim` med kontots kaka knyter den till kontot, en gång, och 409 om ett annat konto redan har den.
Telefonen erbjuder "Spara till ditt konto" i enkäten när sessionen är slut; länken går via inloggningskortet till `/claim`, som sedan landar på startsidan med ett besked.
Tre varianter prövades för startsidan; valet blev två rutnät: egna spel först som förut, sedan "Bord du spelat vid" med platsens färg, spelet, namnet man spelade under, enkät och flaggor, och "Tillbaka till bordet" medan det pågår och koden lever. En ren gäst utan egna spel ser "Nytt spel" som inbjudan ovanför sina bord.

Startsidan färdig 2026-09-08:
Varje spel säger hur många bord det har och när ett av dem senast spelades vid; ett spel ingen satt sig till säger "aldrig spelat". Uppgiften kommer ur loggen, inte ur något listan håller själv.
Kortets ansikte öppnar editorn. Menyn bredvid startar ett bord och lämnar rumskoden på plats med en väg till bordets skärm, eller tar bort spelet efter en fråga; hela historien följer med och det går inte att ångra.
Ett fel i en åtgärd tar aldrig spelen från skärmen; bara en sida som inte gick att läsa alls ersätter dem.
CORS-svaret tillät inte DELETE, så borttagningen stoppades i webbläsaren utan att servern märkte något. Ett test på preflight-svaret täcker nu varje metod API:et faktiskt betjänar.

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

Blandad orientering (beslutat 2026-09-07): en hög kvadrerar sina kort.
Ett kort som läggs i en hög tar högens vridning, vilken det än hade, som en hand gör när den jämnar till en hög; tillståndet och bilden säger samma sak.
Den som vill markera med ett tvärställt kort lägger det löst bredvid högen.

### K2. Fri placering, zoner som rektanglar med släpp-in

Setup ger varje zon en rektangel, eller en punkt för högar, i bordskoordinater.
Släpp inom rektangeln är `move` till zonen med relativ position; släpp utanför är fri placering i bakgrundsarean.
Ingen grid, inga slots.
Zoner får överlappa (beslutat 2026-09-07): ett släpp landar i den minsta zon vars rektangel innehåller punkten, och mellan lika stora i den som står först i setupen. Nästling är huvudfallet; ett medvetet överlapp får en förutsägbar mening utan validering.

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

Reviderat 2026-09-08 (#23): handsolfjädern är millimeter på filten, inte pixlar på skärmen.
Kortet i en hand, hur brett isär fläkten står och hur långt antalet hänger under den mäts i bordets eget mått och skalas med det, precis som ett kort som ligger på filten.
Dessförinnan ritades den i 54 × 75 px med 26 px isär oavsett bordets skala, och i en ram smalare än ungefär 700 px blev händerna bredare än bordet de satt vid och hängde utanför båda kanterna.
Inpassningen räknar in dem: det som ska rymmas i ramen är filten *med händerna på* — golvet utvidgat lika mycket åt båda hållen tills varje fläkt ligger innanför — så ett inpassat bord klipper aldrig sina egna händer.
Utvidgningen är symmetrisk eftersom ramen centrerar golvet; att växa åt ett håll skulle lägga bordet snett i sin egen ram.
Antalet under handen är en etikett i pixlar, som högens namn, och ryms i luften ramen ändå lämnar.
Ett kvartsvridet bord (C5) passas in i den form det faktiskt ritas i, och träramen tar samma form: dessförinnan fick en plats vid en sidokant på `/online` ett bord som stack ut både ur sin ram och ur skärmen.
Måtten och regeln för var ett kort i fläkten hamnar bor i `packages/web/src/table/hand.ts` och ställs av både den som ritar fläkten och den som mäter den, så de kan inte glida isär.
Kvar står att TV-lägets kamera beskär bordets kant och därmed kan skära genom en handfläkt: händerna räknas inte som innehåll kameran riktas mot (C5), och det är ett beslut, inte ett fynd.

Reviderat 2026-09-08: distansvyns egen hand mäter också det den ritar.
Den handen är inte filtens fläkt utan `HandFan` — korten spelaren själv håller, framför skärmen, i den storlek de läses i — och är därför pixlar där filtens är millimeter (#23).
Men ett kort i den vrids kring en punkt under sig självt och sänks, alltså målas det utanför den ruta raden lägger det i: tre kort i prototyp B:s storlek når fjorton pixlar under raden och trettiofem utanför dess sidor.
`online.css` reserverade sex gissade pixlar för det, och skärmen klippte resten — vid varje bredd och varje höjd, eftersom överhänget är fläktens eget och inte fönstrets.
Formen och rummet formen behöver är nu ett och samma svar i `packages/web/src/online/fan.ts`, som `table/hand.ts` är det för filten.
Kortet är prototyp B:s storlek och aldrig större, krymper för att rymmas på bredden, och går aldrig under en fingertopps 44 px — där tätnar i stället steget, som en hand med fler kort än rum håller dem tätare i stället för att bli oåtkomlig.

Reviderat 2026-09-08 (K17, #24): filten mäts mot ramens yta och inte mot dess kortare sida.
Marginalen 0,16 av kortare sidan tog en tredjedel av just den sida bordet var kortast om — 32 % av höjden i en låg, bred ram, 32 % av bredden i en hög, smal — och överskottet på den andra axeln blev ett dött band.
Regeln var tunad mot en nästan kvadratisk ram och märktes därför inte förrän K17 gjorde handbandet till en egen layoutrad: filtraden på `/online` vid 1280 × 800 är 1280 × 515, och där krympte inpassningen bordet till 26 % av radens yta med sexhundra pixlar bredd oanvända.
Regeln är nu att filten *med händerna på* täcker två femtedelar av ramens yta, aldrig mer än ramen rymmer och aldrig mer än naturlig storlek.
Ytan väger båda axlarna lika, vilket den kortare sidan aldrig gjorde: i en ram nära bordets egen form ger den samma proportion som 0,16 gav, och i en ram långt ifrån den växer bordet in i det rum som faktiskt finns.
En marginal uttryckt som andel av en axel — vilken axel som helst, ramens eller bordets — ger samma svar som förut så snart den axel som binder också är den kortaste, vilket den är i alla fyra ytorna; skillnaden mellan `/table` och `/online` ligger enbart i överskottet på den lösa axeln, och bara ett mått som räknar in det kan skilja dem åt.
Minsta luft är 44 px, densamma som TV-läget alltid lämnat innanför sin krom: träramen ritas i skärmens egna pixlar utanför de millimeter inpassningen mäter, så en filt som kom närmare hade fått sin egen ram avskuren.
Mätt på bordet som fyra platser sitter vid: `/table` på 1600 × 1000 går från 0,781 till 0,765 i skala och från 0,416 till 0,400 av ramens yta, alltså under två procent och samma bild; miniatyren i editorns Bord-flik (640 × 384) går från 0,301 till 0,300.
`/online` går från 0,389 till 0,473 vid 1280 med tjugoen kort — träramen från 527 till 628 px bred och filtens andel av raden från 26 % till 39 % — från 0,421 till 0,502 vid tre kort, och från 0,212 till 0,241 vid 390.
Kvar vid 390 står luften ovanför och under bordet: ett landskapsbord på 1200 × 800 mm i en stående rad på 390 × 550 px kan inte fylla höjden utan att gå utanför bredden, och den luften är formernas skillnad och inte slack i inpassningen — bordet tar där 90 % av radens bredd.
TV-läget rör regeln inte: det ramas in av sin egen krom och passas in precis som förut, med samma 44 px.
Regeln bor i `packages/web/src/table/fit.ts` som `feltScale`, och de fyra ytor som ritar ett bord — `/online`, `/table`, TV:n och Bord-flikens miniatyrer — hämtar den ur samma funktion; ingen yta har ett undantag.
Grinden är en invariant och inte ett tal: vid varje ram täcker filten sin andel av ytan eller är så stor som ramen rymmer, mätt i Chromium på den markup vyerna faktiskt monterar, vid `/table`s, miniatyrens och filtradens egna former.

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

### K12. Anslutningsflödet: bordet som platsväljare med nästa lediga förvald (prototypat 2026-09-06, utvidgad 2026-09-11)

QR-koden i TV-läget pekar på `/join?code=…` (från 2026-09-07 en rumskod, DRIFT §9).
Telefonen ser platserna live genom lobbyrollen — upptagna med namn, lediga tryckbara — runt ett litet bord vars kanter följer setupens handzoner, med nästa lediga plats förvald.
Namn plus "Sätt dig" köper en token för platsen och leder till `/play`, som claimar platsen.

Motivering:
I bordsläge betyder platsen något — den avgör vilken kant handen orienteras mot — så valet ska vara rumsligt.
På distans betyder den inget, så förvalet gör det till en gest.

Följdkrav:
Snapshot saknar spelets namn; lobbyn visar rumskoden i stället. Spelets namn hör hemma i snapshot.
Kanten är en upplysning om platsen och inte om filten, så den reser i platslistan (`SeatView.edge`) och härleds en enda gång, i `project`.
Lobbyn ser därmed fortfarande inga zoner — den gräns #31 hårdnade står orörd — och väljaren ritar ur kanten i stället för ur bordet (#39).
En plats som bordet inte ger någon hand har ingen kant, och ritas på filten i stället för att gissa en sida.

Platserna blev fler än kanterna 2026-09-11 (#42).
`edgeOf` lägger ut fem till åtta platser på fyra kanter — S, N, E, W och sedan varvet om — så på ett åttaplatsbord delar A kant med E, B med F, C med G och D med H.
Härledningen är riktig; ett bord har fyra sidor.
Felet låg i väljaren, som gav varje väderstreck exakt ett läge, så paret hamnade i det tillsammans: hela pillret, 64 × 37 px, ritat två gånger.
Den som stod sist i dokumentet tog trycket, så det var A, B, C och D som inte gick att välja alls.

Tre svar prototypades mot varandra.
**A — utspridda längs kanten**: fortfarande exakt fyra väderstreck, men den som delar en kant står bredvid sin granne längs den i stället för ovanpå.
**B — åtta lägen runt bordet**: fyra sidor plus fyra hörn, ett läge per plats.
**C — lista över fyra**: upp till fyra platser speglar väljaren fortfarande bordet, därefter blir den en rad per plats.

Valet blev **A**.
A faller vackert även när platserna inte går jämnt upp: vid fem till sju bär någon kant en ensam plats, och en ensam plats står mitt på sin kant precis som förut.
B ser jämn ut på åtta platser och sned på sex — två hörn tagna och två tomma, och en ring vill vara hel — och ett riktigt hörn är dessutom en ändring av `SeatEdge` i `packages/protocol`, alltså en protokollmigrering, med `seatEdge` i `packages/engine` som härleder åtta lägen ur handens geometri i stället för fyra.
C tappar det K12 valde väljaren för: man ser inte längre var man kommer att sitta i förhållande till de andra, och listan växer förbi vikningen redan vid sex platser, så "Sätt dig" hamnar under skärmkanten på en telefon vid åtta.

Ingen protokollmigrering behövdes.
Var längs en kant en plats står är ingen upplysning om bordet utan hur väljaren ritar ett, så klienten räknar själv hur många platser varje kant bär och vilken i ordningen platsen är, och lämnar det till `join.css` som `--seat-at` och `--seat-of`.
Med en ensam plats på kanten blir steget exakt noll, så tvåplatsfallet från #39 och varje bord upp till fyra ritas där de redan ritades.
Lobbyn ser fortfarande inga zoner; gränsen #31 hårdnade står orörd.

Steget längs en kant är inte detsamma åt båda håll.
Ett piller är 44 px högt och 64 px brett när det bara säger "ledig" (UX-KONTROLLER: träffytor), alltså 20 px bredare än högt, så `--byd-seat-pitch-x` är 132 px och `--byd-seat-pitch-y` 112 px, valda så att luften mellan två platser läses lika stor ned längs en sida som tvärs över en ände: 67,7 px tvärs över änden mot 68,0 px ned längs sidan.
Hur långt isär paret får stå är inte fritt.
Pillret hänger 26 px utanför sin kant och räcker därmed 18 px in på filten igen, så den yttersta platsen på en kant ställer sig annars i samma hörn som den yttersta platsen på kanten bredvid — vilket den gjorde, med 8,5 × 3,5 px av det ena pillret på det andra.
Hörnen sätter alltså taket, och taket hänger på filten: öst-väst-steget får vara filtens höjd minus de 80 px som nord- och sydpillret tillsammans räcker in, minus den dager man vill ha i vart och ett av de två hörn steget passerar.
Filten är 200 px hög, så 112 px lämnar 4 px dager i alla fyra hörnen, och nord-syd-steget följer med på de 20 px mer som pillret är bredare än högt.
Fler vid samma sida sitter alltså tätare, precis som vid ett riktigt bord.
Ett långt namn är det andra sättet två platser hamnar på varandra: pillret växte med texten och hade ingen breddgräns alls.
Ett piller som delar sin kant är därför högst en delning minus luften brett — `calc(var(--byd-seat-pitch-x) - var(--byd-seat-gap))`, 118 px — och ett längre namn kapas.
Av de 118 px går 34 åt till ram och innerkant, så namnet självt har 84 px att stå på.
Gränsen gäller bara den som har en granne: sidan sätter `data-shares` på just de platser dess egen räkning av kanten fann sällskap på, och css:en kapar efter det attributet.
En ensam plats på sin kant har tom filt bredvid sig och inget att växa in i *längs* kanten, så längs kanten bär den hela sitt namn precis som före #42 — annars hade det vanligaste bordet, två till fyra spelare, betalat för ett fel det inte kan ha.
Tvärs över filten gäller något annat, och det är #52 nedan.
Kapningen sker i css:en och inte på sidan, eftersom namnet en skärmläsare säger fortfarande ska vara hela namnet.

Filten växte till 260 × 200 px 2026-09-11, därför att allting ovan hänger på hur stor den är.
På 220 × 150 px blev öst-väst-steget 62 px och gränsen 68 px, varav 34 px ram och innerkant: 34 px text rymmer "ledig" och ungefär fem tecken till, så sex av åtta vanliga svenska förnamn ritades som `Kri…`, `Ale…` och `Ma…`.
En väljare som inte säger vem som sitter var är inte längre den bild av bordet K12 valde den för, så filten fick den plats gränsen behöver — men bara där trängseln finns.
Sidan sätter `data-shares` på själva bordet för precis de bord vars egen räkning av kanterna fann ett par, ur samma läsning som märker de enskilda pillren, så de två aldrig kan säga emot varandra.
Ett bord med fyra platser eller färre delar ingen kant, tar steget noll och ritas på 220 × 150 px precis som förut — filt och plats för plats på samma pixel som före #42.
Telefonen betalar ingenting för den större filten: filten står i en egen rutnätsrad med gott om luft över och under sig, så sidan är lika hög, rullar inte mer i sidled och lämnar "Sätt dig" exakt där den stod.

Samma fel sett från andra hållet, 2026-09-11 (#52): ett piller växer inte bara längs sin egen kant utan också tvärs över filten, mot platsen på kanten mittemot.
#42:s gräns resonerar bara om grannar på samma kant, så öst och väst var obundna åt det håll de faktiskt möts.
Mätt i Chromium vid 390 px växte `Bartholomew Longbottom` på både öst och väst vart piller till 196 px: på ett fyraplatsbord — där ingen kant delas och filten alltså är den lilla — låg de 112 px på varandra och västplatsen tog östplatsens tryck, och på fem och sex platser låg de 72 px på varandra trots den bredare filten.
Den bredare filten botade alltså aldrig något; den sköt bara upp mötet.
Gränsen är därför en per axel, byggd av samma storheter som #42:s och inte en andra mekanism vid sidan av den.
Längs kanten gäller #42:s gräns och bara för den som delar sin kant; tvärs över filten gäller #52:s och bara för öst och väst, som är de enda som står mitt emot varandra i sidled.
Ett piller är det minsta av de två, `min()` i css:en, så den av dem som biter gör det oavsett vilken det är.
Öst och väst har filtens bredd plus de två överhängen att dela på, minus luften de håller: hälften var, alltså 133 px på en 220 px filt och 153 px på en 260 px filt.
Nord och syd är obundna tvärs över, eftersom platsen mittemot dem ligger en hel filt *ned* och inte i sidled.
Gränsen frågar inte om kanten mittemot är tom — ett treplatsbord har ingen västplats, och östplatsen hålls ändå till sin halva — därför att ett piller som räcker förbi filtens mitt slutar säga vilken sida dess ägare sitter på, och därför att en gräns som beror på vilka platser som råkar finnas är just den andra mekanismen som inte ska finnas.
Filtens bredd skrivs nu en enda gång, som `--byd-felt-w` på själva bordet, och överhänget som `--byd-seat-hang-x`; både filtens mått, platsernas lägen och gränsen läser dem.
En krympt filt drar därmed åt gränsen i stället för att låta pillren mötas på mitten, och garantin hänger inte längre på att filten råkar vara bred nog.
Kapningen sker i css:en också här, så namnet en skärmläsare säger är fortfarande hela namnet.

`join-layout.test.tsx` mäter varje plats på fem-, sex-, sju- och åttaplatsbord i Chromium och träffprovar mitten av var och en: ingen ruta överlappar en annan, och varje plats svarar för sig själv.
Samma fil sätter långa namn på både öst- och västplatsen på fyra-, fem- och sexplatsbordet och mäter om: fyraplatsbordet är fallet där kanterna är ensamma och filten den lilla, och det är där felet var störst.
Samma fil läser åtta vanliga förnamn bokstav för bokstav ur pillren på ett åttaplatsbord — inget kapas — och håller två-, tre- och fyraplatsbordet mot de mått `origin/main` ritade dem med.
Prototypen `packages/web/src/prototype/seats` togs bort när den hade svarat; dess resonemang står här, och dess bilder i `docs/issues/42-valjare-*.png`.

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

### K16. Att spela utan pekdon: adressen (prototypat och byggt 2026-09-08)

Ett kort på bordet har en position, och en dragning säger ”lägg det där”.
Ett tangentbord har ingen position.
Det var hela frågan, och den var densamma i handen, på filten och i distansvyn — alltså fick den ett svar och inte tre.

Före det här var pekaruteslutningen total och mätt, inte läst ur en issuetext.
`/table` hade noll tabbstopp: en sökning efter fokuserbara element i hela vyn gav tom lista, och det enda Tab landade på var en överfull rullyta.
`/play` och `/online` hade två var, ”Flagga” och ”Avsluta”.
Radialmenyn öppnades bara av ett pekarhåll på 350 ms, så `flip`, `rotate`, `reveal`, `shuffle`, `split` och `movePile` hade ingen tangentväg alls, och handens tre gester — tryck, håll, dra upp — hade ingen motsvarighet, vilket betydde att `PlaySheet` aldrig kunde öppnas och att en tangentbordsanvändare inte kunde spela ett enda kort.
`table.css`, `player.css` och `online.css` innehöll inte ordet `focus` en enda gång.
Och ingenting som hände på bordet nådde en skärmläsare: `describeActivity` skrev redan meningen, men den nådde aldrig en live-region.

Tre modeller prototypades mot varandra och kördes i webbläsaren: **A, zonlistan** — bordet är ett träd av namngivna platser och positionen finns inte; **B, kompassen** — kortet lyfts och stegas en kortbredd i taget över filten; **C, adressen** — allt på filten är en kontroll med ett namn, och Enter öppnar en panel med vad som kan göras och vart det kan flyttas.

**Valet blev C.**

A avråddes för att den inte är ärlig mot bordet.
Ett bord utan positioner är inte det bord produkten har beslutat sig för: K2 säger fri placering utan rutnät och C1 säger att tillståndet är position, rotation och z-ordning.
A gör tangentbordsanvändaren till en andra klass med ett annat bord, och den slipper ändå inte koordinater: `movePile` och `split` utan `to` kräver x och y i protokollet.
Mätt i prototypen landade dessutom två kort som spelades till samma yta på exakt samma punkt och täckte varandra, eftersom `move` utan x och y låter kortet behålla sina gamla koordinater och ett handkort har 0,0.

B kan säga varje punkt på bordet och är därför det enda svaret för ett spel som lägger ut en tablå, en rad eller ett rutnät.
Den är för dyr som grundmodell: bordet är 1200 × 800 mm och ett steg är 63 mm, alltså nitton tryck för att korsa filten, och det är det vanliga draget och inte undantaget.
På en telefon tvingar den dessutom fram en utfälld filt som huvudyta, vilket är en revidering av K10 och inte en implementationsdetalj.
B är därför ett andra steg och inte grunden.

C är byggd så här.
Allt på filten — varje löst kort, varje högs topp och varje hög som helhet — är en kontroll med roll, namn och fokusmarkering, och hela filten är ett tabbstopp med piltangenterna inuti.
Namnet är projektionens: ”Kung, kort i Spelyta, vridet. Enter öppnar handlingar.”, ”Draghög, hela högen, 9 kort.”
Enter öppnar en panel med **Gör** — vänd, vrid, avslöja, titta, blanda, dela — och **Flytta till** — zonerna vid namn, högarna, händerna, ”Bordet” och varje löst kort som ”På Drake”, vilket är `stack` och bildar en hög (K1).
Panelen är `Question.tsx`:s uppförande tillämpat på en lista i stället för ett svar (L9): den tar fokus så att den besvaras där den läses, den svarar på Escape, den lämnar tillbaka fokus till det som öppnade den, och den fångar ingenting — den som tabbar förbi lämnar den stående.
Efter en flytt följer fokus kortet dit det landade, för det är dit blicken går; har kortet lämnat filten går fokus till det första stoppet som är kvar och aldrig till ingenting.

Klienten räknar ut en koordinat, eftersom protokollet vill ha en och tangentbordet inte har någon: nästa lediga plats i en rad inne i zonen, relativt zonen (K2).
Två kort som spelas med tangentbord landar därför aldrig på samma millimeter.
Vokabuläret är orört: `move` med uträknad x/y, `stack`, `split`, `movePile`, `flip`, `rotate`, `shuffle`, `reveal`.
Ingen protokollmigrering, inget nytt verb.

**Det tangentbordet inte kan säga är en godtycklig punkt på filten, och panelen säger det själv.**
Raden ”Fri placering — en punkt på filten” står där, avstängd, med ”kräver pekdon; med tangentbord finns bara platser med namn”.
Det är ärligt och inte gratis: ett spel där avståndet mellan två kort betyder något — en tidslinje, ett spår, en karta som spelarna lägger — kan en tangentbordsanvändare inte bygga, bara approximera kort för kort genom att adressera dem mot varandra.
Det är acceptabelt av tre skäl.
Ingen av produktens beslutade ytor kräver i dag att en punkt kan sägas, eftersom zonerna är rektanglar med släpp-in och inte rutnät (K2).
Alternativet var att låtsas — att låta ”lägg i zonen” se ut som fri placering — och en yta som låtsas kunna något den inte kan ljuger för den som står i den, precis som telefonen inte får låtsas rita en mall (L10).
Och vägen ut är redan ritad: raden är ingången till B:s stegande den dag den behövs, och då blir den avstängda raden en påslagen rad utan att någonting annat i modellen ändras.

Uppläsningen är D5:s egen indelning, med `describeActivity`:s meningar och inga nya formuleringar.
Det jag själv gör sägs på en gång i den artiga regionen; det de andra gör samlas ihop och sägs på ett taktslag om 1,4 s, så att tre drag i samma andetag blir ”3 drag av de andra, senast: Ada blandade Draghög” i stället för tre avbrott; ett avvisat drag är svaret på något någon bad om och avbryter.
Regionerna är `StatusLive`:s två, de som redan fanns sedan #7, och inte nya — en rutt som gjorde sina egna vore en andra uppläsare i samma rum.

Följdkrav som är införda:
`TableRenderer` fick attribut på de noder den redan ritar och ingen andra kodväg (K9); ett bord som bara visas — editorns miniatyrer i fliken Bord, setup-duken, observatörens vy — skickar ingen tangentbordslager och får därför noll tabbstopp, för en miniatyr ingen kan spela på är inte en kontroll.
Roving tabindex är editorns `roving.ts` med en tredje orientering, `both`, eftersom filten är en lista i två dimensioner; ingen yta skrev en egen.
Fokusmarkeringen är två band mot varandra, ett ljust och ett mörkt, eftersom en enda ljus ring försvinner mot ett blekt kortansikte — vilket är precis var ett handkort lägger den; `keyboard-contrast.test.ts` mäter båda mot filten, träet, TV:ns mörker, panelen och kortansiktets hela ramp.
Dold information bevisas fortfarande på tråden och inte på skärmen (D4, B6): `keyboard-hidden.test.tsx` spelar in varje rå frame sidans egen socket tog emot och visar att namnen aldrig kom fram, och därför att kontrollen bara kan heta ”Dolt kort”.
En hög erbjuds aldrig sig själv som destination, eftersom bordet svarar ”cannot split a pile onto itself” och en panel inte ska fråga om det.

Byggt 2026-09-08 (#1, #2). Prototypen `packages/web/src/prototype/keyboard` togs bort när den hade svarat; dess resonemang står här.
Fem frågor som prototypen väckte och som inte är besvarade står i avsnitt I.

### K17. Distansvyns nedre band: facket, med uppslaget bakom `Visa alla` (prototypat och byggt 2026-09-08)

Två issues, en yta, ett svar.
#24 sa att solfjädern blir en regnbåge när handen är stor; #25 att fjädern och hörnens kontroller slåss om samma fyrtio pixlar vid 390.
De hänger ihop: en fjäder som packar tätare krockar också mindre, så den som löser det ena har redan bestämt det andra.
Därför en prototyp och ett svar.

**Mätt först, inte räknat ur issuetexten.**
Bågen var 8° per kort utan tak, alltså (n−1)·8: en hand på tjugoen kort spände 160°, och dess yttersta kort stod 80° från lodrätt och gick inte att läsa.
Krocken med `Ada · n kort` och med Ångra/Flagga/Avsluta började vid **tre** kort vid 390 och vid tretton vid 1280 — vid varje bredd, alltså, och inte bara på telefon som #25 antog.
Den minsta träffytan var aldrig kortet utan **steget** till nästa kort, eftersom ett kort täcks av dem som ritas efter det: 11 px vid tjugoen kort på 390.
Och Ångra, Flagga och Avsluta mätte 76 × 32, 77 × 32 och 70 × 32 px vid varje bredd, ett brott mot 44 px som fanns före båda issuesen.

Den geometriska sanning som styrde hela valet: vid 390 px är bandet 358 px brett, och 358 px rymmer **åtta** träffytor på 44 px och inte fler.
En hand på tretton eller tjugoen kort kan alltså inte vara en rad med tryckbara kort på en telefon — inte vid någon lutning, inte vid någon kortstorlek.
Det lämnar exakt tre svar: rulla, radbryt, eller visa dem inte hela tiden.
Tre varianter prototypades mot varandra: **A, Facket** — fjädern överlever, bågen får tak och handen rullar; **B, Remsan** — K10:s remsa given åt `/online` också; **C, Uppslaget** — handen kallas fram som ett rutnät i stället för att alltid ligga där.

**Valet blev A, med C:s uppslag lånat som andra läge.**

B avråddes för att solfjädern är ett fattat beslut och inte en smaksak: K9 skriver in handfläkten i bordets bild och C2:s prototyp B är handen som fjäder vid filtens kant.
#24 är ett fel i *hur brett* fjädern fjädrar, inte ett argument för att fjädern var fel, och att svara på en trasig båge med att ta bort bågen är att kasta ett beslut för att en konstant saknade tak.
C avråddes som grundläge för att en hand man inte ser medan man spelar tar bort halva skälet till att en hand ritas alls, och för att den vid tre kort på en bred skärm gömmer något som ryms.
Vid 1280 — där `/online` faktiskt lever, eftersom det är distansvyn med både bord och hand i samma fönster — löser A allt utan att ta något, och där ger B och C bort något för ett problem som inte finns.

Så här är A byggd, och siffrorna är mätta i Chromium på den markup vyn faktiskt monterar.
**Bågen har tak på 30° totalt** (`FAN_ARC_MAX` i `packages/web/src/online/fan.ts`): 8° mellan två kort tills det blir för många, sedan 30/(n−1).
Sänkningen följer lutningen ned, annars hänger en nästan flat hand fortfarande.
Mätt: 16° vid tre kort, 30° vid tretton och vid tjugoen, vid 390, 1280 och 1440 — mot 160° före.
**Kortet behåller sin läsbara storlek och krymper inte längre för att rymmas**: 112 px som prototyp B läste det, 22 % av skärmens bredd, aldrig under 56 px. Mätt: 86 px vid 390, 112 px vid 1280.
**Det som ger vika är steget, och det bottnar på en fingertopp.** Steget dras ihop tills handen ryms i bandet och stannar där på 44 px. Mätt: 68 px vid tre kort på 1280, 52 px vid tjugoen på 1280, 44 px vid tretton och tjugoen på 390 — mot 23 och 14 px före.
**En hand som fortfarande är bredare än bandet rullar i sidled som fjäder.** Mätt: 673 px att rulla vid tjugoen kort på 390, 321 px vid tretton, ingenting alls vid någon bredd på 1280. Sidan själv rullar aldrig i sidled, vid någon bredd eller något antal.
**Hörnen lämnar bottenbandet**, av skälen och till priset som står under C4.
Och **Ångra, Flagga och Avsluta är 44 px** i båda riktningarna, tillsammans med `Visa alla`.

**Uppslaget är handens andra läge, inte dess grundläge.**
`Visa alla` fäller upp hela handen som ett rutnät i läsbar storlek över ett nedtonat bord, och där är inget vridet, inget överlappat och ingenting att rulla i sidled.
Då är C:s enda verkliga vinst — hela handen läsbar samtidigt vid vilket antal som helst — kvar, medan dess pris betalas bara av den som ber om det.
Det är samma mönster som K8:s "håll för att förstora" och K16:s panel: grundytan är direkt, och det som inte får plats i den kallas fram.
Uppslaget är `Question.tsx`:s uppförande tillämpat på en yta, precis som K16:s adresspanel är det: det tar fokus så att det läses där det står, det svarar på Escape, det lämnar tillbaka fokus till `Visa alla`, och det fångar ingenting.
Fokus landar på **första kortet** och inte på Stäng, för uppslaget fälldes upp för att läsas.

Två avsteg från prototyp C är avsiktliga.
Uppslaget täcker filten och bandet men **aldrig topplisten**, så Ångra, Flagga och Avsluta står kvar och är nåbara; en yta som täcker sidans enda Ångra har gjort den onåbar och inte bara gömd, och alternativet — att låta verktygen följa med upp i uppslagets huvud på en telefon — vore två kopior av samma tre knappar i ett dokument, vilket L10 redan har avvisat.
Och en hand som är större än skärmen **rullar i sin egen box medan sidan aldrig gör det**, vilket är L10:s regel för datatabellen tillämpad här. Mätt: alla tjugoen korten ligger utan att rullas vid 1280; vid 390 ryms femton och resten är 255 px ned i rutnätets egen rullyta.

Handen är **en kontroll och en kopia av sig själv i taget**.
Medan uppslaget står är bandet fortfarande ritat, nedtonat under det, men det ligger utanför tabbordningen och utanför tillgänglighetsträdet — som sidan bakom vilken uppfälld yta som helst. Två levande kopior av samma tjugoen kort vore tjugoen kort två gånger för en skärmläsare.

**K16 står orört och är mätt på nytt i båda lägena.**
Hela handen är ett tabbstopp med piltangenterna inuti, varje kort är en `button` med projektionens namn, och Enter öppnar adresspanelen.
Mätt: från första kortet i en hand på tjugoen når 20 × ArrowRight det tjugoförsta, i fjädern och i rutnätet; i fjädern drar `scrollIntoView` in det i den rullande ytan, vilket är L10:s regel för en remsa som rullar i sidled.
Rutnätet är `orientation: 'both'`, som filten, och roving-tabindexen är editorns `roving.ts` — ingen yta skriver en egen.

**Formen och rummet formen behöver är fortfarande ett och samma svar**, i `fan.ts` (K9, revideringen 2026-09-08).
Det gäller nu mer och inte mindre: en rullyta som reserverade mindre än de vridna korten målar skulle klippa exakt det taket infördes för.
Hur långt utanför sin egen ruta ett vridet kort målar beror bara på dess egen lutning och inte på hur långt isär korten står, så en och samma form svarar för varje steg skärmen kan råka välja.
Rutnätets radhöjd kommer ur samma tal, uttryckligen: en automatisk rad tar sin höjd ur vad kortet innehåller och inte ur kortets `aspect-ratio`, och stängde vid tjugoen kort på en telefon ihop till 83 px kring 120 px höga kort — alltså la rutnätet korten ovanpå varandra igen, det enda läget finns för att inte göra.

Grindarna är invarianter och inte tal, mätta vid 3, 13 och 21 kort och vid 390, 1280 och 1440 px: inget kort skärs av skärmen när bandet har hämtat fram det, ingen kontroll ligger över ett kort, ingen kontroll är under 44 × 44 px, inget steg är under 44 px, kortet är alltid mellan 56 och 112 px, sidan rullar aldrig i sidled, och i uppslaget överlappar inget kort ett annat.

Byggt 2026-09-08 (#24, #25). Prototypen `packages/web/src/prototype/band` togs bort när den hade svarat; dess resonemang står här.
Tre frågor som prototypen väckte och som produktägaren inte svarade på är avgjorda av implementationen och står i avsnitt I.

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
Prototypen `packages/web/src/prototype/groups` togs bort när även baksidesflödet i #14 hade svarat.

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

Verifierat och färdigställt 2026-09-07 (#14):
Ett dolt kort projiceras med just den baksideshash som dess rads grupp väljer, men utan `cardRef` eller framsideshash; det är testat på de råa WebSocket-frames som lämnar servern.
Trycköverlämningen är ett kortmanifest, inte två fristående listor: varje fysisk komponent bär hash för alla sina ansikten från samma kompilering av samma rad. Därmed kan en gruppframsida inte paras med standardbaksidan, kopior behåller varsin manifestpost och identiskt renderinnehåll delar jobb genom hashen.
Både fram- och baksida går genom `compileCard` med utfall och vidare som PDF-jobb till samma Chromium-renderare som övriga tryckunderlag.
`POST /projects/:id/print` gör överlämningen från projektets aktuella revision för dess inloggade ägare, köar de deduplicerade jobben och svarar med manifestets hashpar utan att lämna ut kompilerad HTML eller CSS.

### L8. Editorns utseende: kortväggen som hem, duken för mallen, tabellen som flik (prototypat 2026-09-06)

Tre prototyper: trepanel, kalkylbladet först, och kortväggen.
Valet blev kortväggen som startvy — hela leken renderad, antal och varningar per kort — med den stora duken (lager, valbara element, egenskaper) för mallarbete och tabellen som flik för massredigering.
Förhandsvisningen går genom `compile` och `fitInDocument` i DOM: samma kod som renderaren, så editorn visar vad trycket blir (E2).

Följdkrav som prototypen avslöjade och som nu är införda:
Kompilatorn har ett `scope`-alternativ så att många kort kan dela sida.
Ett rent tal i klamrar är en pip (L2).
Projekt är revisionerade dokument på servern med optimistisk samtidighet tills projektaktören (D3) finns; "uppdatera bordet" startar ett bord ur projektet (L5).

### L9. Osparat arbete: skillnaden mot servern, en fråga på vägen ut, bekräftelse före en radering

"Osparat" betyder att projektets dokument skiljer sig från det servern håller, inte att något har skrivits i editorn.
En ändring som skriver värdet som redan stod där, och en ändring som tas tillbaka för hand, lämnar leken sparad.

Skyddet gäller bara verkligt osparat arbete och finns på tre vägar.
`beforeunload` är registrerad exakt medan dokumentet skiljer sig, så en flik som stängs eller laddas om över en orörd lek stängs utan ett ord.
"Mina spel" i huvudet går direkt när ingenting ändrats och frågar annars, med "Spara och lämna", "Lämna utan att spara" och "Avbryt".
Ett sparande som krockar med någon annan lämnar inte editorn: konflikten sägs som `alert` och arbetet står kvar där det är.
Sparat eller osparat står i huvudet som ord och som färg, i en `role="status"`, så att bytet både syns och sägs.

Radering av ett kort från radens × frågar först, med samma ord och i samma remsa som åtgärdsradens massborttagning, och namnger kortet i stället för att räkna det.
Editorn har ingen ångra-stack; bekräftelsen är därför skyddet, och en ångra-historik över projektet är ett eget beslut.

Varje fråga editorn ställer före något som inte kan tittas på efteråt är en och samma komponent, `Question` (#17, #19, #8): en remsa där handlingen begärdes, som tar fokus, svarar på Escape och lämnar tillbaka fokus, och som aldrig fångar tangentbordet.
Frågan öppnar alltid på ett svar som inte förlorar något: "Spara och lämna" när det finns ett sådant, annars "Avbryt".
Fokus ligger aldrig på svaret som inte kan ångras, så den reflex som besvarar en fråga på vägen förbi — Enter på det som råkar hålla fokus — behåller arbetet i stället för att kasta det.
Svaret som inte kan ångras står kvar där det stod, i rött och med ord som säger vad det gör ("Ja, ta bort", "Ja, avsluta"): ett tabbsteg bort, inte ett steg längre in i frågan.
`Question` räknar själv ut vilket av sina svar som är det säkra; ett anropsställe talar om vad varje svar kostar, aldrig vilket av dem som ska ha fokus.

Motivering:
En varning som kommer när ingenting har ändrats lär designern att avfärda varningar, och skyddar då ingenting alls.
Dirty som en jämförelse mot servern i stället för ett minne av tangenttryck är det enda som gör den skillnaden möjlig att lita på.

Byggt 2026-09-07 (ingen ny prototyp: mönstret för frågan är det som redan är byggt och godkänt i #17 och #19).

### L10. Rummet en verktygstät yta får: etapper i editorn och wizarden, bordet först hos observatören (prototypat 2026-09-07)

`/editor`, `/new` och `/observe` gick sönder på små skärmar av samma skäl: de var byggda för en bredd och hade inget svar på att inte få den.
Frågan var aldrig vilken brytpunkt utan vad en yta *ger upp* när rummet tar slut, och tre svar prototypades mot varandra: krympa allt (A), kalla fram det som inte är arbetsytan (B), eller dela ytan i namngivna etapper (C).

Valet blev **C för editorn och wizarden och B för observatören**.
Editorn och wizarden är verktyg: de har redan flikar och roving-fokus (#11, #13, #18), så etapper lägger inte till en enda ny interaktionsmodell — bara en plattare version av den som redan är beslutad.
Observatören tittar i stället för att arbeta: hennes yta är ett bord och lite text, så bordet tar hela skärmen och allt annat kallas in bakom ett handtag.
Att blanda är inte en inkonsekvens; A, B och C är svar på hur mycket verktyg en yta har.

Editorn har tre rum, och gränsen mellan dem är vad ytan ärligt rymmer.
Från 1024 px är den editorn den alltid har varit: lägena i huvudet, duken i fyra kolumner.
Mellan 768 och 1023 px blir mallens fyra paneler fyra egna etapper i samma platta lista som lägena — `Kortvägg · Verktyg · Lager · Duk · Egenskaper · Tabell · Bord` — i en list längst ner, där `Spara` och `Uppdatera bordet` är fastnitade till höger så att de aldrig scrollar bort.
**Under 768 px finns ingen duk.**
Telefonen får `Kortvägg`, `Tabell`, `Bord`, `Spara` och `Uppdatera bordet`, och gränssnittet säger rakt ut vad som saknas och varför i stället för att tyst utelämna det: ett kort läggs ut i millimeter mot fyra paneler, och en yta som låtsas kunna det på 390 px ljuger för den som står i den.
En designer på en telefon ska lära sig att layout kräver en bredare skärm, inte undra var verktygen tog vägen.

Etapperna och skrivbordet monteras aldrig samtidigt.
Rummet avgörs i JavaScript och inte bara i CSS, eftersom två kopior av samma panel vore två av varje widget och två av varje element-id i ett dokument, och en skärmläsare skulle läsa den gömda kopian som verklig.
`Nytt bord` och pilen bredvid `Uppdatera bordet` lämnar huvudet under 1024 px; båda är genvägar till det `Bord`-fliken redan äger (L5), så ingenting blir onåbart.

Datatabellen har bara ett ärligt svar på en bred tabell och en smal skärm, och det är inte ett variantval: tabellen scrollar i sin egen box, sidan gör det aldrig, och kolumnen som tar bort en rad är fastnitad till höger så att den inte kan scrollas bort — den låg längst ut och försvann först.
Under 1024 px är filtret staplade rader där varje chip-grupp scrollar i sidled på en rad, eftersom en lek med en meningslång kolumn annars trycker ut raderna, som är det fliken finns för.

Wizarden är tre steg med ett mål var — `1 · Spelet`, `2 · Fälten`, `3 · Korten` — under 1024 px, och de två kolumnerna den alltid haft ovanför.
`Startram` ligger i steg 2 tillsammans med fälten den ramar in i stället för 700 px från kortet den ändrar, och förhandsvisningen äger toppen av sitt eget steg i full bredd.
På skrivbordet får förhandsvisningens kolumn aldrig bli smalare än ett helt 63 mm-kort: en förhandsvisning som klipper ljuger om kortet den visar.

Observatören har ingen banner.
`.byd-observer-banner` var `position: fixed` och låg ovanpå både bordet och rubriken `INSPEKTERA` — vid 390, 768 och 1280 px.
I stället är hennes status en rad i layouten längst ner: vem hon är, vägen till `Senast och platser`, och `⚑ Flagga`.
Under 1024 px är bordet hela skärmen och kolumnen är en låda som *tar rum från bordet* när den öppnas — under bordet, aldrig över det — med bordet kvar i ungefär hälften av ytan; i lådan står hennes hela mening överst, sedan flödet och platserna, och inspektionspanelen sist eftersom den är ett pekdons svar.
Från 1024 px är TV:ns egen layout orörd (#6): kolumnen står där den stått, och handtaget behåller bara det som är dess eget — vägen att flagga.

Grindarna gäller alla tre ytorna och mäts i Chromium på den markup de faktiskt monterar: ingen horisontell sidscroll vid 390, 768 och 1024 px, ingen träffyta under 44 × 44 px, och ingen krom som överlappar spelinnehåll på `/observe`.
Före: `/editor` var 893 px bred oavsett fönster (503 px utanför vid 390, 125 px vid 768) med `Spara`, `Uppdatera bordet` och flikarna oåtkomliga; `/new` hade 24–27 träffytor under 44 px och klippte förhandsvisningen vid 1024; `/observe` gav bordet 13 % av bredden vid 390.
En remsa som scrollar i sidled drar den fokuserade fliken in i vy, annars flyttar roving tabindex fokus till något ingen ser.
Wizardens accent är nedtonad från `#d85b36` till `#b8461f`, som bär AA i 11 px text mot pappret.

Två fynd på vägen är egna issues och inte lösta här: primärblå `#3c8ce7` ger vit text 3.44:1 (#22, avgjort i L11), och `TableRenderer` ritar handsolfjädrar i fasta pixlar och passar bara in golvet i sin ram, så ett bord som passats kant i kant alltid klipper sina egna händer (#23) — det syns fortfarande på `/observe` vid 390 och 768 px.
Prototypen `packages/web/src/prototype/responsive` togs bort när den hade svarat; dess resonemang står här.

### L11. Primärblått är två tokens, och en platsfärg bär mörk text (2026-09-08, reviderad 2026-09-10)

`#3c8ce7` var en färg med två jobb och klarade bara det ena.
Som fyllning under en vit etikett mätte den 3.44:1 och föll under AA; som kant, ring och märke på editorns mörka ytor låg den mellan 3.3:1 och 4.9:1 och gjorde precis det den skulle.
En enda mörkare blå hade lagat knappen och tagit sönder kanterna: `#1f6fd0` ger 4.95:1 mot vitt men bara 2.68:1 mot en markerad rad och 2.28:1 mot den öppna gruppens remsa.

Beslutet är därför att dela färgen efter jobb och inte efter yta.
`--byd-editor-primary-bg` är `#1f6fd0` och bär `--byd-editor-primary-ink` — vit text, 4.95:1 — på varje knapp och länk som är editorns första handling.
`--byd-editor-primary-mark` behåller `#3c8ce7` och är allt som bara ritas: markeringen på en markerad rad, ringen runt kortet som tittas på, fokusringen i datatabellen, handtagens kant, millimeterrutnätet över kortet och editorns kryssruta.
Två bar, två tokens: 4.5:1 för text, 3:1 för grafik, mätt mot den yta var och en faktiskt landar på.
Båda står deklarerade en enda gång i `editor.css`, och `editor-contrast.test.ts` låser både talen och att ingen yta skriver hexen på nytt.

Kryssrutan flyttades från fyllningen till märket 2026-09-10 (#45).
Den var först räknad som en första handling och bar därför `--byd-editor-primary-bg`, men en ikryssad ruta är ingen etikett: bocken i den är grafik och håller 3:1, vilket `#3c8ce7` gör mot vitt med 3.44:1.
Editorn ritar därmed en enda kryssruta på alla sina ytor — en storlek, `--byd-tick`, och en blå, med `color-scheme` satt så att den oikryssade rutan ritas i det mörker den står i.
Rutan är boxen och inte träffytan: det en tumme träffar är etiketten runt den, som är `--byd-tap` stor, så att en rad i kortbordets tabell behåller sin höjd.
`editor-viewport.test.tsx` mäter allt det i Chromium på varje flik och varje bredd granskningen läser.

Radioknappen är samma bock och inte en egen (#50, 2026-09-11).
Att välja en av tre fälttyper och att kryssa ett av många kort är samma handling att märka något, och skiljs bara åt av formen — så cirkeln och rutan står i en enda deklaration i stället för två som råkar vara överens.
Formuläret som skapar en kolumn finns bara medan dess dörr hålls öppen, vilket är varför #45 kunde nå varje kryssruta i editorn och ändå missa de tre cirklarna i det; mätningen håller numera dörren öppen.

Platsfärgerna (#20, K9) är inte primärfärgen och ändras inte.
Att den andra platsen råkar vara samma `#3c8ce7` är en sammanträffande identitet, inte en delad token, och paletten är hämtad ur godkända prototyper.
Felet låg i bläcket: anslutningssidans platsknappar och bordets namnbrickor bar vit text på en platsfärg, vilket ger 3.44:1 på den blå och 2.44:1 på den gula.
Paletten är däremot redan gjord för mörkt bläck — TV-dockans avatarer använde `#0d0f14` hela tiden — så namnbrickan och platsknappen tar samma bläck som avataren, och varje plats landar mellan 4.80:1 och 7.84:1.
`--byd-seat-ink` är den ena definitionen, och `seat-contrast.test.ts` mäter den mot hela paletten i båda riktningarna: bläcket på platsen, och platsen som text och kant mot mörkret den läses på.

Wizardens `--accent` är dess egen varumärkesfärg och ingenting av detta rör den.

### L12. Editorn är ett skrivbordsverktyg, telefonen är spelarens (2026-09-11)

Editorn och den medföljande telefonvyn har dragits mot samma krav, och det är fel krav för den ena av dem.

Formgivaren sitter vid ett skrivbord.
Hon arbetar i en datatabell med sex kolumner, drar element på en kortduk i millimeter, och håller lagerpanelen och egenskaperna i syn samtidigt.
Det är arbete som vill ha bredd, en mus och ett tangentbord, och en editor som optimeras för en telefon blir sämre på det den faktiskt används till.
Telefonen i playtestet är den andra saken: den hålls i en hand runt ett bord, och **den** måste vara utmärkt på en liten skärm.

Beslutet är därför att skilja kraven åt efter yta:

- **Editorn** (`/editor`, `/new`, kortväggen, duken, tabellen, wizarden) är skrivbordsförst.
  Den granskas och mäts vid skrivbordsbredder.
  Den ska **degradera, inte garantera** på en smal skärm: den förblir nåbar, får inte gå sönder och får aldrig tappa arbete — men layouten är varken optimerad eller granskad under skrivbordsbredd.
- **Spelarens ytor** (`/play`, `/online`, `/join`, observatören) är mobilförst och granskas vid 390 och 320 som förut.
  Bordets egen skärm (`/table`) är en TV och har sina egna mått (K9, C5).

Gränsen går vid *vem som håller ytan*, inte vid vilket paket koden ligger i.

**Vad detta inte betyder.**
Tillgänglighet är inte detsamma som mobilstöd, och ingenting här rör den.
Tangentbordsdrift, fokusordning, läsordning, uppläsbara namn och roller, kontrast och `prefers-reduced-motion` gäller editorn fullt ut — en formgivare som arbetar på tangentbord eller med skärmläsare är en *skrivbordsanvändare*, och K16 och L11 står oförändrade.
Träffytorna i `docs/UX-KONTROLLER.md` står också kvar; 44 px skadar ingen mus, och att riva ut dem vore att lösa ett problem som inte finns.

**Följdkrav.**
Den generella regeln i `docs/UX-KONTROLLER.md` — att varje yta granskas vid 390, 768 och 1280 — gällde alla ytor lika och är det som drog editorn hit.
Den är nu uppdelad per yta i samma dokument.
Mätande tester som låser editorns layout vid 390 eller 320 låser ett krav som inte längre finns; de tas bort eller skrivs om till skrivbordsbredder när de står i vägen för ett designval, men jagas inte upp i förväg.
Ett öppet issue vars fynd bara gäller editorn på en smal skärm är inte längre ett fynd.

---

## I. Öppna frågor

Ekonomi och juridik:
Moms, tull och leveransvillkor för fysiska varor till EU-kunder från amerikansk eller asiatisk partner — DDP eller DDU, vem står för tullavgiften, IOSS-registrering.
Prisnivåernas exakta tak och gratisnivåns gränser.
GDPR för gästdeltagare, särskilt enkätsvar och flaggor från personer utan konto.
Fontlicensiering, som krockar med kravet i B3 att behålla fontfiler permanent.

Teknik:
Aktivitetsflödet vid anslutning: löst 2026-09-07, snapshoten bär de senaste femtio raderna, se K9.
Behörighetsroller i detalj: löst 2026-09-08 som en modell i D3 — ägare, medredigerare, testledare, betraktare, med inbjudan per adress.
Tillgänglighet i verktyget självt, till skillnad från i de spel som skapas i det.

Tangentbordet på bordet, kvar efter K16 (2026-09-08).
Implementationen följer prototypens egna val på alla fem; de står här för att de är produktbeslut och inte kodval, och för att de annars försvinner.
Utläggningsregeln för ett kort som flyttas till en yta: klienten lägger det på nästa lediga plats i en rad, uträknat ur zonens bredd. Det är prototypens gissning. K2 säger fri placering utan rutnät och säger ingenting om vad ”i zonen” betyder när ingen pekar, och ett riktigt svar ändrar hur filten ser ut också för pekaranvändare.
`movePile` och `split` utan `to` kräver x och y i protokollet, och ett tangentbord har inga: klienten hittar på zonens eget hörn. Alternativen är en zonrelativ form av de två verben, vilket är en protokollmigrering och ett eget beslut, eller att hela högar förblir pekaruteslutande.
Vem tangentbordet är på `/table`: bordsskärmen har ingen plats och agerar som ”Bordet”, så fokus är en enda markör på en skärm ett helt rum tittar på. Till skillnad från två pekare syns det inte att det är en kö. Kanske är svaret att tangentbordsvägen där bara är till för den som sitter vid skärmen.
Om vi namnger mer än pekaren visar: ”Marknad: Skugga, Gruva, Spion” gör korträkning lättare än att läsa filten på tre meters håll. Det är samma information, och det är behandlat som tillåtet, men det är ett produktbeslut om playtestets naturlighet (C8 resonerar likadant om observatören).
”Titta” loggas inte: ringens och panelens ”Titta” sätter bara lokalt tillstånd och skickar ingen `peek`, medan B6 säger att varje titt loggas som händelse. Avvikelsen fanns redan i pekarvägen; tangentbordet gör den synlig, eftersom verbet nu står i en lista med de andra. Ska ”Titta” bli `peek`, eller är B6:s ”titt” bara den som ger ny kunskap?

Distansvyns hand, kvar efter K17 (2026-09-08).
Prototypen ställde tre frågor som produktägaren inte svarade på, och implementationen har svarat på alla tre.
De står här för att de är produktbeslut och inte kodval, och för att de annars försvinner.

Rullning kontra dragning i fjädern: uppdelningen är en riktningströskel, avgjord en gång per tryck och aldrig omprövad.
Den första rörelsen som är 12 px lång bestämmer, efter vilken av de två axlarna den gick längst: uppåt eller nedåt är ett kort som spelas och tar pekaren, i sidled är fjädern som rullar och trycket kan därefter inte spela alls, hur det än slutar.
Webbläsaren får samma besked i `touch-action: pan-x`, så en fingerdragning som panorerar är rullytans redan innan den når kortet.
Alternativen var ett handtag som rullar, eller rullning bara med piltangenter; båda tar bort det som är hela poängen med en fjäder, att ett kort greppas där det ligger.
Följden som är värd att veta: ett tryck som inte färdas alls spelar numera ingenting, där det förut spelade kortet dit fingret råkade släppa — bandet ligger under filten, så punkten ett tryck släpper på är inte en plats på bordet att lägga ett kort.
En dag då ett tryck ska betyda något (inspektera, som K8 gör på telefonen) är det den lediga gesten.

Om 30° är rätt tak: det är en gissning som ser rätt ut, inte ett mätt tal.
30 är valt för att handen ska läsas som en hand snarare än som en båge; 24 packar hårdare och låter fler kort rymmas innan bandet börjar rulla, 40 ser mer ut som ett riktigt kortfack.
Det är avsiktligt en enda konstant, `FAN_ARC_MAX` i `packages/web/src/online/fan.ts`, och både ritningen och rummet ritningen behöver räknas ur den, så att ändra talet ändrar båda i samma andetag och kan göras utan att någonting annat rörs.

Om `/online` på en telefon ska vara samma hand som `/play`: valet av A framför B säger nej, tills vidare.
`/play` är K10:s remsa och `/online` är K17:s fjäder, alltså får en spelare som spelar på telefon via `/online` och en som spelar via `/play` två olika händer på samma sorts skärm.
Skälet är att `/online` är distansvyn med både bord och hand i samma fönster och därför i praktiken lever på en bred skärm, medan `/play` är telefonens egen vy och bara har handen att visa.
Det är försvarbart men det är inte skrivet någonstans som ett beslut: K9 bör säga varför distansvyn har en egen hand, eller så bör de två slås ihop.
Anser produktägaren att de ska vara oskiljbara är remsan svaret på båda, och då är K10 det som ska skrivas om och inte K9.

Spelupplevelse, kvar efter avsnitt K: inga; de två sista avgjordes 2026-09-07, se K1 och K2.

Fellägen, kvar efter D5:
Om tidpunkten i "Det du ser är från 14:32" ska vara absolut eller relativ; implementationen står på absolut, som är entydig men läses sämre i ett spel som pågår.
Om bordet ska frysas synligt vid tappad anslutning eller om korten ska tas bort helt tills snapshoten är tillbaka; implementationen fryser och tonar, vilket är ett spelbeslut och inte ett UI-beslut.
Om 401 och 403 ska skiljas åt i orden; de slås i dag ihop till "Du har inte tillgång" med både inloggning och hemväg, eftersom en gäst sällan vet vilket som gäller.
Om det finns en väg ut ur ett bord från telefonen alls, eller om bara TV:n kan avsluta ett rum.
Om en observatör (C8) ska få samma ord som en spelare, eller ord som inte antyder en plats.

---

## J. Ett mönster värt att bära med sig

Fyra beslut gick emot rekommendationen: enbart POD, ingen inbyggd röst, kostnadsbesked först i kassan, och inga fysiska playtests i mätningen.
Var för sig är alla fyra försvarbara.
Tillsammans skär de bort kopplingarna mellan pelarna.
Resultatet är tre bra verktyg bredvid varandra snarare än en sluten slinga, och slingan var den ursprungliga säljpunkten.
Detta är en observation, inte en invändning — men det är den axel produkten kan komma att behöva omprövas längs.
