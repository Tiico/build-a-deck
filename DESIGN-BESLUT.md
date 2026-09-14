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

Genitiv, 2026-09-14 (#89):

En ägandeform är grammatik och inte text, och därför bor den i språklagret.
Katalogen skrev ändelsen för hand — `{name}s räknare` — vilket är rätt för `Ada` och fel för de två andra fall en plats namn kommer i: en enda bokstav eller en förkortning tar kolon före sitt `s` på svenska (`A:s`), och ett namn som redan slutar på s, x eller z tar ingenting alls (`Lars räknare`).
En obesatt plats heter just `A`, så det felaktiga fallet var det filten visade oftast.
Anropsstället kan inte avgöra det: det har ett namn och inget språk.
Så ett meddelande *ber* om formen med `{name:s}` och språket svarar — svenskan med sina tre fall, engelskan med sina egna (`Ada’s`, `A’s`, `Lars’`).
Regeln står i `possessive` i `packages/web/src/i18n/index.tsx`, ett svar per språk, och katalogerna skriver aldrig en ändelse själva.

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

Reviderat 2026-09-14 (#78, UX-33, prototypat och godkänt av produktägaren): verben ligger inte kvar i remsan utan i uppslaget.
Remsan står kvar där C4 satte den, men kortet är en enda kontroll: ett tryck håller upp det, precis som ett tryck på ett handkort, och Vänd, Ta upp och Spela läses i uppslaget i full bredd och minst 48 px höjd.
Måttet är vad som tvingade fram det: den renderade framsidan låg över hela kortet och därmed över dess tre knappar, så `elementFromPoint` mitt på "Ta upp" svarade kortets namn och ingen nådde knapparna alls; knapparna var därtill 32 px höga, och en bild utan storleksregel ritades i sin egen 630 × 880, vilket gjorde kortet 150 × 973.
En 44 × 44-ruta räcker inte som svar — "Vänd ner" sätts då i 10 px över två rader — så verbet flyttade dit det får vara ett ord.
Priset, uttryckligen accepterat: ett tryck till per verb. Vinsten: 3,9 kort syns vid 390 px i stället för 2,4, och remsans kort kan vara en kontroll utan att hålla en (UX-37, #82).
Ansiktet är sedan dess en egen ruta i kortet — bilden fyller den, och väntan och förlusten ligger över ansiktet och aldrig över kontrollen.

Reviderat 2026-09-14 (#89): en plats räknare ligger bredvid varandra upp till två och staplas vid tre.
Regeln, delningen på 125 mm, högens ring och de förkastade alternativen står under K18, eftersom det som avgör dem är platsens egna 500 mm.

Reviderat 2026-09-14 (#79, UX-34): telefonen får dra.
Den tomma handen sa "Tom hand. Dra ett kort ur draghögen." medan telefonen inte hade någon väg att göra det: bordsöversiktens hög var ren text med ett antal, adresspanelen (#1) öppnas bara på ett kort som redan ligger i handen, och arket är för ett kort som redan lyfts.
Skärmen bad alltså om något skärmen inte kunde göra.
Översiktens hög är nu själva kontrollen: ett tryck lägger högens översta kort i platsens hand.
Handens ord står kvar oförändrade, eftersom de nu är sanna som de står.

Verbet är inget nytt.
Det är exakt det filtens ring redan erbjuder på vilken hög som helst (K14) — `split` med `at: 1` och `to: hand:<plats>` — och på exakt samma villkor: en hög som har minst ett kort, och bara för en läsare som håller en plats.
Att det erbjuds **per hög** och inte bara på draghögen är ett måste och inte en slarvighet: snapshotet säger inte vilken hög som är leken.
`ZoneView` i `packages/protocol` bär `id`, `kind`, `name`, `shortcut`, `owner`, `geometry`, `dynamic` och ordningen eller antalet — ingen flagga för "det här är leken" — och `deckZone` bor i setupen på servern och reser aldrig med.
Att vidga vokabuläret vore en protokollmigrering och ett eget beslut, och att gissa leken ur ett zon-id som `draw` vore koden som tyst avviker: en designer får kalla vilken zon som helst för leken.
Vid wizardens bord blir det draghögen och kasthögen, vilket är precis vad den som står vid bordet redan kan göra med ringen på var och en av dem.
Det är alltså ingen utvidgning av vad en spelare får göra, bara samma sak sagd på den skärm som frågar efter den.

Brickan är en enda kontroll och inte en bricka med en knapp i sig (UX-37, #82).
Verbet läses inne i brickan i dess egen bredd, hela brickan är träffytan — 89 × 48 px vid 320 px, långt förbi 44 × 44 — och dess uppläsning bär högens namn, dess antal och verbet utan en påhittad etikett.
En knapp inuti brickan hade i stället varit drygt 69 px bred med ett brutet ord i sig, och hade brutit mot regeln att en kontroll inte får hålla en kontroll.
Areor och golvet får inget verb; golvet är ingen bricka alls, som förut.
Ordet är ringens eget, `kbd.verb.toHand` ("Dra 1 till min hand"): en handling, ett ord (A4).
`ring.draw` ("Dra 1") återanvändes inte — på filten betyder det något annat, ett kort **bredvid** högen och inte in i en hand — och två ord för samma sak hade blivit två handlingar i läsarens huvud.
Ett nej från bordet står vid den hög som trycktes, med ett eget svar som aldrig hamnar i arket (#7).

Grinden är `table-summary.test.tsx` för villkoren per hög, `player-page.test.tsx` för att kortet hamnar i handen och loggen säger det, `status-refusal.test.tsx` för att nejet står vid högen, och `player-viewport.test.tsx` för träffytan vid 320 och 390 px.

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

Reviderat 2026-09-14 (#66): ramen tar inte emot.
Träramen runt filten ritas i skärmpixlar utanför de millimeter ett släpp mäts i — 30 px vid varje fönsterstorlek — och är ingen yta ett kort kan ligga *på*.
Ett släpp vars avgörande punkt, pekarens (K2, #74), ligger utanför filtens golv lägger kortet vid närmaste kant på filten: kortets vilorektangel skjuts den kortaste sträcka som får den att ligga hel innanför golvet, på alla fyra sidor och i alla fyra hörn, hur långt förbi träet släppet än sker.
Inget kort kan hamna på en yta som inte är bordet genom ett släpp.
Ett släpp på filten är oförändrat; kortet ligger där det släpps.
Regeln bor i `keptOnFelt` och `ontoFelt` i `packages/web/src/table/drop.ts`, mätt i golvets egna millimeter och inte i skärmens pixlar, och ställs av varje släppväg: ett löst kort, flera kort dragna tillsammans som skjuts som en enhet så de behåller sina inbördes platser, en högs topp, en hel hög som färdas med sin mitt, en bricka (C4) i sin egen storlek, samt distansvyns `playedAt` (K17).
Det som landar i en annan zon än golvet lämnas som det är: filten är golvets kant och ingen annans.

Två vägar förkastades.
Väg 1, att låta det vara och räkna träramen som en del av ytan: ommätningen efter #64 visade att ett kort släppt mitt på ramen skrävar över filtkanten — 19 % på filten, 65 % på ramen, 16 % utanför träet — och att ett kort skjutet längre ut hänger 62 % på den mörka omgivningen med 0 % på filten, vilket ser sämre ut i dag än när frågan ställdes.
Väg 3, att låta filten växa tills ramen är smalare än ett kort, ströks: ramen var smalare än ett kort redan före #64, och eftersom den ritas i pixlar blir den aldrig bredare; var ett kort hamnar avgörs av punkten och inte av om kortet ryms på ramen, så #64 ändrade bara hur felet ser ut.
Priset, uttryckligen accepterat: en avsiktlig placering strax utanför filten går inte längre genom ett släpp.

Distinktionen mot handen står i K2 (#65) och är avsiktlig: en fläkt som ritas ut över ramen är fortfarande den handen, och ett släpp på den delen av fläkten är ett släpp i handen.
Det som avgör är vad som ritas där man släpper: filt eller fläkt tar emot, trä gör det inte.
Kamerans regel ovan står kvar oförändrad: en delning bredvid en hög vid kanten (K1, K15) kan fortfarande lägga ett kort utanför filten, och då följer kameran med ut; genom ett släpp finns inget sådant kort längre.

Grinden är `drop.test.ts`, i båda lägena: ett släpp mitt på varje ramsida och långt förbi träet, i alla fyra hörn, för ett löst kort, en högs topp, en hel hög och en bricka; ett släpp på filten oförändrat; och distansvyns `playedAt`.

Reviderat 2026-09-14 (#77, UX-32, prototypat och godkänt): **platsens kvartsvarv gäller bara där fönstret också ber om ett.**

C5:s ordalydelse är att orienteringen följer platsen, och `/online` har läst det som att den egna kanten alltid läggs nederst.
På en telefon kostar det ingenting: fönstret är stående, bordet liggande, och platsens kvartsvarv är samma varv som `turnToFit` (C8) ber om ändå.
I ett liggande fönster ställer samma varv bordets långsida mot fönstrets korta, och då är det inte ett mindre bord utan ett obrukbart: mätt på den målade rutan i Chromium, på wizardens eget fyraplatsbord, var kortets kortsida vid en sidoplats **17 px vid 1280 × 800 och 29 px vid 1920 × 1080**, mot K9:s grind på 45.
En bottenplats vid samma fönster fick 27 respektive 45 px — alltså ligger felet inte bara i vridningen, men vridningen är det som gör en sidoplats dubbelt så illa som sin granne.

Beslutet: **en sidoplats vrids inte i ett liggande fönster.**
Regeln är de två halvornas sammansättning och bor på ett enda ställe, `seatTurn` i `packages/web/src/online/seat.ts`, som är den enda ytan som behöver båda: halvvarven (en plats vid den bortre kanten) rör inte bordets form och står alltid kvar, och kvartsvarven behålls bara där `turnToFit` ber om ett kvartsvarv ändå.
Efter ändringen ritas sidoplatsens kort i **31 px vid 1280 × 800 och 50 px vid 1920 × 1080**, samma som varje annan plats vid samma fönster.

**Vilken kant som är din sägs i stället på bordet självt.**
K9 ritar redan ett namnkort längs varje plats egen kant, vänt mot den som sitter där; det som saknades var att ett av dem är läsarens eget.
Läsarens namnkort ringas därför i filtens eget bläck (`data-me` på `.byd-seat-name`, satt av renderarens `me`), som namnkortet med ditt namn på vid ett riktigt bord.
Det gäller vid varje vridning och inte bara vid den uteblivna, eftersom en markering som bara finns ibland är en markering man inte lär sig läsa.

Priset, uttryckligen accepterat: en spelare vid öst eller väst ser bordet från sidan i ett liggande fönster, och vet var hen sitter av sitt eget namnkort i stället för av att bordet vänts.
Det är samma byte C8 gjorde åt observatören (#76), gjord åt en plats.

**Den mätta tröskeln byggdes inte, och det är ett beslut.**
Prototypen prövade en tredje väg — behåll platsens vridning där det vridna bordet ändå ger ett spelbart kort — och rättad för lutningen utlöstes den aldrig: det finns inget mätt fönster där en sidoplats kvartsvarv räcker till K9:s 45 px.
Den degenererar därför överallt till den regel som nu står, och en regel som kan få ett större fönster att rita ett mindre kort är sämre än båda halvorna var för sig.

**En regel om ett kort ställs till det ritade kortet och aldrig till skalan.**
`skala × 63 mm` övervärderar med omkring 15 % vid filtens bortre kant, eftersom lutningen äter den; prototypens första svar behöll en vridning på ett "51 px"-kort som Chromium målade som 43.
Varje mätning ovan, och varje grind i `online-felt.test.tsx`, läses därför av `getBoundingClientRect` på ett kort som ligger på filten.

**13°-lutningen rördes inte.**
Prissatt för sig kostar den omkring en pixel skala, och `feltScale` är redan lutningsmedveten och nära optimal; att spendera K9:s bord för att köpa pixlar köper inga.

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

Reviderat 2026-09-14 (#76, prototypat och byggt): **filten vänds ett kvartsvarv när fönstrets form inte är bordets.**

Observatören är en spelaryta och ska hålla vid 390 och 320 (L12), och gjorde det inte.
Ett landskapsbord som passas in upprätt i ett porträttfönster binds av fönstrets korta sida och lämnar den långa tom: vid 390 × 844 ritades golvet 272 × 182 px, kortets kortsida blev 15 px och fjorton etiketter låg i ett utrymme som rymmer fyra — femton par av dem på varandra.
#6 gav henne en mobilvy men inte en filt som får plats i den.

Beslutet är variant A, kvartsvarvet: bordet vänds så att dess långsida löper nedför skärmen och filten fyller bredden.
Regeln läses ur de två formerna och skrivs aldrig ned per yta — ett fönster vars orientering stämmer med bordets ligger redan rätt — och bor i `turnToFit` i `packages/web/src/table/fit.ts`.
Den är observatörens ensam: en plats egen filt vrids av var platsen sitter (C5), och bordets egen skärm är en TV som är landskap av konstruktion (K9).
Ingenting döljs, ingenting kapas, och ingen ny gest införs.

Priset, uttryckligen accepterat: observatörens bord läses vridet på en telefon och upprätt vid ett skrivbord.

**Luften mellan filten och ramen var ett tal för två skäl.**
`LEAST_AIR_PX` var 44 px i båda lägena och sade sig vara till för träramen — men `.byd-table-frame[data-mode='tv'] .byd-table-wood` har `padding: 0`, så i TV-läge finns ingen ram.
44 px på var sida av ett fönster på 390 är 23 % av det, givet åt ingenting.
Det som faktiskt bor i den luften på en TV är handräknarnas pill: de hänger förbi sin hand i skärmens pixlar och inte i filtens millimetrar, och mäter ungefär 18 × 22 av dem.
Talen är därför två: `WOOD_AIR_PX` 44 i bordsläge, där filten ligger på sitt trä och träet står på mörkret och luften är bordets andel av rummet, och `TV_AIR_PX` 20 i TV-läge, som är ett pills bredd och inte mer (8 px kapade dem).
Det är värt omkring en tiondel till i skala.

Mätt efter hela ändringen, fyra platser med yta och räknare framför varje och två delade högar:

| Fönster | Golvet före | Golvet efter | Kortets kortsida | Namnpar på varandra |
| --- | --- | --- | --- | --- |
| 320 × 568 | 210 × 140 | 239 × 358 | 12 → 20 px | 27 → 0 |
| 390 × 844 | 272 × 182 | 331 × 496 | 15 → 27 px | 15 → 0 |
| 768 × 1024 | 611 × 408 | 543 × 813 | 34 → 45 px | 0 → 0 |
| 1280 × 800 | 624 × 417 | 692 × 462 | 35 → 38 px | 0 → 0 |

Vid 768 blir golvets bredd mindre och kortet ändå större: bordet vänt fyller fönstrets långa sida, som är den som fanns.
Vid 1280 vänds ingenting; de 68 pixlarna där är enbart luften.

Grinden är `packages/web/test/observer-viewport.test.tsx`: vridningen som funktion och på skärmen, varje namn en gång vid varje fönster, ingen etikett under 12 px, varje ord upprätt genom vridningen, och varje hand och varje hög ritad innanför ramen med sitt pill helt inne i den — det sista är vad `TV_AIR_PX` finns för och vad som fäller talet om det skärs igen.

**Kvar, känt och inte lagat här:** ett kort på filten kan inte ritas smalare än omkring 18 px.
`.byd-pile-top` och `.byd-card` bär `padding: 7px` plus en kant i *skärmens* pixlar under `box-sizing: border-box`, så ett kort vars egna millimetrar är färre än så växer utanför sin egen fot och varje pixel av det är stoppning.
Vridningen och luften lyfter observatören över den tröskeln på båda telefonerna: kortets kortsida var 12 px vid 320 och 15 vid 390, och är 20 respektive 27.
Vid 320 är marginalen två pixlar, och det som bär den är skalan och inte regeln — så en filt som krymper igen möter kortens golv innan namnen möter sitt.
De två deklarationerna i `table.css` står numera som en och säger det om sig själva; att laga det är en annan skivas sak.

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

En bild på flera kort på en gång (prototypat och byggt 2026-09-14):
Tre sätt prövades: en bildruta i handlingsraden för de markerade korten (#17), spelets bilder i brickan som mål, och en låda som öppnas ur raden.
Valet blev bildrutan i raden: när kolumnen raden skriver är ett bildfält byter värdefältet form och blir en plats att släppa en bild eller välja en fil på, och knappen säger "Sätt bild på N kort".
Brickan förkastades för att den växer till två rader så snart ett kort är markerat och skjuter hela tabellen nedåt; lådan för att den lägger ett steg och en panel mellan raden och korten den handlar om.
En vald fil laddas upp en gång oavsett hur många kort den hamnar på, vilket är samma regel cellen redan följer.
Raden släpper bilden när den är satt: en kvarhållen bild och en ny markering är en bild skriven av misstag.
Samtidigt stängdes hålet som låg bredvid: ett bildfält går inte längre att skriva ren text i från handlingsraden, som tidigare bjöd en textruta för varje kolumn.

Bildernas storlek jämnas ut på motivet, inte på filen (byggt 2026-09-14):
En leks illustrationer kommer en fil per kort, och två filer som bär samma motiv bär det sällan i samma storlek — den ena har en handsbredd genomskinlig luft runt teckningen, den nästa nästan ingen.
Passas filen in i ramen ritas därför motivet olika stort på varje kort, och det är inget mallen kan säga något om: den vet bara att där sitter en bild.
Tre vägar prövades: ett gemensamt mått att passa in efter (alla bilder exakt ramens höjd eller bredd), justering per kort i tabellen, och automatisk beskärning av tomrummet.
Valet blev beskärningen, därför att den tar orsaken och inte symptomet: ett gemensamt mått jämnar ut filerna men inte det som är ritat i dem, och justering per kort är fyrtio handgrepp som måste göras om när bilderna byts.

Motivets ruta är filens egen pixelstorlek plus den enfärgade eller genomskinliga ram den bär runt det som är ritat.
Marken är den översta vänstra pixeln och bara om de tre andra hörnen säger samma sak; en bild vars hörn är oense har ingen mark att skala bort och lämnas orörd, liksom en bild som är idel mark.
Toleransen är åtta steg per kanal, eftersom ett fotografis vita aldrig är ett enda tal.

Mätningen är av bytesen, så den görs en gång per innehållshash och ligger bredvid typen och storleken i `assets` — samma cachning som E4:s screening förutsätter.
Den görs i webbläsaren, som redan har avkodat filen för att visa den: det kostar en uppritning och lägger ingen bildavkodare i appcontainern, som medvetet är utan Chromium (DRIFT §6).
Klienten frågar servern först och mäter bara det servern inte vet, och berättar sedan — så en lek gjord innan det fanns något att mäta hinner ifatt första gången den öppnas.
Den första mätningen är mätningen: en andra skriver inte över, eftersom samma bytes alltid bär samma motiv och en bild kan sitta i tio andras lekar.
En mätning som inte kan vara av en bild — en ram som äter hela bilden, negativa tal — tas inte emot, för en lagrad mätning beskär varje kort som använder filen.

Valet i mallen är en växel på bildelementet, `trim`, och inte ett läge till i `fit`: de två frågorna är olika — vad som passas in, och hur det möter ramen — och de besvaras oberoende.
Kompilatorn passar in motivet enligt elementets `fit` och lägger sedan filen runt det i samma skala; ramen beskär som den alltid gjort.
Därför bär ett bildelement nu en ram i markupen, `<div data-element><img class="byd-art">`, i stället för att vara bilden: `data-element` är ramen designern greppar, vilken inpassning som än gäller.
En fil som ingen har mätt passas in som en fil, så växeln kan aldrig tappa bort en bild.

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

Solfjädern på spelkortet 2026-09-14 (prototypat, variant D av sex):
De fyra korten på spelets kort är spelets egna kort, inte fyra rektanglar färgade ur spelets id.
Urvalet är jämnt spritt över leken med första och sista kortet med, så en lek på hundra kort visar sin bredd och inte bara det som skrevs först; urvalet följer lekens ordning, så samma spel ser likadant ut varje gång det listas.
Varje kort bär sin titel och kortets egen färg — samma `hue(cardRef)` som vid bordet — så ett kort man känner igen i spel känns igen i listan. En titel som inte får plats bryts över flera rader, avstavad där sidans språk tillåter det, i stället för att försvinna under nästa kort; ett kort utan titel svarar på sitt id som överallt annars.
En lek utan kort säger "inga kort än" i solfjäderns ställe och behåller platsen, så rutnätet står jämnt.
`GET /projects` bär urvalet: `peekCards` väljer i `packages/server/src/names.ts`, och båda lagren — minnets och Postgres — ger samma svar. Postgres hämtar bara id och titel ur dokumentet, aldrig hundra hela rader för att rita fyra kort.

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

Punkten som prövas är pekarens (beslutat 2026-09-13, #74).
Det man siktar på är det som gäller, och inget annat på bordet kan göra anspråk på att vara släppet.
Bordet prövade i stället kortets lagrade övre vänstra hörn, som ligger en halv kortbredd och en halv korthöjd från en pekare som greppat kortet i mitten: det drog släppet tillbaka in i handens rektangel vid södra och östra kanten och ut ur den vid norra och västra, så samma gest fick ett svar vid en kant och ett annat vid den motstående, och felet växte med filtens skala.
Var kortet sedan hamnar inne i zonen följer fortfarande greppet — pekarens plats i zonen, förskjuten med var i kortet man tog tag — för det är kortet man bär och inte pekaren.
Två alternativ förkastades: kortets mitt, som hade varit symmetriskt men låter pekaren och det avgörande gå isär så snart kortet greppats i ett hörn, och att behålla hörnet men normalisera greppet, som hade bevarat själva felet — att den avgörande punkten är en som ingen ser.

Följdkrav:
Zonrektanglarna är direkt återanvändbara som spelplansunderlag vid tryck.
En `slots`-zonkind kan läggas till additivt när ett riktigt spel kräver det.

Reviderat 2026-09-14 (#65): den ritade solfjädern tar emot, hela.
En hand är det enda zonslag som ritas som något annat än sin rektangel: en 60 mm remsa längs kanten (K18) under en fläkt av 75 mm höga kort, som är djupare än remsan och hänger ut förbi filtkanten över träramen (K9, #23, #84).
Det man ser var alltså bredare än det som tog emot — omkring en tredjedel av varje ritad fläkt lade kortet löst — och det växer med filten i stället för att läka på en större skärm.
Nu är fläktens utsträckning, `handExtent` i bordets egna millimeter, det som tar emot ett släpp till en hand, på varje kant och i båda lägena, också där fläkten ligger utanför filtkanten.
Bilden är sanningen: ett släpp var som helst på den fläkt man ser lägger kortet i den handen, och ett släpp utanför fläkten gör det inte.
Ett löst kort, en högs topp och en bricka frågar samma uppslagning, `dropAt` i `drop.ts`, så samma punkt ger samma svar vilken väg den än kommer in.
Andra zonslag prövas som förut, mot sin rektangel.

Följden, uttryckligen accepterad: en fri placering kan inte hamna närmare handen än fläktens kant.
Remsan filt vid sidan av fläkten, som rektangeln förut gjorde till handens, är filt som all annan: ett löst kort släppt där landar löst, ända intill fläkten.
En hand utan kort ritar ingen fläkt, och där säger remsan fortfarande var handen är, så att det första kortet går att lägga i den.

Två alternativ förkastades.
Fläkten men bara innanför filten hade lämnat omkring 30 % av den ritade fläkten död, vilket är exakt vad felet består i, bara mindre.
Att rita om handen så att den håller sig i remsan hade gjort handen visuellt mindre och rört ett godkänt utseende (K9, #23).

Distinktionen mot träramen (#66, väg 2: ramen tar inte emot något) är avsiktlig och ingen motsägelse; beslutet och dess skäl står under C5.
Ramen är ingen yta man kan lägga ett kort *på*, och ett släpp på den lägger kortet vid närmaste kant på filten; men en hand som ritas ut över ramen är fortfarande den handen, och ett släpp på den delen av fläkten är ett släpp i handen.
Det som avgör är alltså vad som ritas där man släpper: filt eller fläkt tar emot, trä gör det inte.

Grinden är `drop.test.ts`: fläktens hörn, kanter, mitt och utsprång på alla fyra kanter, i båda lägena, för ett löst kort och för en högs topp; remsan bredvid fläkten som filt; en punkt strax utanför fläktens yttre kant som inte hand; den tomma handens remsa; och distansvyns `playedAt`.

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

Reviderat 2026-09-12 (#64, #63): filten mäts mot den form lutningen faktiskt ritar, och bordet lutar 13° i stället för 24°.
Andelsregeln ovan mätte den **oluttade** rutan mot ramen och lät sedan `rotateX` krympa den, så det som faktiskt ritades hamnade under de två femtedelar som beslutades.
På `/table` vid 1280 × 800 blev det 37 % av skärmen och ett kort 38 px över kortsidan, mot TV-lägets 63 % och 51 px — och ett playtest sammanfattade skillnaden som att bordsläget kändes opolerat bredvid TV-läget.
Två femtedelar var alltså aldrig fel som tal; det mättes på fel form.
Regeln är nu att filten *med händerna på* är så stor som ramen rymmer när lutningen är uttagen ur den: träets fyra hörn, projicerade genom samma vinkel som stilmallen ritar, står minst 44 px innanför ramen, och aldrig större än naturlig storlek.
Svaret söks fram i stället för att lösas ut, eftersom projektionen beror på träets egen storlek och därmed på den skala som söks.

Lutningen gick samma väg: vid 24° är bordets bortre halva märkbart mindre än den närmare, och den höjd lutningen kostar får filten aldrig tillbaka.
13° är fortfarande ett bord man ser tvärs över, och ger inpassningen mer att arbeta med.
`TILT` i `geometry.ts` och `rotateX` i `table.css` måste vara samma tal — ett kort som ritas i en vinkel och grips i en annan glider ur handen — och `geometry.test.ts` läser numera stilmallen och håller de två till varandra.

Mätt på samma bord som förut, `/table` i bordsläge: 1280 × 800 går från 37 % till 52 % av skärmen och kortet från 38 till 45 px; 1366 × 1024 från 38 % till 61 % och 44 till 56 px; 1920 × 1080 från 39 % till 49 % och 53 till 61 px.
Vid 2560 × 1440 ändras nästan ingenting, eftersom naturlig storlek redan är det som binder — vilket är regelns andra halva och inte ett fynd.

På stående plattor blir bordet i stället mindre, och det är regeln som slutar ljuga.
Den gamla inpassningen räknade varken träramens trettio pixlar eller händernas projicerade utsträckning, så ett liggande bord i en stående ram lämnade **1 px** luft vid 820 × 1180 och **5 px** vid 1024 × 1366 — mätt på den gamla koden, med träramen praktiskt taget mot skärmkanten, mot de 44 px regeln påstod sig lämna.
Nu är luften 58 respektive 62 px och bredden binder, som den måste: ett bord på 1200 × 800 mm kan inte fylla höjden i en stående ram utan att gå utanför bredden.
Det som är kvar där är formernas skillnad och inte slack i inpassningen.

Tre varianter prototypades på den riktiga rutten med riktigt bord och riktig täthet: som i dag, den nya inpassningen vid 24°, och den nya inpassningen vid 13°.
Den tredje valdes.
Prototypen svarade också på en fråga som inte ställdes: ett runt grepp på högens hörn, det TV-läget använder, går inte på filten — ett kort är omkring 45 × 63 px där, så en bricka som nådde 44 px vore lika stor som högen den sitter på.
Därför är höghandtaget brett och lågt.

Följdkrav (#63): pillret under en hög är det enda handtag K14 ger för att flytta en hel hög, alltså är det en kontroll före det är en etikett och tar samma 44 px som varje annan kontroll.
I bordsläge är det 101 × 45 px och följer inte skärmen nedåt.
Höjden var det som föll under golvet; bredden låg redan över det, och bredden är den som har en granne — ett pill som växte i sidled nådde över till nästa högs och täckte den, så två högar bredvid varandra tappade ett handtag var.
Grinden är därför två: 44 px i båda riktningarna, och aldrig mer än halvvägs till nästa hög.
TV-läget är orört: där är namnet under kortet och räknarbrickan i hörnet två egna handtag.

Referensprototypen `packages/web/src/prototype/table-ref` togs bort när den hade svarat.

Filtens storlek är sedan 2026-09-13 inte en konstant: den följer antalet platser, och måtten och deras följd för läsbarheten på tre meters håll står i K18.
Inpassningen och kameran rör sig inte av det — båda mäter filten de får — men bilden blir vidare när fler sitter vid bordet.

Reviderat 2026-09-14 (#84, UX-39): solfjädern ankras i sin egen zon.
Handzonen är 60 mm djup och kortet i fläkten 75 mm högt, och ytan framför platsen börjar tio millimeter innanför zonen, så en fläkt ritad kring zonens mitt når in i grannen: på TV:n, där ingen fläkt vrids mot sin kant, låg B:s tre kort och brickan "3" i `Framför B`.
C5 låter kameran skära en hand; inget låter en hand skära en grannzon.
Regeln är den minsta: fläkten skjuts mot kanten exakt så långt att dess räckvidd tvärs zonen ryms innanför zonens inre kant, och inte en millimeter längre.
En fläkt som redan ryms — varje vriden hand i bordsläge, sydplatsen i båda lägena — ligger kvar där den alltid legat, och det som hänger utanför kanten håller bordet som förut (#23).
Vilket håll kanten ligger åt är zonens fråga och inte ritningens: varje fläkt på TV:n vänder sig mot betraktaren och sitter ändå vid sin egen kant.
Räckvidden tvärs zonen är kortens vridning, inte en läst fläkts steg, som löper längs zonen.
Brickan är fortfarande en etikett i pixlar som hänger utanför kanten i luften ramen lämnar, men på kantens sida av fläkten: under den som förut, utom när kanten ligger ovanför fläkten som den ritas — TV-lägets nordplats — där den hänger över fläkten i stället.
Kortets kant i fläkten ritas innanför sin ruta: en baksida växte fyra pixlar utanför de millimeter fläkten mäts i, och på TV:ns skala var det elva millimeter.
Det förkastade alternativet, att wizarden lägger handzonen med det djup fläkten behöver, hade flyttat varje sparat bord och rört K18:s mått för en ritningsfråga.
Det som står kvar är observatörens TV (C8): en läst fläkt vid en sidoplats sprids tvärs sin zon och ligger kvar som förut, för att skjuta ut den med hela sin bredd hade hängt den en tredjedels meter utanför kanten och krympt hela bordet; hur en sådan fläkt ska ligga är en egen fråga.
Var ett släpp landar följer sedan 2026-09-14 fläkten som den ritas och inte zonens rektangel; se K2 (#65).

Reviderat 2026-09-14 (#77): **luften kring träet är 12 px i bordsläge, och K9:s 45 px når inte ned till 1280 × 800.**

`WOOD_AIR_PX` var 44 px och sades vara bordets andel av rummet det står i.
Men `feltScale` projicerar *träets* hörn, träramens 30 px inräknade, så inget av bordets egna möbler ritas utanför de pixlar luften räknas från; det enda som bor där är handens räknarpill, och den bärs redan av ramen.
Kvar står luften som det mörker bordet står på och ingenting annat — samma sak #76 upptäckte i TV-läge, där talet gick från 44 till 20 av samma skäl.
Tolv pixlar är en strimma mörker som håller träet från fönsterkanten; under det är skuggan under träet det enda som finns kvar att förlora, och den är utsuddad förbi kanten ändå.

Mätt på wizardens fyraplatsbord, på den målade rutan i Chromium, på `/online` med bandet och listen kvar som rader: kortets kortsida går **från 27 till 31 px vid 1280 × 800 och från 45 till 50 px vid 1920 × 1080**, och filten från 525 × 338 till 615 × 394 respektive från 909 × 581 till 998 × 635.
Ingenting ges upp för det. Träramen är orörd: en smalare ram köper två pixlar till och rör ett godkänt utseende, och det bytet gjordes inte.

**Det som inte gick att laga, mätt och uppskrivet.**
`/online` vid 1280 × 800 når 31 px och inte K9:s 45, hur bordet än vänds.
Räkningen är entydig och står här för att den inte ska behöva göras om: sidan är tre rader (#25) — platsens list 61 px, filtens rad, och handens band 218 px vid K17:s läsbara kortstorlek — och för att ett kort på filten ska nå 45 px vid 1280 × 800 måste filtens rad vara omkring 695 px, alltså får kromet väga omkring 105 px tillsammans.
Bandet ensamt är 218.
Även med luften och ramen satta till noll stannar filtens rad på ett kort omkring 41 px.
Prototypens 48–52 px vid det fönstret köptes genom att lägga bandet **över** filten, där det täckte den närmaste platsens hand och ytan framför den — och det är precis det som inte får skeppas.

Grinden i `online-felt.test.tsx` sa därför två olika saker vid de två fönstren: 45 px vid 1920 × 1080, som är K9:s tal, och 30 px vid 1280 × 800, som var ett golv som inte fick ges tillbaka.
Att K9:s 45 px och K17:s band inte kunde hålla samtidigt vid 1280 × 800 stod som öppen fråga i avsnitt I. Den är stängd av revideringen nedan: bandet gav vika, inte K9.

Samtidigt mäts att ingenting ritas över någonting annat: varken handens band eller kolumn, platsens list eller sessionens knappar rör filten eller en zon på den, vid 1280 × 800, 1920 × 1080 och 390 × 844, för en sidoplats och för en bottenplats.

Reviderat 2026-09-14 (#77, andra halvan): **den egna handens fläkt på filten viks ihop till sin bricka när handen ritas bredvid filten, och därmed är 45 px ett golv vid varje liggande fönster och varje handstorlek.**

Det är inte en kosmetisk fråga om att samma hand ritas två gånger, även om den är det också.
`feltWithHands` växer den rektangel inpassningen ska föra in i ramen med **varje** plats fläkt, den egna inräknad, och den egna handen är den enda vars storlek läsaren själv ändrar under spelets gång.
En bottenplats fläkt löper dessutom längs filtens höjd, vilket är den axel ramen binder på i en liggande rad — vilket är varför en bottenplats med tretton kort landade lägre än en sidoplats med samma hand i varje variant prototypen prövade.
Andra platsers fläktar är orörda: deras fläkt är den enda bild av deras hand som finns.

Mätt på wizardens fyraplatsbord, på den målade rutan i Chromium, med kolumnen (K17) redan på plats — alltså vad enbart hopvikningen köper:

| Fönster | Plats | 7 kort | 13 kort |
| --- | --- | --- | --- |
| 1280 × 800 | sidoplats | 46 → 46 px | 46 → 46 px |
| 1280 × 800 | bottenplats | 45 → 46 px | **43 → 46 px** |
| 1920 × 1080 | sidoplats | 62 → 62 px | 62 → 62 px |
| 1920 × 1080 | bottenplats | 62 → 62 px | 60 → 62 px |

Skillnaden mellan 43 och 46 är skillnaden mellan att 45 px nästan är ett golv och att det är det.
Hela vägen, från bandet till kolumnen med hopvikt fläkt, går kortets kortsida **från 31 → 46 px (sidoplats) och 30 → 46 (bottenplats) vid 1280 × 800**, och **från 49 → 62 respektive 48 → 62 vid 1920 × 1080**, vid sju kort likaväl som vid tretton.
Efter hopvikningen är talet dessutom detsamma vid varje plats och varje handstorlek, vilket det aldrig har varit förut.

Hopvikningen är ett villkor renderaren får utifrån och inte något den härleder: `foldHand` på `TableRenderer` namnger den plats vars egen hand ritas någon annanstans i samma fönster.
En hopvikt hand ritar ingen fläkt, mäts inte in i `feltWithHands`, och ställer sin antalsbricka mitt i sin egen zon — alltså i samma luft utanför rimmen som varje annan plats bricka redan hänger i (#84).
Det gäller bara `/online` i ett liggande fönster; i ett stående ritas den egna fläkten som förut, eftersom bandet där ligger kvar och det stående fönstret är orört (K17).

Kvar står en avvikelse som inte lagas här och som är värd att veta: var ett släpp landar följer fläkten som den ritas (K2, #65), och en hopvikt fläkt ritas inte — men `dropAt` mäter den ändå.
Följden är ingen i dag, eftersom `playedAt` redan vägrar lägga ett kort i den egna handen, och den blir en följd först den dag den egna handzonen ska kunna ta emot något.

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

Reviderat 2026-09-14 (#80, UX-35, prototypat och godkänt av produktägaren): platsens bokstav står på pillret.
En ledig plats sa bara "ledig", så på skärmen skildes platserna åt av färg och läge och ingenting annat.
Bokstaven fanns i den upplästa etiketten ("Plats C, ledig") och i rubriken ("Plats A vald"), men den som ville ha plats C hade inget att sikta på.

Tre former prototypades. Valet blev **C — bokstaven över ordet**: pillret blir två rader, bokstaven överst och ordet under — "ledig" på en ledig plats, namnet på en tagen.
Bokstaven ritas i båda tillstånden och på samma höjd i vart och ett, så den som sätter sig ändrar vad pillret säger och aldrig vilken form det har.
Bredden rörs inte, så kapningen från #42 och #52 står exakt där den stod.
Uppläsningen ändras inte heller: `aria-label` sa bokstaven först redan förut, så bokstaven och ordet på skärmen döljs för läsaren i stället för att läsas upp en andra gång efter den.

Två kostnader kom med formen, och båda ligger i css:en.
Pillret lägger sina två rader *tvärs* över sig i stället för längs, så namnets `<span>` blir lika brett som sin egen text hur smalt pillret än är: `text-overflow` såg inget att kapa, knappens egen `overflow` klippte i stället, och eftersom pillret centrerar det det bär klippte den i båda ändar — `Bartholomew Longbottom` kom tillbaka som ett annat namn utan något som sa att det var kapat, alltså precis felet #42 skrev sin kommentar emot. `max-width: 100%` håller spannet till pillrets bredd och prickarna hamnar där namnet verkligen tar slut.
Pillret blev också 52 px högt i stället för 44 — de 44 var aldrig en höjd utan tummens golv — och räcker därmed 26 px in på filten i stället för 18, vilket åt upp 8 px i vart och ett av hörnen och gjorde dagern till en överlappning på just så mycket.
Aritmetiken ovan vändes därför om i stället för att lappas: pillrets höjd och minsta bredd är egna namn (`--byd-seat-h`, `--byd-seat-w`), steget tvärs över änden är det enda valda talet — det är taket ett vanligt förnamn behöver — steget ned längs sidan följer på skillnaden mellan pillrets bredd och höjd, och filtens höjd skrivs ur dem och ur pillret.
Den delade filten kommer därmed ut som 260 × 220 px bakom ett 52 px piller, precis som den kom ut som 260 × 200 px bakom ett 44 px piller, utan att någon behöver minnas att räkna om.
Minsta bredden är ett tal och inte "så brett ordet nu blir", eftersom luften mellan två platser mäts ur den: ett piller lika brett som sitt eget "ledig" är ett mått på en Mac och ett annat på en Linux-körare, där `system-ui` är ett helt annat typsnitt.

Ordet ritas svagare än bokstaven över det, och hur mycket svagare är inte en smaksak: att släppa igenom underlaget är att betala kontrast, och båda raderna är text och bär AA (UX-KONTROLLER).
Platserna har olika mycket att betala med. `#3c8ce7` är den mörkaste av dem; bläcket står 5,57:1 helt, en femtedel igenom blir 4,45:1 och en tiondel 5,00:1.
Ett taget piller har ingenting att betala med alls — det ritas redan i den dämpade grå en avstängd kontroll bär, 5,35:1 mot sin egen grå botten — så där ritas ordet helt.
Det är dessutom rätt väg: ordet på ett ledigt piller är "ledig" och är utfyllnad bredvid bokstaven, medan ordet på ett taget piller är någons namn och är allt det pillret har att säga.

`join-layout.test.tsx` läser bokstaven ur det som verkligen ritas inuti pillret på två-, fyra-, sex- och åttaplatsbord, och mäter att bokstavens rad ligger över ordets och på samma höjd oavsett om platsen är ledig eller tagen.
Samma fil mäter blandningen varje rad verkligen ritas i — färgen lagd över pillret med sin egen genomskinlighet — mot pillrets botten, och håller båda raderna vid AA på både en ledig och en tagen plats.

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

### K14. Bordet spelas direkt: dra, släpp, klicka för en ring med verb (prototypat 2026-09-06, utvidgad 2026-09-12)

K1 och K2 gav reglerna; det här är hur handen gör dem.
Lösa kort, översta kortet i en hög och hela högen (i etiketten) dras med pekare eller finger.
Släpp på ett löst kort staplar, på en hög lägger överst, i en zonrektangel flyttar dit, annars fri placering på golvet.
Översta kortet ur en hög går samma väg som en `split`; en hel hög som `movePile`.
Bordsskärmen agerar som bordet (plats null): den som står vid den handlar för gruppen.

Det en dragning inte kan säga nås genom att klicka eller hålla på kort eller hög: en ring med verb öppnas där handen redan är, man glider till ett och släpper, eller klickar.
Kort: Vänd, Vrid, Titta, Avslöja.
Hög: Blanda, Dra 1, Dela på hälften, Vänd översta, Titta.
K8:s håll-för-att-titta är "Titta" i ringen.
Ingen markering finns på bordet; flerval hör till telefonen (K4).

Regeln på filten är en enda: **en dragning flyttar saken, ett klick frågar vad som går att göra med den.**
Hållet står kvar oförändrat för fingret; klicket är samma dörr, öppnad av den gest en mus faktiskt gör.

Motivering:
Samma gester fungerar med finger på en TV-platta och mus på distans, kräver inget tillstånd och lämnar bordet rent.
En verktygsrad förutsätter en markering, som på ett delat bord är någons och ingens.

Hållet ensamt var rätt för fingret och fel för musen.
Det kräver 350 ms fullkomligt stilla, och minsta darrning över fyra bordsmillimeter avbryter väntan och startar i stället ett drag ingen bad om — vilket är precis vad en hand på en mus gör.
Samtidigt gjorde ett klick på ett kort ingenting alls: den mest självklara musgesten på bordet var den enda som var utan svar.
Att låta klicket öppna samma ring kostar inget nytt verb, ingen ny yta och ingen ny vokabulär — det ger den döda gesten den dörr som redan fanns.
Alternativet att kapa högerklicket avvisades: webbläsarens meny är läsarens och inte verktygets, och en gest som inte finns på en pekskärm kan inte bära bordets enda väg till Vänd.

Följdkrav:
Ett klick som aldrig blev ett drag öppnar ringen för lösa kort, för högens topp och för hela högen i etiketten — de tre ställen en dragning börjar.
En avbruten pekare (`pointercancel`) frågar ingenting: den har varken flyttat eller pekat, och öppnar därför ingen ring.
Ringen dras in innanför fönstret när den öppnas nära en kant, oavsett om det var ett klick eller ett håll som öppnade den: Vänd ligger rakt ovanför pekaren, och ett kort nära överkanten lade annars just det verbet utanför skärmen.
Hur långt ringen når från sin mitt står som ett tal i `ring.ts` och som en cirkel i `table.css`; ett webbläsartest mäter den riktiga stilmallen mot talet så att de inte kan glida isär i tysthet.
Bordsläget lutar bordet (`rotateX` under perspektiv), så pekaren projiceras exakt tillbaka på bordsplanet; matten ligger i `geometry.ts` med test.
Att dra översta kortet ur en dold hög och släppa det på ett löst kort, och att vända översta kortet i en dold hög, gick först inte: tråden ger inget id. Löst i K15 genom att högen adresseras i stället för kortet.
Under ett tillbakaspolningsförslag (K13) är bordet inte spelbart.

Följdkrav (#87): det som Dra 1 och Dela på hälften lägger bredvid högen landar på högens vänstra sida, i högens egen vridning — den enda sida som varken namnet under högen eller antalsbrickan i dess övre högra hörn ligger på.
Punkten i intentet är den nya högens mitt, men en hög med ett kort är ingen hög (K1) utan ett löst kort med sitt hörn i punkten; ett ensamt kort placeras därför efter sitt hörn och en hög efter sin mitt, i `besidePile` i `drop.ts`.
Grinden är `table-layout.test.tsx`: wizardens bord för åtta vid TV:ns egen ruta, i båda lägena och med högen vriden, där kortet varken täcker namnet, brickan eller pillret.

Reviderat 2026-09-12: ringen håller verb och inget annat.
Den bar också en **Stäng**, som beslutet aldrig räknade upp och som tog en plats i cirkeln där varje annan plats gör något.
Det som stänger ringen är allt som inte är ett verb: ryggen täcker skärmen, så ett släpp eller ett klick var som helst utanför cirkeln är vägen ut.
Escape är samma väg för en hand på ett tangentbord, vilket den inte hade medan knappen var det enda uttalade sättet att ångra sig.
Fyra verb i stället för fem lägger dem dessutom i väderstrecken kring fingret.
En ring utan verb öppnas inte alls: ett kort som hunnit lämna bordet medan fingret var på väg till det hade annars gett en tom cirkel.

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

Reviderat 2026-09-14 (#77): **antagandet att ett helt bord ryms i 390 px är brutet, för varje plats och inte bara för sidoplatser.**
K17 lade bandet på en telefon och räknade fram att 358 px rymmer åtta träffytor, men mätte aldrig vad som blir kvar åt filten ovanför det.
Prototypen till #77 gjorde det: det bästa någon variant når på en telefon är **23 px** över kortets kortsida, vridet eller ej, mot K9:s 45.
Ett helt fyraplatsbord får alltså inte plats på en telefon vid en spelbar kortstorlek, och ingen vridning och ingen omfördelning av kromet ändrar det.
Vad man gör åt det — en kamera som TV:ns (C5), eller att uttryckligen säga att ett kort på telefon läses genom INSPEKTION (K8) och inte på filten — är ett eget beslut och står som öppen fråga i avsnitt I.
Därför finns ingen grind i sviten som påstår 45 px vid 390: ett tal som inte går att hålla är inte en grind utan en lögn som går sönder nästa gång någon mäter.

Reviderat 2026-09-14 (#77, andra halvan): **i ett liggande fönster är bandet en kolumn vid fönsterkanten, och handen i den är en lodrät lista.**

Bandet och filten slogs om samma axel.
Sidan är tre rader (#25), och vid 1280 × 800 vägde bandet ensamt 218 px av de 800 — samtidigt som filtens egen rad hade sexhundra pixlar bredd den inte kunde använda, eftersom det var höjden som band inpassningen.
Att ställa handen på högkant betalar alltså med slack i stället för med filt: kortets kortsida på filten går **från 31 till 46 px vid 1280 × 800 och från 49 till 62 px vid 1920 × 1080**, och filtens andel av fönstret från 23 % till 52 %.
Kolumnen är 136 px bred, och bredden är nästan gratis: prototypen mätte en kolumn på 201 px och en på 136 px och fick **identisk** filt, eftersom filten är höjdbunden i den raden vid varje kolumnbredd under ungefär 300 px vid 1280.

**Listan, inte bågen och inte uppslaget.** Tre varianter prototypades på den riktiga rutten (#77).
**A, den vridna fjädern** — K17:s båge ställd på högkant — behåller bågen men betalar med sitt eget överhäng, som i en kolumn är just höjd: vid tjugoen kort faller steget till 43 px, under fingerspetsens eget golv, och vridna kort sida vid sida i en kolumn spretar i stället för att stråla.
**C, bläddraren** visar fyra kort av tretton, vilket är exakt det resonemang K17 redan avvisade när den vägrade göra grundläget till något man ber om att få se.
**B, listan** valdes: korten ligger nedför kanten och överlappar som en hand hållen i en näve, med det understa kortet helt synligt.
Mätt vid 1280 × 800: steget är 68 px vid tre kort, 47 vid tretton och 44 vid tjugoen, kortet är 112 × 156 px vid varje antal, hela handen syns upp till tretton kort och fjorton av tjugoen innan kolumnen börjar rulla.

**Det som ger vika är fortfarande steget, och det bottnar fortfarande på en fingertopp** — K17:s egen lag, på den andra axeln.
Skillnaden är vem som räknar: i bandet räknar `fan.ts` steget ur `100vw`, i kolumnen räknar webbläsaren det själv.
Varje kort utom det sista ligger i en ruta ett steg hög som får krympa, och ingen av dem under `FAN_MIN_PX`; en hand som inte ryms ens då rullar i sin egen box medan sidan aldrig gör det (L10).
Rummet en kolumn har är en sidrads höjd, och det är inte något en modul kan veta — därför står bara de två ändarna av krympningen i `fan.ts`, som `COLUMN_STYLE`: steget en hand sprider sig till när den har rum, vilket är bandets eget steg så att en hand är en hand åt båda hållen, och fingertoppen den stannar på.

**Vilken sida kolumnen står på är en namngiven regel och inte en uppsättning villkor: handen står vid fönstrets `inline`-slut, vid varje plats.**
Prototypen föreslog den egna filtkanten — öster ger höger, väster ger vänster, en botten- eller toppplats faller tillbaka på inline-slutet — och det är just den formen av regel det här dokumentet inte vill ha: tre villkor och ett undantag.
Argumentet som avgjorde står redan i `fan.ts`: den här handen är inte möbler på bordet utan korten spelaren håller **framför skärmen**, i den storlek de läses i, och därför mäts de i pixlar där filtens fläkt mäts i millimeter (#23).
En hand som hålls framför skärmen följer inte med filten runt bordet.
Två följder som är värda att veta: kortets storlek på filten blir densamma för alla vid samma fönster, i stället för att bero på vilken plats man råkade få — samma resonemang som K18 använde när den vägrade smalna handen vid fler platser — och regeln överlever att man byter plats, vänder på fönstret eller läser sidan från höger till vänster, eftersom `flex-direction: row` säger "inline-slut" i läsarens egen riktning utan en andra regel (A4).

**Gestdelningen är bytt, inte bruten.**
Bandet låg under filten, så ett kort kom **uppåt** ur det medan en dragning i sidled rullade fjädern.
Kolumnen står bredvid filten, så ett kort kommer **på tvären** ur den och en dragning längs kolumnen är kolumnen som rullar; webbläsaren får samma besked i `touch-action: pan-y`.
Tröskeln är densamma och avgörs fortfarande en gång per tryck, på den första rörelse som är `FAN_AIM_PX` lång, och den bor nu på ett ställe för båda formerna (`online/handDrag.tsx`).
Ett tryck som inte färdas spelar fortfarande ingenting, av skälet i avsnitt I: handen ligger aldrig över bordet, så punkten ett tryck släpper på är inte en plats att lägga ett kort på.
Att hålla för att välja flera är ingen gest den här ytan har; det är K4:s remsa på `/play` och den är orörd.
Roving-tabindexen blir lodrät, och det är fortfarande editorns `roving.ts`.

**Ett kort som täcks underifrån döljer sitt eget namn**, vilket bandet aldrig behövde tänka på: det överlappar i sidled, så ett korts mitt syns.
Båda de saker som namnger ett kort centrerar det — en `button` centrerar det den håller, och texturens väntetillstånd centrerar namnet mitt på kortet (#10) — så i en kolumn kom nio kort av tretton ut tomma.
I den här enda formen ligger namnet överst på kortet, i den remsa nästa kort lämnar.
Med en riktig textur (E2) står titeln oftast där ändå, men ingenting garanterar det, och grinden mäter det som faktiskt ritas.

**Ett stående fönster är orört.**
Kolumnen är värd att ha för att ett liggande fönster har bredd filten inte kan använda och höjd den binds av; ett stående har ingendera, och där skulle en kolumn ta filtens rum i stället för att hitta det.
Mätt vid 390 × 844, samma siffror som före kolumnen: en sidoplats 20 px över kortsidan och filten 283 × 408, en bottenplats 16 px och 290 × 189.
Grinden står i `online-felt.test.tsx` och är skriven som tal just därför att påståendet är "exakt som förut".

Byggt 2026-09-14 (#77). Prototypen `claude/proto-77-column` togs bort när den hade svarat; dess resonemang står här.
Grindarna är invarianter och inte tal, mätta vid 3, 13 och 21 kort och vid 1280 × 800, 1920 × 1080 och 1024 × 600: inget kort i kolumnen är utan sitt namn, inget steg är under 44 px, kortet är alltid mellan 56 och 112 px, kolumnen tar aldrig mer än en fjärdedel av fönstrets bredd, sidan rullar aldrig i sidled, och ingenting av sidans krom ligger över filten eller en zon på den.

### K18. Filten växer med sällskapet (2026-09-13, #54)

Filtens storlek följer antalet platser.
Den var konstant 1200 × 800 mm från två platser till åtta, och det höll inte: `handGeometry` sköt plats fem till åtta 300 mm längs en hand som är 500 mm bred, alltså kortare än handen själv, så paren låg över varandra per konstruktion.
Mätt som antal överlappande zonpar: två till fyra platser 0, fem 5, sex 10, sju 17, åtta 20 — och bland dem `hand:A` mot `hand:E`, två spelares händer på samma millimetrar.
Vid sju platser låg dessutom `counters:G` helt utanför filten och `hand:G` och `mine:G` hängde 150 mm utanför kanten.
Felet satt i receptet och skrevs alltså in i dokumentet av `applyRecipe`, så det stod i sparade setuper och därmed på det spelade bordet, inte bara i editorns förhandsvisning.

Regeln är den fysiskt ärliga: ett riktigt åttamannabord **är** större.
En plats tar 500 mm längs sin kant — handen är 500 bred, och ytan framför plus räknarna bredvid den går ihop till samma 500 — och 170 mm inåt från kanten.
Två grannar sitter ett kuvert isär, 600 mm, vilket är vad ett riktigt bord dukar med.
Varje extra plats på ett kantpar förlänger den axel kanterna löper längs med ett kuvert.

Måtten som faller ut, och som är beslutet:

| Platser | Filt | Hur `edgeOf` fördelar dem (S, N, Ö, V) |
| --- | --- | --- |
| 2 | 1200 × 800 mm | 1, 1, 0, 0 |
| 3 | 1200 × 800 mm | 1, 1, 1, 0 |
| 4 | 1200 × 800 mm | 1, 1, 1, 1 |
| 5 | 1800 × 800 mm | 2, 1, 1, 1 |
| 6 | 1800 × 800 mm | 2, 2, 1, 1 |
| 7 | 1800 × 1400 mm | 2, 2, 2, 1 |
| 8 | 1800 × 1400 mm | 2, 2, 2, 2 |

Axeln växer så snart någon av de två motstående kanterna bär ett par: bredden när syd eller nord gör det, höjden när öst eller väst gör det.

Vid fyra platser och färre bär ingen kant två, så filten är den 1200 × 800 mm den alltid har varit — på millimetern, för varje zon.
Kuvertet är just det mått som bevarar kantmarginalerna: en ensam plats står mitt på sin kant precis som förut, och ett par grenslar mitten.
Sex platser blir 1800 × 800 mm, vilket är måttet på ett riktigt sexmannabord: två längs varje långsida och en vid var ände.

Handen är 500 mm vid varje platsantal, och det är halva beslutet.
Det förkastade alternativet — att smalna handen när platserna blir fler — hade stannat inne i `recipe.ts` utan att röra filten, men hade gett en spelare vid ett åttaplatsbord en synligt mindre hand än en vid ett fyraplatsbord: samma spel på olika villkor beroende på vilka som råkar spela.
Det andra förkastade alternativet, fler än fyra kanter, hade löst både det här och #42, men ändrar `SeatEdge` i `packages/protocol` som #39 nyss införde, plus varje konsument av de fyra väderstrecken.

**Sparade setuper lyfts, och bara de som måste.**
Eftersom två till fyra platser ger exakt de gamla millimetrarna rör sig inget bord som någonsin har fungerat.
Det som återstår är setuper sparade med fem till åtta platser på en 1200 × 800 mm filt, och där finns ingen design att bevara: det som står där är två spelares händer på samma plats.
Så `applyRecipe` lägger ut platserna — och filten med dem — på nytt både när platsantalet ändras och när filten inte rymmer de platser den redan har.
Ett bord som rymmer sina platser rörs aldrig, och en filt som designern själv har gjort rymligare är hens så länge den räcker till.
Att byta bordsstorlek under fötterna på en pågående design vore fel om det som byttes bort var ett val; här är det ett fel som annars aldrig läker av sig självt.

**Följd för TV-läget (K9): korten blir mindre vid fler platser, och det är priset.**
Kameran ramar in det som är i spel, och ytorna framför platserna ligger vid kanten, så en större filt är en vidare bild.
Kortets kortsida i TV-lägets ram, mätt i Chromium på `TvChrome`s egen `main` med receptets bord:

| Skärm | 2–4 platser | 5–6 | 7–8 |
| --- | --- | --- | --- |
| 1280 × 800 | 47 px | 33 px | 27 px |
| 1920 × 1080 | 70 px | 56 px | 40 px |
| 3840 × 2160 | 157 px | 124 px | 89 px |

Åtta platser på en 1280 × 800-skärm ger 27 px, och det är i minsta laget på tre meters håll.
Men TV-läget är till för en TV, och på 1920 och på 4K står åttaplatsbordet på 40 respektive 89 px — mer än vad fyraplatsbordet hade på den skärm som var för liten från början.
Att läsa ett enskilt kort är dessutom INSPEKTION:s uppgift och inte filtens (K9): det kortet ritas i panelens egen storlek och bryr sig inte om hur stort bordet är.
Ett åttaplatsbord på en liten skärm är alltså mindre läsbart än ett fyraplatsbord, och det är en följd av att bordet är större och inte av att något är fel.

Reviderat 2026-09-14 (#89): en plats räknare glesar ut sig till två och staplas vid tre, inom samma 500 mm.
Frågan var hur två eller tre räknare på samma plats får var sin träffyta på 44 × 44 px, och svaret ändrar inte en millimeter utanför platsen.
En plats med **en eller två** räknare lägger brickorna längs sin egen kant med en delning på 125 mm: räknarzonen växer längs rimmet och `Framför` krymper lika mycket, 365 mm vid en räknare och 240 vid två.
En plats med **tre eller fler** staplar dem i en hög: högen är en träffyta, zonen går tillbaka till en delning, och `Framför` är 365 igen.

Delningen är mätt och inte vald.
En träffyta är 44 × 44 px på den **projicerade** lådan (#67), och vid det trängsta bord produkten stöder — sju eller åtta platser på 1280 × 800 i bordsläge, där filten ritas med 0,443 px per millimeter och den bortre kanten lutar bort därtill — täcker den rutan 107,4 mm filt.
TV-läget vid samma bredd vill ha 103,6 mm, och varje bredare skärm mindre.
125 mm är nästa runda tal som klarar den bredaste avläsningen på båda sidor, och lämnar ungefär nio millimeter luft vid vardera kanten av brickans egen ruta.
Talet står som `COUNTER_PITCH_MM` i `packages/server/src/recipe.ts`, med härledningen bredvid sig.

**Den verkliga rättelsen är att brickan står mitt i sin ruta**, inte att zonen växer.
Receptet la varje bricka 8 mm från zonens hörn, och eftersom träffytan är fyra gånger så bred som brickan under den låg den 20 mm inne i ytan framför spelaren — vid varje platsantal, vid varje skärm, utan att ett endaste par av ytor överlappade för att säga det.
Prototypens viktigaste fynd var alltså att issuets egen grind inte räckte: med **en** räknare per plats var antalet överlappande par noll överallt, medan ytan i bordsläge vid 1280 × 800 och åtta platser låg utanför sin egen zon i 8 fall av 8 och inne i en grannzon i 12.
Grinden räknar därför både par och zonutträden och skriver ut båda talen, och den står i `packages/web/test/counter-zone.test.tsx`: varje platsantal 2–`MAX_PLAYERS` gånger en till fyra räknare gånger båda lägena gånger tre skärmar, mätt på renderarens egen `.byd-token-hit` med `getBoundingClientRect()` och aldrig på den satta storleken.

De förkastade, med sina mätta skäl:
**A**, att räknarzonen växer och K18:s kuvert betalar, gör platsen 840 mm lång och filten 2480 × 2080 mm vid åtta platser — och eftersom en större filt ritas i mindre skala står 16 överlappande par kvar vid 1280 × 800 med tre räknare, kortets kortsida faller från 27 till 18 px, och den bryter K18:s egen zongrind med ett överlappande zonpar redan vid sin egen delning på 150 mm.
**B med tre räknare** krymper `Framför` till 115 mm, och ett kort är 63 mm brett, så ett andra spelat kort lägger sig över räknarzonens första bricka; vid en och två räknare är `Framför` 365 respektive 240 mm och det problemet finns inte.
**Nuläget**, 32 mm delning i en zon på 110 × 100 mm, ger 204 överlappande par över hela svepet och faller som sagt redan med en ensam bricka.

Priset, uttryckligen accepterat: **en plats räknare byter form när en tredje läggs till**, och editorn säger det där antalet väljs.
Högen kostar därtill ett tryck till per räknare som inte ligger överst, och att två värden av tre inte står på filten förrän ringen öppnas — på ett bord som ska läsas på tre meters håll (K9) är det ett verkligt tapp, och det är därför det betalas först vid tre och inte vid två.
Vägen in i högen är ringen (K14): högens ring har en knapp per räknare med namnet och värdet på knappen och antalet i navet, och den knappen öppnar brickans egen ring, som är `counterActs` rakt av — `−1 · +1 · Sätt värde…`, samma verb renderarens ring redan ritar.
En hög är ett läge och inte ett verb: brickorna ligger på samma punkt, klienten ritar dem som en hög, och loggen hör bara det `move` en bricka alltid har färdats med.

**Siffran i brickan skalas med brickan och med sin egen bredd**, och `CHIP_MM` rörs inte.
En siffra satt i fasta tolv pixlar ryms i en bricka som ritas i fyrtio och målar rakt ut genom konturen på en som ritas i tretton — vilket är vad åtta platser på 1280 × 800 ritar — så ett tvåsiffrigt värde bröt brickans egen kant på varenda plats.
Ordningen är: siffran tar en andel av brickans diameter, och den andelen delas med den bredd värdet självt behöver, eftersom `-120` — tre siffror och ett minus, det bredaste en räknare någonsin bär — måste rymmas i samma bricka som `0`.
En bricka som också bär sitt namn ger siffran mindre, därför att de två staplas.
Det förkastade alternativet var ett golv i pixlar under brickan: det hade gjort en räknare till en annan storlek än allt annat på filten vid just de platsantal där utrymmet är knappast, och det hade flyttat de träffytor `counter-zone.test.tsx` mäter.
Priset, uttryckligen accepterat: vid de trängsta borden är brickan en prick och dess siffra en pricks siffra — värdet läses exakt i ringens nav, som ritar det i 24 px, och i räknarpanelen, vilket är samma delning K18 redan gör mellan filten och INSPEKTION.
Regeln står som `tokenInkPx` i `packages/web/src/table/TableRenderer.tsx` med härledningen bredvid sig, och grinden är `packages/web/test/counter-ink.test.tsx`: varje platsantal 2–`MAX_PLAYERS` gånger båda lägena gånger tre skärmar, med ett tresiffrigt och ett negativt värde bland brickorna, mätt med `getBoundingClientRect()` i Chromium som andelar och aldrig som pixlar.

Sparade bord lyfts på samma sätt som filten lyfts ovan, och bara de som måste: en plats vars räknarzon är kortare än brickorna i den behöver blir utlagd på nytt nästa gång receptet vrids, och `Framför` med den, eftersom de två delar på platsens 500 mm.
En zon som designern själv har gjort rymligare än brickorna ber om är hens och lämnas i fred, precis som filten.
Ett bord som redan står på ett bord — en pågående session — rörs inte alls: brickornas platser ligger i loggen och spelas upp som de skrevs, och det är först nästa gång ett bord byggs ur projektet som brickorna ställs mitt i sina rutor.

**Vad den här skivan inte löser.**
#42 försvinner inte: `edgeOf` ger fortfarande A och E samma kant, så väljaren måste fortfarande sprida paret längs kanten själv.
En större filt ger dem rum att inte överlappa på bordet; väljarens lilla filt ritas ur platslistans kanter och inte ur bordets zoner, så den ser ingenting av det här.

Ett fynd som skivan gjorde och lämnar kvar: platsens namnkort ligger på handen, mitt på den, och zonnamnet ligger ovanför sin zons överkant vid dess vänstra hörn (K9).
Med en ensam plats på kanten möts de aldrig, men med två ligger namnkortet mitt över grannzonens namn — mätt i Chromium på ett åttaplatsbord täcker "Spelare 2" bokstaven i "FRAMFÖR B".
Det är en etikettkrock och inte en zonkrock, och var etiketterna ska ta vägen när en kant bär två platser är K9:s fråga och en egen skiva.

Grinden är ett test och inte ett tal: `packages/server/test/recipe-geometry.test.ts` mäter varje zonpar vid varje platsantal från två till `MAX_PLAYERS`, räknar paren så att en tom lista inte kan gå igenom, och håller dessutom fast att handen är 500 mm överallt och att ett fyraplatsbord ligger på exakt de millimetrar det låg på förut.
Den gamla täckningen slutade vid fyra platser, och det är därför felet gick att skeppa.

### K19. Ett namn på ett ställe: var en zons namn ligger (prototypat och byggt 2026-09-13, #43, #71)

Regeln, i en mening:

> En zons namn ligger utanför zonens innehåll, på sidan bort från närmaste kant på filten, och så nära mitten av den plats som äger zonen som dess egen box tillåter — och ovanför sin egen överkant, från vänstra hörnet, när zonen står vid ingen kant, likaså när ingen äger den, vilket är den regel filten alltid har följt.

Den gäller båda ytorna och varje platsantal 2–`MAX_PLAYERS`, och den ersätter tre etikettsystem med ett.

**Tre system, inte två.**
`.byd-zone > span` är renderarens zonnamn; `.byd-seat-name` är renderarens namnkort, som bara ritades i bordsläge; `.byd-setup-handle > span` var editorns egen `Hand · B`, nere i handtagets hörn.
Två komponenter skrev på samma kvadratmillimeter utan att känna till varandra, och det var hela #43: `Räknare B` under `Hand · B`.
#71 var det tredje systemet mot det första, sedan K18 gav en kant två platser — och den krocken finns bara i bordsläge, eftersom TV-läget låter docken säga namnen; den börjar vid **sju** platser, inte åtta som issuet uppgav.
Nu bär handtaget inget ritat namn alls: filten namnger varje yta, varje hög och — genom namnkortet, som förhandsvisningen numera också ritar eftersom den är TV-läge utan dock — varje hand.
Handtagets namn finns kvar som dess `aria-label`, med ägaren i, så tangentbordet och skärmläsaren förlorar ingenting på att namnet inte längre skrivs två gånger (L12).

**Halva regeln är sämre än ingen regel.**
Den föregående prototypen föreslog "utanför zonen, bort från närmaste kant".
Byggd bokstavligen *skapar* den en krock vid sex och sju platser där dagens läge har noll: att säga vilken **sida** av zonen namnet ligger på är bara halva svaret, för namnet växer fortfarande alltid åt höger från vänstra hörnet.
`Räknare A` är 110 mm brett och dess namn 237, så det lämnar A:s eget kuvert och landar i E:s.
Andra halvan — åt vilket håll namnet växer — är därför inte en detalj utan det som gör regeln till en regel.
Meningen läses två gånger: vid norra och södra kanten ligger namnet *längs* kanten och har bredd, så den ände det förankras i avgör hur mycket av grannens kuvert det täcker; vid östra och västra kanten står det *bredvid* sin zon och är en rad högt, inte en rad brett, och där finns bara ett läge att välja — det närmast platsens mitt, eftersom den andra änden är filtens hörn där nästa kants plats har sina egna namn.

**En zon som ingen äger rör sig inte.**
Villkoret är platsen, inte kanten: en delad yta har ingen platsmitt att växa mot, så att skicka dess namn bort från kanten utan att också säga åt vilket håll det växer vore precis den halva regeln som nyss förkastades.
Mätt: marknaden ligger 200 mm in på en filt som är 800 mm hög, alltså mitt på bordet där högarna står, och ett namn skickat inåt därifrån landar på draghögens antalsbricka vid fem och sex platser.
Så marknadens namn står kvar ovanför sin egen överkant, på millimetern där det alltid stått.

**Inget kapat namn, och därför inte variant C.**
En variant som ritade varje namn inuti sin egen rektangel fick **noll** krockar vid varje platsantal — och kapade **tolv av sexton** ytnamn till `RÄ…` och `FR…`.
Perfekt på måttet, oanvändbar som bild.
Kriteriet är därför att `scrollWidth > clientWidth` på någon etikett fäller, och att varje namn som bordet ska säga också hittas i mätningen; ett ensamt krocktal räcker aldrig.

**Mätningen tvingar `white-space: nowrap`, och renderaren sätter det.**
Ingenting satte det förut, så en etikett bredvid en smal zon bröts till två rader och mätte hälften så brett.
Halva dagens goda siffror kom därifrån, och en implementation som senare lade till `nowrap` hade tyst gått sönder.
Nu är namnet en rad, både på skärmen och i mätningen.

**Förhandsvisningen är aritmetik före det är placering.**
`.byd-setup-felt` var `height: min(70vh, 640px)`, och 640-taket låste skalan hur högt fönstret än var.
En plats kuvert är 500 mm — från `Framför A`:s vänsterkant till `Räknare A`:s högerkant — och fick **197 px** vid 1280 × 1200 och åtta platser; dess två namn behöver omkring 196 plus den luft som skiljer dem åt.
Det var alltså inte att etiketterna låg fel — rummet fanns fysiskt inte.
Taket är nu **720 px**, där fönstret räcker till, vilket ger platsen **226 px** och krockarna noll.
Grinden mäter rummet och inte bara krockarna: en plats ska vara minst 200 px längs sin egen kant vid åtta platser.

**`MAX_PLAYERS` och panelens erbjudande stämmer överens.**
Panelen stannade vid sex medan `MAX_PLAYERS` var åtta, så de två platsantal en formgivare mest behövde titta på — de där en kant först bär två platser (K18) — var de två ingen kunde nå.
Den erbjuder nu varje platsantal bordet kan hålla.

**Högarnas namn är orörda.**
De var aldrig med i buggen: renderaren lägger redan en högs namn under högen, fritt från allt.
Regeln gäller ytor, och mätningen läser `.byd-pile-n` och inte `.byd-pile-count`, som i TV-läge är `inset: 0` över hela högen medan brickan den ritar hänger över överkanten; namnet och antalet räknas som **en** etikett, eftersom de är två halvor av ett pill.
Den avskurna handräknaren är `HAND_COUNT_MM` i `table/hand.ts` och avsiktligt beteende (K9), inte ett fel att laga.

**Läsbarheten är orörd.**
Kortets kortsida i TV-läge vid åtta platser: 27 px vid 1280 × 800, 40 px vid 1920 × 1080, 89 px vid 3840 × 2160 — K18:s tal på pixeln, och minsta etikett är 12 px.
Ingenting i den här skivan rör filtens storlek, inpassningen eller kameran; etiketterna konkurrerade aldrig med korten, bara med varandra.

Grinden är `packages/web/test/felt-names.test.tsx`: samma mätning på alla tre ytorna — bordsläge, TV-läge och editorns Bord-flik — vid varje platsantal 2–`MAX_PLAYERS`, vid varje kvartsvarv, med och utan marknad, och i editorns fall vid varje fönsterhöjd nedan; varje läsning säger både vilka namn den såg, vilka par som ligger på varandra, vilka som kapats, vilka som brutits till två rader och vilka som ritats utanför filten.
Regeln själv bor i `packages/web/src/table/labels.ts` och ritas av `table.css`; ingen yta har ett undantag.

Reviderat 2026-09-13 (#72, #73): regeln läses i den vridna bildens frame, och ett kuverts två namn delar aldrig rad.

**Närmaste kant är bildens kant, inte filtens.**
Första bygget läste regeln i filtens egna millimetrar och mätte bara ett obevekat bord.
Men `/online` vrider filten ett kvartsvarv så att läsarens egen kant hamnar nederst (C5), och varje etikett vrids tillbaka så att den förblir läsbar.
En etikett som är fäst vid en kant och vrids tillbaka kring sin egen mitt svänger runt den mitten: ett namn som var åttiofyra pixlar brett blir åttiofyra pixlar högt kring en punkt som inte flyttat sig.
Vid östra och västra kanten ligger ett kuverts två namn tio millimeter isär längs kanten — de står bredvid var sin zon och är en rad höga — och efter svängen låg de på varandra.
Mätt på det bord som ska levereras: fyra platser gav två sådana par vid 90° och 270°, åtta platser fyra, och på `origin/main` var det noll vid varje vridning.
Regeln säger nu vilken kant zonen står vid **i bilden**: geometrin vrids först, och svaret läses där.
Ritningen bär samma skillnad: namnet läggs vid ett hörn av sin zon — `--name-x`/`--name-y`, som renderaren räknar ut — och skjuts därifrån med `transform: translate(…)` kring `transform-origin: 0 0`.
Ett hörn är en punkt och en punkt överlever en vridning; allt som kommer efter vridningen landar därmed i läsarens riktningar, så "sex pixlar ovanför min egen överkant" är sex pixlar uppåt på skärmen vid varje kvartsvarv.
Marknadens namn följer vridningen på samma sätt — det är fortfarande zonens övre vänstra hörn, men läsarens övre vänstra; ett namn förankrat i filtens hörn hamnade vid 270° på kasthögens antalsbricka.

**Andra halvan igen: två namn på ett kuvert delar inte rad.**
Ett kuvert är 500 mm och dess två namn är omkring 250 mm var i de storlekar filten faktiskt ritas, alltså hela kuvertet tillsammans.
Ingen förankring längs kanten kan då skilja dem åt: vid åtta platser på en vriden filt vill paret ha 189 px av ett kuvert på 174.
Namnet som är förankrat i den bortre änden står därför en rad längre ut, vilket inom ett kuvert alltid är precis ett av de två — den ena zonens mitt ligger före platsens mitt och den andras efter.
Där namnet står *bredvid* sin zon i stället för längs kanten ligger paret redan på två rader av sig självt, och då läggs ingenting till.

**Typen var en femtedel mellanrum.**
`letter-spacing: 2px` på en elvapixlars etikett är arton pixlar av åttiosju, och på en filt vriden ett kvartsvarv vid sex platser har två platser mitt emot varandra 150 px mellan sig och ville ha 164.
Bordsläget sätter nu 1 px, vilket är TV-lägets proportion (1,5 av 13) i stället för en egen.
`--name-in` — hur långt in från den förankrade änden namnet börjar — är 14 px i bordsläge och 16 i TV-läge i stället för 8 och 10: den änden namnet är förankrat i är den som pekar mot filtens hörn, där nästa kants plats har sina egna namn, och vid åtta platser låg `Räknare H` på `Framför A` i TV-läge och två pixlar ifrån det i Bord-fliken.
Ett kuvert förlorar ingenting på en bredare indragning, eftersom dess två namn numera ligger på var sin rad.
En zon ingen äger behåller sina 8 px: indragningen finns för att hålla ett namn innanför sitt eget kuvert, och en delad zon har inget.

**Ett namnkort vid en sidokant kröp inåt när namnet blev längre.**
`.byd-seat-name` vid öst och väst är en vågrät textruta som vrids ett kvartsvarv kring sin egen mitt, och `right: 6px` gäller den ovridna rutan: ett åtta bokstävers namn hamnade fyrtio pixlar in från kanten, ett längre ännu längre in, medan syd och nord låg på sina 6 px.
Kortet skjuts nu tillbaka med exakt det vridningen tar, så varje plats kort ligger 6 px från sin egen kant vad det än säger (K9).

**Förhandsvisningen mättes vid en fönsterhöjd nästan ingen har.**
`min(70vh, 720px)` betyder att 720-taket binder först ovanför ungefär 1030 px fönsterhöjd, och hela den förra skivans siffror togs vid 1280 × 1200.
Genom den riktiga inpassningen gav 1280 × 800 ett kuvert på 169 px och 1440 × 900 ett på 194 — under de 200 den förra grinden krävde, alltså krockar på två av de tre skrivbord L12 räknar som skrivbord.
Tre saker ändrades: filtens låda är `min(78vh, 720px)`, Bord-fliken sätter etiketten i filtens egen storlek i stället för TV:ns — fliken är en bild av ett bord på ett skrivbord, inte en TV läst på tre meters håll — och kravet är inte längre 200 px utan att ett kuvert rymmer det längsta av sina egna två namn, eftersom ett namn per rad är vad ett kuvert numera behöver hålla.
Grinden mäter det vid 1280 × 800, 1440 × 900 och 1280 × 1200.

**`white-space: nowrap` kunde inte falla.**
Mätningen sköt in `.byd-zone > span { white-space: nowrap }` i varje läsning, så den deklaration som skeppas kunde tas bort utan att ett enda test märkte det — den inskjutna regeln trädde in i dess ställe.
Påståendet att "mätningen tvingar det ändå" var alltså bakvänt.
Ingenting skjuts in längre, och varje läsning säger dessutom vilka namn som faktiskt bröts till två rader; tas deklarationen bort faller alla femtiosex bordslägesscener.

**En hand har inget eget namn att ge.**
`SeatName` ritar platsens namn, aldrig handzonens `name`, och tangentbordets platslista gör detsamma — "den som sitter där har namngett sig själv; bara ordet *hand* runt omkring är verktygets".
Egenskapspanelen erbjöd ändå ett namnfält för en hand, så det en formgivare skrev där levde i fältet och i en `aria-label` och ingen annanstans.
Beslutet är det panelen och tangentbordet redan hade tagit halvt: en hand namnges av platsen som sitter vid den, och kan alltså inte döpas om.
Fältet är borta och skälet står i dess ställe, eftersom ett hål inte förklarar någonting (L4).
K19:s mening om att filten namnger varje hand står därmed kvar och är sann på skärmen och inte bara på papperet — grinden läser numera den sträng som faktiskt ritas på handen och inte bara att det finns en etikett där.

**Åtta platser, åtta färger.**
`MAX_PLAYERS` är åtta och paletten i `seatColor.ts` hade sex färger och gick runt, så plats sju tog plats ett:s röda och plats åtta plats två:s blå.
Ingenting satte `players` över sex förrän panelen började erbjuda varje platsantal bordet kan hålla, vilket är vad som fick varvningen att träda fram; K9 gör färgen till platsens identitet på hand, markör, dock och flöde, så två spelare med samma färg är två spelare med samma identitet.
De två nya är de två kulörer de sex första lämnar rum för: magenta i gapet mellan den lila och den röda, lime i gapet mellan den gula och den gröna.
`#d9699f` bär `--byd-seat-ink` med 5,91:1 och läses mot mörkret med samma tal; `#9bb63c` med 8,35:1 — inom det spann de sex gamla redan ligger i (4,80–7,84), och `seat-contrast.test.ts` mäter numera varje plats bordet kan hålla i stället för sex nedskrivna index.
Wizarden erbjöd fortfarande `[1, 2, 3, 4, 5, 6]` — samma glapp K19 sa sig ha tagit bort, en flik bort från panelen som tagit bort det — och erbjuder nu `MAX_PLAYERS`.
Att sju och åtta platser nu går att nå från produkten gör samtidigt #42:s överlapp i platsväljaren nåbart; det står kvar öppet och lagas inte här.

De mätta talen efter ändringen, bordsläge vid 1280 × 800, varje platsantal 2–8 × varje kvartsvarv × marknad av och på: noll krockar i alla femtiosex scenerna.
Det trängsta avståndet som beror på hur långt ett namn är, är 3 px (sex platser, två platser mitt emot varandra på en vriden filt); de övriga trånga är 2 px och är geometriska — glipan på 10 mm mellan ett kuverts två zoner — och står därför still.

De 3 pixlarna ovan är 2,0 % av namnets bredd, och det visade sig vara hela buggen.
Vad filten skriver med är därför inte längre maskinens fråga: se K20.

Reviderat 2026-09-14 (#76): **ett namn ligger heller aldrig på en högs antalsbricka, och en filt som är mindre än sina egna namn sätter dem på sitt eget sätt.**

Regeln var skriven om namn mot namn.
En hög har två etiketter och båda undantogs: namnet ligger under högen, fritt från allt, och brickan räknades som namnets andra halva.
Men brickan är det enda på filten som ritas *utanför sin egen fot i skärmens pixlar* — `right: -14px; top: -14px` och 30 × 30 px, hur liten högen än är.
På en filt av en telefons storlek är högen 26 × 19 px och brickan sticker ut en fjärdedel av vägen tvärs över bordet, rakt in i den plats en sidokants namn har.
Så när observatörens filt vändes (C8, #76) återstod två krockar vid 390 och sex vid 320: fyra av de sex var en plats namn på kasthögens bricka, och de två sista var två platser mitt emot varandra som möttes på samma rad i mitten — samma trängsel, sedd från andra hållet.

Utvidgningen har två halvor, båda i regelns egen anda: **det som är högens ritas på högen, och det som är en plats ritas i platsens egen halva.**

**Brickan sitter på sin hög.**
Den är centrerad över högens överkant i stället för att hänga ut ur dess hörn: den täcker kortet som förut, men står inte längre någonstans där högen inte är.
Det är samma sak C5 (#66) sade om träramen — en yta som inte är bordet är ingen yta att ligga på — sagd om en etikett i stället för om ett kort.

**En filt som är smalare än sina namn sätter dem tätt.**
Under 460 px tvärs över läsarens bild — `TIGHT_FELT_PX` i `TableRenderer.tsx` — gäller två ting till.
Talet är `table.css`:s eget, det som redan döljer den spelade filtens namn, men mätt på läsarens bild i stället för på filtens egen bredd: filtens låda behåller golvets form och vrids efteråt, så en containerfråga på den mäter bildens andra sida.
Därför är det renderaren som svarar och inte arket.
Typen sätts i filtens tätaste: 12 px och ingen spärr, i stället för 13 px och 1,5.
Spärren ensam är en sjättedel av namnets bredd — samma femtedel K19 tog ur bordsläget ovan — och utan den är `Räknare A` 62 px i stället för 76, vilket är vad som gör att två platser mitt emot varandra på en telefon båda får säga sina namn.
Och vid öst- och västkanten står namnet **ovanför sin egen zon i stället för bredvid den**, förankrat i den ände som vetter mot kanten och växande inåt, så att det stannar i sin egen halva av filten.
Bredvid zonen växer det från zonens inre kant mot mitten, där de delade högarna står; på en filt så här liten når den räckvidden förbi mitten och möter både brickan och namnet från platsen mitt emot, som kommer andra vägen.
Ovanför sin egen zon når det bara halva den sträckan, och de två platserna mitt emot varandra delar inte längre rad alls.

Varför just en tröskel och inte en regel för alla filtar: bredvid zonen är rätt överallt annars och mätt så.
Vid åtta platser i bordsläge ligger platsens namnkort längs kanten (K9), och ett namn som flyttas upp mot kanten landar på det; vid fem och sex platser når ett namn förankrat vid kanten längre in än ett förankrat vid zonen och möter draghögen.
Tröskeln är alltså inte en smaksak utan gränsen mellan två geometrier: över den är kanten trång och mitten vid, under den tvärtom.
I praktiken är det bara observatörens telefon som kommer dit — den spelade filten döljer redan sina namn vid samma mått, eftersom det den behöver läsa där är antalet och formen och namnen står en knapptryckning bort i spelarket, och bordets egen skärm är en TV.

Mätt på observatörens filt, fyra platser med yta och räknare framför varje, två delade högar och något i varje hand: 15 par vid 390 och 27 vid 320 före, noll vid båda efter, och noll också när varje namn ritas 15 % bredare.
De 102 scenerna i `felt-names.test.tsx` — bordsläge vid varje platsantal och varje kvartsvarv, TV:n och Bord-fliken — är oförändrade.
Minsta etikett är 12 px, som den alltid varit.

---

### K20. Filten skriver i ett eget typsnitt: Roboto Condensed, skeppat med appen (prototypat och byggt 2026-09-13, #95, #94)

Beslutet, i en mening:

> Filtens namn, platskort och räknarbrickor ritas i Roboto Condensed — variabel vikt, latin + latin-ext, SIL OFL 1.1 — som följer med appen och ligger i dokumentet innan något målas, och grinden kräver att varje namn tål att ritas 15 % bredare än det gör.

**Buggen var ett tal, och talet var 2,0 %.**
K19:s filt tålde att varje namn ritades två procent bredare innan de två första nuddade varandra.
DejaVu Sans — det en Linux-burk, en CI-körare och en Android-TV faktiskt ritar med när man ber om `system-ui` — ritar K19:s namn 12–14 % bredare än Macens SF Pro.
Det var alltså aldrig ett CI-problem: designen hade aldrig råd med något annat typsnitt än det som råkade finnas på formgivarens egen maskin, och de åtta scener CI fällde var alla «ja» på en Mac med ett par pixlar över.
Det förklarar också varför de två tidigare pixelflyttarna inte räckte: 8 → 14/16 px `--name-in` köpte **absolut** utrymme i en design vars knapphet är **relativ**.

**Att skeppa ett typsnitt räcker inte — det måste vara ett smalare.**
Det här är prototypens viktigaste fynd och skälet till att beslutet namnger en familj i stället för att säga "ett eget typsnitt".
Inter är det uppenbara neutrala valet och ritar `RÄKNARE H` **bredare** än SF Pro (74,3 mot 73,1 px vid 13 px); den lämnar **3,5 %** marginal.
Den hade gjort CI grön — vilket är precis vad som gör den farlig, eftersom grönt då hade lästs som att klassen var borta, medan designen låg en etikettändring från samma fel.

**Roboto Condensed köper bredden utan att köpa den av bokstavshöjden.**
Den ritar `RÄKNARE H` 15,8 % smalare än SF Pro (61,6 mot 73,1 px) och har samtidigt en något **högre** versal — 9,24 mot 9,16 px vid 13 px — och samma x-höjd, 6,87 mot 6,84.
Den är den enda kandidaten i uppsättningen där båda de talen är minst dagens, vilket gör K18:s läsbarhetssiffror orörda per konstruktion och inte på någons ord.
Marginalen är **22,4 % på en Mac och 21,2 % under DejaVu**, tio gånger dagens, och de 70 mätningarna är identiska mellan de två maskinerna.
Skälet utöver siffrorna: Android-TV ritar redan sitt eget gränssnitt i Roboto, så ögat som läser bordet på tre meters håll läser en bokstavsform det är vant vid på just den skärmen — och TV:n är den skärm K19 finns till för.

Kandidaterna, marginal på Mac / under DejaVu: system-ui **2,0 / 0** (åtta fel), Inter 3,5 / 4,6, IBM Plex Sans Condensed 17,3 / 14,8, Source Sans 3 19,5 / 17,5, **Roboto Condensed 22,4 / 21,2**, Fira Sans Condensed 24,0 / 24,4, Barlow Semi Condensed 27,3 / 27,1.
Source Sans 3 får plats genom att vara **mindre** (versal 8,58, x-höjd 6,32 — 6 respektive 8 % under dagens) och är därför inte en kandidat alls.
IBM Plex Sans Condensed saknar vikt över 700, så högbrickans 800 hade ritats som 700 och brickan blivit lättare än K9 ritade den.
Barlow Semi Condensed var tvåa och kostar fyra statiska filer i stället för en, plus 4 % av x-höjden.

**En fil, fyra vikter.**
Filten ritar `.byd-zone > span` i 400, `.byd-hand-count` i 600, `.byd-seat-name` i 700 och `.byd-pile-n` i 800.
Ett variabelt ansikte täcker alla fyra: 51 kB (latin) plus 34 kB (latin-ext) woff2, minst i uppsättningen, mot fyra filer för de statiska kandidaterna.
Båda subseten skeppas, för platsnamnen skrivs av människor (A4) och ett tecken utanför de skeppade subseten ritas av ett systemansikte — och då är just det namnets bredd maskinens svar igen.

**Grinden kräver en marginal, inte "inget överlapp".**
Ett skeppat ansikte tar bort familjeskillnaden men inte den sista pixeln: Linux fontconfig snäpper varje glyfs framflyttning till hela pixlar medan macOS lägger dem på subpixel.
Det verifierades genom att slå av det — med `--font-render-hinting=none` blir varje kandidats marginal identisk med Macens på decimalen — och det är upp till ~1,5 px per namn som **inte** försvinner av att typsnittet skeppas.
"Noll överlapp" är därför fortfarande ett maskinberoende påstående, och kravet är i stället att filten är ren när varje namn ritas 15 % bredare: en andel, eftersom knappheten är relativ.
Femton procent är det minsta krav som skulle ha fångat felet, eftersom DejaVu ritar 12–14 % bredare; Roboto klarar 21–22 % och har alltså råg i ryggen.
Breddningen görs med `letter-spacing` Δ = (k−1)·w/n, vilket är precis vad ett bredare ansikte gör med den här layouten: varje namn är `nowrap` och förankrat i en av sina egna ändar, så elementets egen bredd är det som flyttar det.

**Ansiktet ska finnas innan något målas.**
Filten lägger om sig när ansiktet landar: `Räknare A` är 88,6 px i reservtypsnittet och 75,5 px i det skeppade, och alla sexton namnen byter bredd.
Det gäller under **både** `swap` och `block` — `block` döljer glyferna men lägger ändå ut raden i reservens mått, och platskortets piller ritas kring just de måtten.
Under det fönstret står filten i exakt det läge grinden fäller.
Bytesen ligger därför inbakade som `data:`-URL i css-bunten (`assetsInlineLimit` i `packages/web/vite.config.ts`), alltså i det ark dokumentet redan blockerar på: 114 kB base64 av 85 kB woff2.
Mätt, inte antaget: med ansiktet i arket är typsnittet färdigladdat efter 30 ms och första målningen sker vid 52 ms; med samma ansikte en rundtur bort är det färdigt först vid 186 ms medan målningen skedde vid 40 ms, och då är varje namn ritat i reservens bredd.

**Grinden mot att klassen kommer tillbaka.**
Ett test slår fast att filtens text verkligen ritas i det skeppade ansiktet och inte i ett systemfallback.
Det frågar Chromium vilket **plattformstypsnitt** som ritade glyferna, inte vad kaskaden bad om — en regel står kvar även när ansiktet inte kommer fram — och kontrollen i samma test kör samma markup utan typsnittsarket och får `.SF NS`, alltså maskinens eget.
Det kostar ingen CI-tid och kör var som helst.

**Följd för CI (#94): `main` får ingen egen workflow.**
När ansiktet skeppas är `felt-names.test.tsx` inte längre plattformsberoende, så beroendet tas bort i stället för att köpas bort med körtid.
Reproduktionen av den andra maskinen finns kvar som ett skript i stället: `packages/web/test/dejavu.sh` kör sviten i `mcr.microsoft.com/playwright:v1.63.0-noble` med `fonts-dejavu-core`.
Den bara imagen går grön av sig själv — den faller tillbaka på WenQuanYi Zen Hei — så typsnittspaketet är det som gör den till CI:s maskin.

**Licensen, och var den står.**
SIL Open Font License 1.1, upphovsrätten Google Inc. 2011, och **inget Reserved Font Name** i upphovsrättsraden — kontrollerat i filen — så namnet binder oss inte om ansiktet subsettas eller byggs om.
OFL tillåter att typsnittet skeppas med appen, även kommersiellt, på tre villkor: licenstexten och upphovsrättsraden följer med varje kopia, typsnittet säljs inte **för sig**, och en modifierad version bär inget reserverat namn.
Villkoret med tänder är det första, och det avgör var texten ligger: eftersom bytesen bakas in i `packages/web/src/fonts/felt-font.css` är **den filen** kopian, och en licens i en fil bredvid hade inte följt med bygget.
Hela licenstexten står därför överst i samma fil som en juridisk kommentar (`/*! … */`), `esbuild.legalComments` är satt så att minifieringen inte tar bort den, och `felt-font.test.ts` läser i det byggda arket att upphovsrättsraden och licensen finns kvar.
Det är samma åtagande som E4:s krav på att licensmetadata följer med hela vägen till det som levereras, tillämpat på appen själv i stället för på ett kort.
Gränsen mot B3 är värd att säga rakt ut: det här är **appens eget** ansikte för sitt eget gränssnitt, och det ändrar ingenting i att en mall får sin typsnittsfil uppladdad som projektets asset med licensen angiven bredvid familjen.

**Vad som inte ändrades.**
Kortets kortsida i TV-läge vid åtta platser är fortfarande 27 px vid 1280 × 800, 40 px vid 1920 × 1080 och 89 px vid 3840 × 2160, och minsta etikett är fortfarande 12 px — mätt i samma svit, inte påstått.
K19:s regel om var ett namn ligger är orörd; det här beslutet rör vad namnet är skrivet med.

**Var det bor.**
`packages/web/src/fonts/felt-font.css` deklarerar ansiktet och `--byd-felt-font`, och importeras av `main.tsx` så att det hamnar i entréns ark och inte i en rutt som kan delas av.
`table.css` läser variabeln på ett ställe — `[data-table]`, som allt filten ritar ärver från — plus de två som sätter en egen `font:`-kortform, platskortet och räknarbrickan.
Grinden är `packages/web/test/felt-names.test.tsx` (marginalen, det skeppade ansiktet, och att ansiktet finns före målningen) och `packages/web/test/felt-font.test.ts` (bygget: arket blockerar, bytesen ligger i det, ingen fontfil att hämta, licensen kvar).

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

Tillägg 2026-09-12: en bildyta fyller sin ram.
Bildens anpassning har tre värden — `cover` fyller ramen och beskär det som inte får plats, `fill` sträcker bilden till ramen, `contain` ryms hel inuti den.
Verktygsraden placerar `cover`, och egenskapspanelen erbjuder ett av/på för om bilden ska behålla sina proportioner: på är `cover`, av är `fill`.
`contain` finns kvar i modellen för mallar som redan använder det, men inget i editorn skapar det längre.

Motivering:
Rutan är det designern drar i — hörnhandtagen hänger på den, markeringsramen följer den och hjälplinjerna snäpper mot dess kanter.
En bild som ryms hel inuti sin ram slutar före rutans kanter, och då står hela editorn och pekar på kortets papper i stället för på något som syns; en bred bild i en 40 × 30-ruta lämnade en hel centimeter död marginal.
En bild som möter ramen kant i kant gör rutan sann, och sann på varje kort i leken — inte bara på det som förhandsvisas, vilket en ruta som låstes till den förhandsvisade bildens proportioner hade blivit.
Priset är att en bild med annat format beskärs, vilket är det ordinarie valet i ett ombrytningsverktyg och som växlas av med reglaget.

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

Kolumnbredderna, 2026-09-13 (prototypat i fem varianter, godkänd variant B — innehållet bestämmer, #46):
Bredden följer vad kolumnen innehåller.
Varje värde mäts mot den font cellen ritas i, varje kolumn ber om sitt bredaste värde, och överskottet delas mellan textkolumnerna i proportion till vad de bad om — underskottet tas från dem på samma sätt, aldrig under vad deras egen rubrik behöver.
Bara text ger och tar: ett tal är en siffra brett hur mycket plats som än blir över, och kortets id är en nyckel och ingen prosa.
Skälet att mäta i JavaScript och inte i CSS är att webbläsaren aldrig ser innehållet: varje cell är en `<input>`, vars egenbredd är dess `size` — tjugo tecken oavsett värdet — så auto-layouten gissade inte fel, den hade ingenting att gissa på, och alla fem kolumnerna blev 193 px vid 1280.
Typregistrets typ räcker inte heller: `title` och `body` är båda text och skulle få lika mycket, och `body` kapas ändå.
Mätningen läser `doc.rows` och aldrig raderna på skärmen, eftersom sortering och filter är vyer av projektet — en bredd tagen ur vyn skulle hoppa vid varje tecken i sökfältet.

Avsteg från ett accepterat kriterium: `grid-template-columns: minmax(0, 1fr)` på `.byd-editor` skrivs inte.
Kriteriet kom ur prototypen, och risken det pekar på är verklig — en mätning som frågar lådan hur bred den är, i en låda som tar sin bredd av det som står i den, hittar alltid exakt den plats den bad om och klämmer aldrig ihop någonting, så vid 768 rinner leken ut ur skärmen.
Men den lådan finns inte i editorn: `.byd-editor > main` scrollar, och en scrollcontainer har min-content noll, så ingenting under den kan skjuta dokumentet i sidled hur brett det än blir.
Mätt vid 768 med arton kolumner: sidan står still och tabellen klämmer ihop sig till 1294 px i en låda på 736; tas `overflow` bort från `main` växer tabellen till 2636 px och sidan scrollar 1900 px i sidled.
Ett kolumnspår på rutnätet ovanför skulle alltså vara en deklaration utan arbete — och en deklaration utan arbete är en deklaration ingen kan ändra tryggt, eftersom ingenting går sönder när den tas bort.
Det som låses i stället är egenskapen som faktiskt bär kravet: `overflow` på `main`, med ett `scrollWidth`-test vid 768 som tar bort just den regeln och ser sidan rinna ut.
Tabellens egen scrollåda bär det inte — tas bara den bort står sidan still — och testets kontrollfall tar därför bort en i taget.
Skulle `main` någon gång sluta scrolla är testet det som säger till.

Följdkrav:
`×` på en kolumnrubrik ligger inte i rubrikens flöde utan över dess högerkant och visas när kolumnen pekas på eller har fokus i sig; träffytan är kvar på 44 × 44, men två sådana på rad satte kolumnens golv vid ~114 px och gjorde en smal talkolumn omöjlig.
Två träffytor får inte plats bredvid varandra i en kolumn som är ett tal bred — 44 och 44 går inte i 64 — så rubriken delar ut dem i tur och ordning i stället för att låtsas dela ut dem samtidigt.
I vila är hela rubriken sorteringskontrollen: `×` är osynlig, och osynlig är inte detsamma som borta — `opacity: 0` målar ingenting och tar ändå varje klick den ligger över, vilket gjorde att mitten av `cost`s egen sorteringsknapp tog bort kolumnen i stället för att sortera den, och bara dess tio vänstraste pixlar fungerade.
Pekas kolumnen på, eller har den fokus i sig, är `×` där och tar sina 44 px; sorteringskontrollens ruta slutar då där `×`:ets börjar i stället för att täckas av den, så ingen av dem står någonsin på den andras mitt.
I en smal rubrik lämnar det sorteringskontrollen liten (10 px vid 64), och det den lämnar är precis den del av den som fortfarande syns — `×`:ets egen botten är målad över resten.
En träffyta som följer målningen är den ärliga; alternativet var en 44 px-knapp vars mitt tillhörde något annat.
`id` och `antal` bär ett hänglås där de andra bär sitt `×`, med skälet skrivet bredvid: ett hål förklarar ingenting.
Knappen som gör en kolumn flyttade in i den fastnaglade kolumnens rubrik; den hade en egen kolumn med tomma celler på varje rad, och det var de ~200 tomma pixlarna granskningen såg.
Ett värde som ändå inte får plats tonar ut i cellens kant — samma gest som den fastnaglade kolumnens uttoning (#53) — och besked om att det fortsätter finns kvar också när cellen har markören, vilket `text-overflow` på en input inte ger.
Uttoningen hålls borta från markören, vilket är det enda en uttoning tagen ur värdet kan göra fel: en input rullar till markören, så i en kapad cell står markören i värdets yttersta kant, och första versionen la den ungefär tio pixlar in vid omkring 0,4 i alpha — tecknen formgivaren skrev tonade alltså bort medan hon skrev dem.
Cellen håller därför en remsa vid sin högerkant som värdet aldrig når: uttoningen slutar där textytan slutar, och markören och tecknet framför den ligger alltid utanför den och alltid hela.
Med markören faktiskt i cellen tas uttoningen bort helt — ingenting som skrivs får dämpas, av något skäl — och det som säger att värdet fortsätter är märket som står i remsan, bredvid skrivandet i stället för över det.
Märket är den enda delen av gesten som varken kan rulla undan, tona bort eller skrivas igenom, och därför är det just det den fokuserade cellen behåller.
Bredderna står stilla medan en cell har markören och lägger sig först när den lämnas.
Överskottet delas i proportion till vad kolumnerna bad om, så när meningen som skrivs växer sju pixlar per tecken lämnar `art` och `title` ifrån sig en pixel eller två var och varje gräns till höger om dem flyttar sig — inklusive högerkanten på just den cell som skrivs i, så markören kryper undan under handen som skriver.
Fyra svar fanns: lägga sig vid blur, bara växa, fördröja, eller mäta utan den cell markören står i.
Valet är blur, eftersom tabellen redan svarar på frågan så: en rad håller sin plats medan en cell redigeras och tar sin nya när fältet lämnas (#15), och en bredd är samma löfte om samma ögonblick.
Bara växa lämnar leken permanent bredare än den är efter att ett värde kortats; en fördröjning flyttar gränsen ett ögonblick efter tangenttrycket, vilket är värre än att flytta den med det; och att utesluta en cell gör bredden till ett faktum om var markören står, vilket är precis vad en bredd inte får vara.
Om ett värde är kapat hålls däremot inte still — det är ett faktum om en cell och inte om leken, och det är sant eller falskt igen vid varje tecken.
Ingenting i cellen har någon egen åsikt om kolumnen.
`min-width: 12ch` på fältet skrevs för layouten mätningen ersatte och är 80 px: i en `cost` på 64 ritades fältet sexton pixlar in i `antal`.
`min-width: 100%` på tabellen är samma sak en nivå upp: under `table-layout: fixed` breddar den inte bara tabellen utan delar ut skillnaden över varje kolumn, tal som meningar, och en lek helt utan textkolumn har ingenting som suger upp den.
Båda är borta; mätningens summa är tabellen.
Mätningen körs när leken ändras och när rummet gör det, aldrig på en scroll: en scroll flyttar lådan, och en låda kan inte tala om för en kolumn hur bred den ska vara.
Varje värde mäts en gång och känns igen sedan, hållet mot den font och den inre marginal det mättes med.


Kolumnernas ordning och bredd, 2026-09-14 (prototypat i tre varianter, godkänd variant A — rubriken är handtaget, #46):
Ordningen är formgivarens och ändras där den står: en rubrik dras på en annan, och Alt med en pil gör samma sak ett steg i taget — samma par som lagerlistan redan svarar (#18), eftersom en ordning som bara kan dras är en ordning tangentbordet har tappat.
Ordningen skrivs in i dokumentet och inte i webbläsaren: den syns för alla som har projektet öppet, CSV-exporten skriver den, och ett steg tillbaka ska kunna ta tillbaka den — vilket en vy i en flik inte kan något av.
Det som skrivs ned är en *ordning* och ingen lista över vilka kolumner som finns: vilka de är härleds fortfarande ur vad mallen ritar och vad korten bär, och `columnsOf` lägger ordningen över den härledningen — namnen den känner, i den ordning den nämner dem, sedan allt den inte nämner där vandringen lade det.
Därför läser ett dokument skrivet innan någon kunde flytta en kolumn tillbaka exakt som förut, ett namn leken inte längre svarar på stegas över, och en kolumn som gjorts efter flytten står där en ny kolumn står.
`moveField` säger vart: `before` är kolumnen den kommer att stå framför, och `null` är sist av alla — de två sätt ett drag kan sluta på. Sagt i kolumner och aldrig i index, eftersom det index en ordning läses vid ändras i samma ögonblick som den bärna kolumnen lyfts ur den.
Historiken har ett ord för det: en version vars enda ändring är en flyttad kolumn läste förut som en tom sparning, eftersom diffen inte hade något att märka den med.

Bredden är däremot en vy av projektet och aldrig projektet (L4), precis som sortering och filter: hur brett én formgivare vill läsa en kolumn på sin skärm är inget faktum om spelet.
Den minns därför i hennes egen webbläsare, per projekt — en kolumn som heter `body` i ett spel säger ingenting om en som heter `body` i nästa — och en webbläsare som vägrar lagra ritar ändå varje bredd hon drar; den glömmer bara till nästa besök.
En dragen kolumn tar exakt det den fick: den står helt utanför utdelningen, och allt annat fortsätter dela på det som blir kvar som om den inte fanns. Ett smalare fönster tar sina pixlar ur de kolumner som fortfarande mäter sig själva.
Bredden reser på kolumnens eget `<col>`, bredvid vad kolumnen är värd att storleksättas som, så `fitColumns` får hela svaret av tabellen och behöver fortfarande inte veta vad någon kolumn heter.
Kanten ligger innanför sin egen rubrik och inte över gränsen: en rubrik klipper sitt eget spill för att hålla sig inom sin kolumn, så ett handtag lagt tvärs över linjen har en yttre halva som tillhör nästa rubrik — och ett drag i bredden blev då ett drag i ordningen. Uppmätt i prototypen.
Golvet är 44 px: smalare än en fingertopp är ingen bredd någon valt utan en kolumn som kastas bort av en hand som halkade, och vars egen kant sedan är för liten att få tag i.
Alt och Skift med en pil gör samma sak från tangentbordet, bredvid Alt ensamt som flyttar kolumnen.

Följdkrav, och vad de ersätter:
`×` står inte längre på kolumnrubriken alls, utan bakom huvudets egen dörr — den där en kolumn redan görs (#32) — tillsammans med listan över tabellens kolumner och den satta bredden.
Det upphäver hela räkneuppställningen från 2026-09-13 om två träffytor som delas ut i tur och ordning: den handlade aldrig om att ta bort en kolumn, den handlade om var kontrollen stod.
En rubrik bär sitt ord och sättet den sorterar på, och ingenting mer — vilket är allt en rubrik som också ska gå att dra och dra i har plats att vara.
Hänglaset flyttar med: i en panel finns plats för skälet i ord, vilket en rubrik aldrig hade, och `antal` får tillbaka de nitton pixlar det tog.
Huvudets tabbordning är ett stopp per kolumn och en dörr, där den förr hade en kontroll som tar bort en kolumn mellan varje par av namn.
Kolumnlistan i dörren rullar och blanketten under den står stilla: en lek med tjugo kolumner hängde annars dörren utanför fönstrets nederkant, och det som föll av var vägen att göra den tjugoförsta.
Varken `id` eller `antal` kan bäras, är en plats att lägga en kolumn på, eller har en kant att dra i: id är en maskinnyckel och `antal` står sist där tabellen visar det (L4).
Pilen utan Alt är läsarens egen och rörs inte, och en rubrik som kan bäras har inte slutat vara en som kan tryckas för att sortera.
En flytt sägs i den enda kanal allt på en skärm talar i (#7): ett drag är sitt eget svar för ögat, men en kolumn som flyttat sig under fokus utan att något sagts är en kolumn läsaren har tappat.

Dragningen ritas av mätningen och inte vid sidan av den (2026-09-14, ur ett UX-test av #46):
Handen deklarerar sin bredd på kolumnens eget `<col>` och mätningen körs — samma två steg som släppet tar, i samma ordning, genom samma dörr — så bilden under handen är den tabellen behåller.
Skriven rakt på kolumnen i stället, som den var, visste ingenting annat om den: tabellens egen bredd sa fortfarande vad den förra mätningen sa, och under `table-layout: fixed` delar en tabell som är bredare än summan av sina kolumner ut skillnaden över dem allihop.
Uppmätt i Chromium: en kolumn dragen 300 px smalare ritades 56 px bredare än den bredd den just fått.
Kanten släpade alltså efter handen på väg in, sprang före den på väg ut, och hoppade när handen släppte — 24 px på en dragning av `title`, 82 px på en av `body`.
En press som inte rör sig är ingen bredd: kanten står över rubrikens tio högraste pixlar, och en pekare som vilar på en knapp glider en pixel eller två när den släpps, så ett klick satte kolumnen till den bredd den redan hade och lämnade den där.
Tyst dessutom, eftersom en kolumn som slutat följa sin lek ser precis ut som en som fortfarande gör det, och vägen tillbaka var dörren eller ett andra klick.
Golvet för att en press ska vara en dragning är tre pixlar; smalare än så är ett grepp som halkade och inte en bredd någon valde, precis som 44 px är det på andra ledden.
Vilka kolumner som står utanför lådan säger tabellen i den rad som redan säger vad vyn håller (prototypat 2026-09-15 i fyra varianter, godkänd variant C, ur UX-testet av #46):
Uttoningen vid nålen (#53) säger att *ett värde* är kapat, aldrig att en hel kolumn ligger där borta — och det som rullar in under nålen efter en dragning är oftast den tomma änden av en mening, som tonar bort utan att någon märker det.
Så "6 av 6 kort" får sällskap av "2 kolumner till höger: cost, antal", och meningen är en knapp: att veta att de finns är till ingen nytta utan en väg tillbaka till dem.
Knappen tar ett steg på fyra femtedelar av lådan i stället för ett hopp till slutet, så räkningen bredvid den räknar ned medan handen trycker och läsaren kan stanna vid det hon letade efter.
En kolumn är utanför när dess rubrik inte alls överlappar den del av lådan som går att läsa — förbi vänsterkanten, eller bakom nålen. Delvis täckt är inte utanför; det är just den kapning uttoningen redan finns till för.
Glidningen begärs vid anropet och inte i stilmallen: `scroll-behavior` på lådan hade varit ett svar på varje rullning någon någonsin ber den om — inklusive den ett test gör för att se var nålen faller, och webbläsarens egen när den hämtar in en fokuserad cell. Den som bett om mindre rörelse får hoppet i stället; meningen är densamma.
De tre varianter som inte vann, och varför: samma uttoning i huvudet som raderna har (minsta möjliga ändring, men säger varken hur många eller vilka); en rullningslist som alltid syns (kan inte lånas av webbläsaren — macOS gömmer sin överliggande list och Chromium lägger ingen i layouten alls, uppmätt `clientHeight === offsetHeight`, så den måste ritas för hand); och att låta det stå.

Dörrens lista tar den höjd fönstret lämnar den (prototypat 2026-09-15 i tre varianter, godkänd variant B):
Listan var 232 px hur högt fönstret än var — fem rader av en lek med tio kolumner, den femte kapad mot blankettens egen linje, och ingenting sa att den fortsatte.
En längre lista var inte svaret heller: blanketten under den är vägen att göra nästa kolumn, och det var den som föll av nederkanten när dörren växte.
Så dörren mäter var den själv hänger när den öppnas och tar resten av fönstret; listan tar det som blir över och rullar bara när även det inte räcker; blanketten står kvar under den.
Bara dörren kan fråga det: den hänger under huvudets sista ruta, och var den rutan står beror på leken ovanför — `100vh` minus en gissning är en gissning.
Golvet är 240 px, för ett fönster som är lägre än så är ett fönster där listan rullar inuti dörren precis som förut.

Det som fattas tas bara där det får tabellen att rymmas:
En dragen kolumn är exakt så bred som formgivaren sa, så en lek kan bli bredare än fönstret — och förbi den punkt där meningarna på sina golv ändå inte täcker glappet köper varje pixel som tas från dem ingenting.
Lådan rullar i båda fallen; skillnaden är ett värde ingen kan läsa.
Uppmätt: `body` draget till 1100 px vid 1280 tryckte ner `art` på sin egen rubrik och kapade dess värden i en tabell som var 1668 px bred oavsett, och ett dubbelklick som gav `title` tillbaka till innehållet gav den 64 px där innehållet behövde 70.

En bredd lever bara så länge kolumnen gör det: tas en kolumn bort ur huvudets dörr glöms bredden i samma andetag, och utan ett ord, eftersom det som hänt är att en kolumn är borta och inte att den följer sitt innehåll igen.
Kvar låg annars ett tal under ett namn ingenting svarar på, och nästa kolumn som gjordes under det namnet — tom och splitterny — ritades i en bredd en hand valt åt någon annans värden.
Kvar står att kolumnerna *före* handen fortfarande delar med sig, eftersom en dragen kolumn står utanför utdelningen och alla andra delar på det som blir kvar: en dragning av `body` över 260 px flyttar kanten 178, och dess första 65 px flyttar den inte alls, för `art` ger ifrån sig lika fort som `body` växer.
Det är utdelningen ovan, nu ärligt ritad medan handen håller i den — ska den ändras är det utdelningen som ändras och inte dragningen.

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
Bekräftelsen är skyddet före en radering, och den står kvar även sedan editorn fick en ångra-stack (#35, L14): en fråga som ställs innan kortet försvinner är billigare än ett kort som försvann och ett tangentbord som ska hitta tillbaka.

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

### L13. Ett knappspråk: tre roller, en form var (2026-09-11)

Granskningen UX-13 (#44) fann tre primärknappar som inte såg ut som varandra — wizardens nästan svarta, editorns blå, inloggningens gröna — och rekommenderade en gemensam.
Prototypen (`one-button-language`, fyra språk plus nuläget, mätt i Chromium) svarade att färgen aldrig var problemet.
En människa som går mellan fyra ytor på fem minuter läser vikt före kulör, och det som gör knappen svår att hitta i dag är inte att den är grön här och blå där — det är att flera saker bär primärvikt på samma yta.
Beställaren valde därför variant **B: en form, lokal färg**.

Rollen bärs av vikt, storlek och form, och ingen kulör flyttar.
Filten förblir grön, wizarden papper, editorn blå, och varje yta binder rollerna till den accent den redan äger.
Det är också det enda valet som inte kostar någon av de fyra redan beslutade paletterna (L8, L11, wizardens accent) något.

**Tre roller, en form var.**
*Första handlingen* är fylld, och är det enda fyllda i sin vy — vad färgen än råkar vara.
*Andra handlingen* är kantad och står bredvid den.
*Valt* är ett stillsamt piller med en 3 px stapel under sig, aldrig en fyllning, så att något som är på aldrig kan läsas som något att trycka på.
Reglerna som ritar dem står en enda gång, i `packages/web/src/buttons.css`, och varje rum binder sina sex tokens till sin egen accent.

**Varför "valt" är en enda form.**
Verktyget ritade "den här är på" på fem sätt, och ett av dem lånade en annan ytas färg: tabellfiltrets chip var `#7dd3a0`, kontots gröna, mitt i editorn.
Ytorna läckte alltså redan in i varandra, bara osystematiskt.
En markörposition i ett rutnät är däremot inte "valt" och får inte den formen: symbolbibliotekets `aria-selected` är dit pilarna gått, delar regel med `:hover`, och listan stängs i samma ögonblick som något väljs — det är en markör och bär editorns märke som ring, inte en stapel och absolut inte primärfyllningen.

**Sekundärens kant är en egen färg, och den är mätt.**
Det fanns ingen kantad knapp i verktyget innan detta.
Det som såg ut som en var, mätt, en knapp utan kant: editorns `#3b414e` mot kromet `#23262e` ger 1.48:1 och wizardens `#cbcabe` mot pappret `#f5f3eb` ger också 1.48:1, båda långt under 3:1 för grafik.
`--byd-secondary-line` är därför en färg med ett eget jobb — `#6f7a90` på de mörka ytorna, `#797d75` på papper — och hålls till 3:1 mot den yta den faktiskt landar på, precis som varje annan grafik (L11).

**Rollen måste vinna över ytans egen regel, i varje tillstånd.**
`.byd-join-observe` deklarerade en tyst kantad knapp och förlorade tyst mot `.byd-join form button` — (0,1,0) mot (0,1,2) — så hela deklarationen var död kod och "Titta på" ritades identiskt med "Sätt dig".
Ett rum plus en roll är två klasser och vinner; ett rum, en roll och ett tillstånd är tre och vinner över ytans `:hover` och ytans `:disabled`.
Det gäller inte bara i vila: wizardens `button:hover` är (0,2,1) och tog tillbaka linjen så fort primärknappen pekades på, och `/join`:s `form button:disabled` är (0,2,2) och tog fyllningen men inte linjen, vilket gav en grå knapp i en grön ring i det tillstånd sidan öppnar i.
Båda mäts numera på beräknad stil, inte på att en regel finns.

**Rummen är sju, inte fem.**
Issuet räknade fem ytor — kontot, platsväljaren, wizarden, editorn och telefonen — men telefonens egna ark, enkäten och tillbakaspolningsfrågan öppnas också på `/online` och på `/observe`, under egna klassnamn.
Bundna bara till `.byd-player` föll varje token tillbaka till ingenting där, och en fyllning som inte löser sig är ingen tyst knapp utan ingen deklaration alls: webbläsaren ritar sin egen gråa systemknapp på en mörk filt.
Gränsen går vid vilket rum en överlagring faktiskt monteras i, inte vilken komponentmapp den ligger i.

**Vad som medvetet lämnas utanför.**

Det finns ingen destruktiv roll.
Prototypen hade en rödkantad tredje roll, men verktygets farliga handlingar — att lämna sin plats, att avsluta bordets session för alla — är redan medvetet *inte* första handlingar (#31, C9), och de ställs som frågor i ark där texten under knappen säger vad den kostar.
En röd knapp till hade gjort dem mer synliga, inte mer förstådda.
Den dagen en verklig oåterkallelig radering finns i verktyget är det ett eget beslut med en egen mätning.

`status.css` är en sjätte yta med en egen primärknapp och står utanför språket tills vidare.
Den deklarerar `--byd-status-primary-bg` och `--byd-status-primary-ink` själv, och de råkar vara samma gröna som filtens.
Ytan är statussidor — en stängd dörr, en tappad anslutning — och den ritas ovanpå vilken annan yta som helst, vilket är just skälet att inte binda den till ett rums accent förrän någon har bestämt vilket rum en statussida står i.
Det är en känd avvikelse och inte ett förbiseende.

Under skrivbordet har wizardens steg `Korten` två element med primärvikt i samma vy: sidfotens "Skapa spelet och fortsätt i editorn" och stegnavigeringens "Nästa", där den senare bara finns på smal skärm.
Enligt L12 granskas och mäts wizarden vid skrivbordsbredder, så detta är per beslut och inte ett fynd — men det står här i stället för att vara tyst.

Reviderat 2026-09-14 (#90): filten är ett rum med en egen accent.
Filten var ingen av L13:s ytor, och #67 band `.byd-table` i förbifarten därför att den behövde en enda knapp — den som behåller en räknares nya värde — och band den till kontots gröna.
Sex tokens, teckenidentiska med `.byd-player`:s: filten fick alltså ingen accent, den lånade rummet bredvid, och det är precis det den här punkten fanns för att stoppa.
Prototypen (`the-felt-answers-two-questions` @ `9631732`, fyra positioner, 96 mätpunkter och 1 248 knappar mätta på de målade bildpunkterna) kallade den bindningen position B, fattad utan att sägas, och beställaren har ersatt den med ett val.

Filten binder de tre rollerna till brickans bärnsten `#f0b64a` med `#1c1c1c` som bläck, och till filtens egen kritfärg `#f3e9d6` som linje och som bläck för det kantade och det valda.
Den gröna kan inte vara accenten, eftersom den gröna är *grunden*.
Båda de valda färgerna ligger redan på filten — bärnstenen på varje räknarbricka, kritfärgen i varje högs antal — och båda läses redan på tre meters håll (K9), så rummet får en accent det äger utan att någon ny färg uppfinns.
Priset är att bärnstenen får två betydelser, "en räknare" och "första handlingen", och det är medvetet.

Ringens skivor tas in i rollernas färger men behåller sin platta.
En kantad skiva som landar på ett kortansikte mäter 1,22:1, och kortets ring öppnas per definition på ett kort, så plattan är det som gör en skiva läsbar var som helst på filten: rollen bestämmer kulören, inte formen.
Ringens kant var en avvikelse som rättades på vägen: `#3b4358` klarade inte 3:1 mot någon grund alls, 72 fall av 72, mellan 1,01 och 2,72:1.
Den är nu två linjer, kritfärgen med filtens mörkaste ton `#0d0f14` som ring strax utanför, eftersom ingen enskild färg kan klara 3:1 både mot ett nästan svart omland och mot ett blekt kortansikte.

Två saker på kortets ring rättades när den granskades på ett kortansikte, och båda är ringens egen styrning.
**En skiva som inte är tillgänglig är fortfarande en skiva.**
`opacity: 0.35` tonar hela elementet på en gång — plattan, bläcket och båda linjerna i kanten — och på ett blekt kortansikte blev skivan en grumlig fläck utan gräns: 1,39:1 för ordet och 1,98:1 för kanten, alltså slutade den säga just det den skulle säga, att verbet finns men inte går att få.
Det som är otillgängligt sägs därför medvetet i stället: plattan förblir ogenomskinlig men tappar sitt djup (`#2d2f35`, plattan med en tiondel krita i), kritan gnuggas 60 % in i plattan (`#9b968e`), båda kantlinjerna lämnas orörda — var en skiva slutar beror inte på om den går att trycka på — och skivan slutar stå ovanför filten: två linjer kvar, lyftet borta.
Ordet mäter 4,5:1 mot samma ords 14:1 när det går att trycka på, och grinden för en otillgänglig kontroll är **3:1**, inte L13:s 4,5:1: WCAG 1.4.3 undantar en inaktiv kontroll helt, och det undantaget var precis den licens `opacity: 0.35` tog, men en ring läses på tre meters håll (K9) och den läses *som en lista* — den som inte kan tyda det gråa verbet vet inte vilket verb hen inte erbjuds, och ett hål i ringen är värre än ett svagt ord i den.
**Ringens mitt är det ringen handlar om, så där ritas ingenting.**
`.byd-radial::before` lade en genomskinlig grå skiva, `rgba(23, 26, 35, 0.55)`, mitt i ringen, och kortets ring har ingen nav — så den låg rakt ovanpå kortet vars verb valdes: kortets eget bläck mätte 3,66:1 genom den där det mäter 13,19:1 utan den.
Den enda ring som vill ha en platta i mitten är brickans, och den har redan en: navet, ogenomskinligt just därför att filten inte kan säga vad en bricka är (#67).
En platta i mitten är alltså vad ringen handlar om när filten inte kan rita det själv, aldrig en ton över det filten redan har ritat.
Tillagt 2026-09-14 (#89): navet står ovanför filten som skivorna det håller ihop, med samma två linjer — den nästan svarta ringen som säger var det slutar och skuggan som lyfter det — eftersom en mitt som ligger plattare än allt den ankrar läses som ett hål i filten och inte som ringens mitt; det är allt navet tar från en skiva, för det är ingen kontroll och behåller `pointer-events: none`.

De tre förkastade positionerna, med talen:
**B**, att låna spelarens rum, faller på att språkets delade sekundärlinje `#6f7a90` mäter 1,60:1 på det gröna och 4,06:1 på TV:ns mörka filt — den går alltså igenom just där grunden inte är grön, vilket betyder att en grind som bara mäts i TV-läge godkänner en felaktig bindning.
Därför mäts filten i **bordsläge**, och det är det kravet som är den egentliga lärdomen.
**C**, att låta filten stå utanför språket som `status.css`, mätte sämst av alla fyra (96 fall): dialektens platta `#171a23` är samma färg som TV-filtens `#151924`, och utan kantad form kan räknarens ark inte rita sina två vägar ut som ett par.
**N**, nuläget, är själva felet.

`button-language.test.tsx` mäter allt ovanstående i Chromium på varje yta monterad vid sin egen rutt, och `button-language-contrast.test.ts` mäter varje färg språket föreslår mot den yta den landar på.
Filten mäts inte som de andra fem, eftersom den inte har någon grund att läsa ur en deklaration: det gröna är en `radial-gradient`, träramen en `linear-gradient`, omlandet en tredje, ett kortansikte en `hsl()` ur kortets egen färgton och ringens skivor ligger ovanpå vilken som helst av dem.
Grunden samplas därför ur de målade bildpunkterna (`packages/web/test/painted.ts`) och en grund redovisas som tre toner — den mörkaste tjugondelen, mitten och den ljusaste — så att en färg måste hålla sin gräns mot hela ytan och inte mot en lyckad bildpunkt.

### L14. Ett grepp är ett steg tillbaka (2026-09-14)

En ångring tar tillbaka en sak designern gjorde, inte en bildruta av den.
En förflyttning på duken är ett grepp om pekaren, och pekaren rapporterar det en gång per bildruta.
Varje bildruta blev ett eget steg på stacken, så vägen tillbaka från en flyttad rubrik var trettio tryck på Ctrl+Z — och varje tryck flyttade den en tredjedels millimeter, vilket läses som att ingenting händer.
Ett ord skrivet i en cell hade samma fel: tabellen skriver ett värde per tangenttryck, så bokstäverna kom tillbaka en i taget i ett fält designern redan hade lämnat.

Beslutet: en redigering kan bära en polett som säger vilket grepp den hör till, och redigeringar med samma polett delar ett steg på stacken.
Poletten görs där greppet börjar — ett nytt nummer vid varje `pointerdown` på duken, ett nytt varje gång en cell tar fokus — så ett andra grepp om samma element är ett andra steg, och att komma tillbaka till samma cell är ett nytt.
En redigering utan polett är en hel förändring i sig, precis som förut: egenskapspanelen, piltangenterna, verktygsraden, allt som görs med ett tryck.
Ett steg bakåt eller framåt stänger det grepp som står öppet, så nästa bildruta av en pågående dragning aldrig kan lägga sig på ett steg designern just tagit av stacken.

Motivering:
Stacken är femtio steg djup, och den siffran är bara sann om ett steg är något designern kan känna igen.
En enda dragning kunde annars trycka ut hela historien framför sig, så priset var inte bara många tryck utan resten av ångra-historiken.
Alternativet — att skicka en dragning först när pekaren släpps — skulle ha gjort steget rätt och samtidigt tagit bort det som gör ett delat projekt levande: den som tittar på samma projekt ser kortet röra sig i stället för att hoppa på pekarens släpp.

Följdkrav:
Trafiken på tråden är oförändrad; varje bildruta går fortfarande som sin egen `patchElement` till aktören.
Stacken är fortfarande dokumentögonblicksbilder som tas tillbaka med `restore` (B4), och poletten avgör bara när en ny bild läggs på.
En ny yta som skriver många gånger om samma handling — ett reglage, en färgväljare som drar — ska bära en polett; en som skriver en gång ska inte.

Byggt 2026-09-14 (ingen prototyp: ingenting nytt ritas, ett tryck gör det den som tryckte redan trodde att det gjorde).

### L15. Lagerpanelen säger vad ett lager är, och ett lager går att låsa (prototypat 2026-09-14)

Panelen skrev `text title`: verktygets ord för sorten, och det råa id:t.
Det säger ingenting om vilket lager som är vilket så snart verktygsraden har lagt till `bild-1` och `shape-2` på kortet.
Och ingenting skyddade ett färdigt lager: ramen som legat rätt sedan i måndags flyttades av samma dragning som allt annat.

Prototypen `packages/web/src/prototype/layers` ställde tre varianter mot varandra i de 220 px panelen faktiskt har — lås i egen kolumn (A), verktygsrad över listan (B), vald rad som öppnar sig (C) — plus en fjärde (D) där bara den markerade raden bär upp/ned.
Beställaren valde **A**, och valde bort upp/ned-knappar helt: ordningen ändras med drag och med Alt och en piltangent, och det som gör dragningen lättare är dropplinjen som säger var lagret hamnar, inte en knapp till.

**Raden.** Lås till vänster, glyf för sorten, namnet, vad lagret visar, och ett grepp till höger.
Namnet är lagrets id, för det är ordet wizarden gjorde av kolumnen och ordet egenskapspanelen redan har i sin rubrik — eller det namn designern själv gett lagret, som byts med dubbelklick eller F2.
Namnet är en egen egenskap och inte id:t: id:t är det gruppernas `override` och `remove` pekar på (L3), så att byta det vore en migrering och inte en omdöpning.
Andraraden är vad lagret visar, och står där bara när det inte är namnet en gång till.

**Panelen är ett rutnät, inte en lista med alternativ.**
En rad bär en egen knapp, och en knapp inne i ett `option` är en knapp en skärmläsare aldrig når — alternativets innehåll plattas ut (UX-37, #82).
Så panelen är `role="grid"` med en rad per lager och två celler: låset och lagret.
Rutnätet är ett enda tabbstopp, upp och ner går mellan lagren i den kolumn man står i, höger och vänster mellan låset och lagret, Alt och pil flyttar lagret, F2 döper om.
Priset är att piltangenterna inte längre nudgar elementet medan fokus står i panelen; det gör de på kortet och i egenskapspanelen, precis som i varje annat ritverktyg.

**Låset.** Ett låst lager går inte att dra, storleksändra, nudga eller radera, och det har inga hörnhandtag.
Det går fortfarande att markera — pekaren väljer det, egenskaperna öppnas, och låset finns på samma rad — och det går att flytta upp och ner i ordningen: låset är en sak om kortet, inte om listan.
Egenskapernas fyra mått går att läsa men inte att skriva i; typsnitt, färg och bindning står öppna, för att låsa ett lager är inte att frysa dess formgivning.
Ett försök som inte leder någonstans säger varför, bredvid kortet som inte rörde sig — annars är ett lås omöjligt att skilja från en trasig editor.
Låst ritas i guld och som ett stängt hänglås: formen säger det där färgen inte når.

**Två egenskaper som mallen bär men kortet aldrig visar.**
`name` och `locked` ligger på elementet (L1) och versioneras, diffas och delas som allt annat i mallen, men kompilatorn läser ingen av dem: ett kort ska bli samma kort oavsett om ett lager var låst när det ritades.
Att ta bort dem är en egen sak på tråden: `undefined` överlever inte JSON, så `patchElement` har ett `clear` som säger vilka egenskaper som ska bort.
Utan det hade ett upplåst lager sparats som fortfarande låst, och en version som bar en tom nyckel till tryckeriet.

Motivering:
Ett lås är det billigaste skyddet som finns mot den enda redigering ingen ångrar i tid — den man inte märkte.
Alternativet, att lita på Ctrl+Z, förutsätter att man ser att något flyttade sig, och en halv millimeter på ett kort är just vad man inte ser.

Byggt 2026-09-14.

### L16. Fyllningen kan följa en kolumn (2026-09-14)

En fyllning är en färg, eller en regel på en kolumn: vilken kolumn som ska läsas, en färg per värde, och en färg för allt annat.
`fill` är därför antingen en sträng som förut eller `{ field, map, else }`, och `paintOf` är enda vägen från regel till färg — kompilatorn, den fysiska valideringen och editorns förhandsvisning kan aldrig komma fram till olika färger.

Motivering:
Det gick redan att ge fällorna en röd platta: en variant per värde (L3).
Men en variant är hela kortets utseende, så tjugo färger blev tjugo flikar med samma design inkopierad i var och en, och en ändring av rubrikens läge blev tjugo ändringar.
Färgen är inte en egen formgivning; den är en egenskap som varierar.

Alternativet var en färgkolumn i datatabellen som elementet binder till.
Det avvisades: då bär varje kort sin egen hexkod, att byta nyans blir en redigering per rad i stället för en, och datatabellen — som är designerns lek — fylls med tolkning som hör hemma i mallen.
Regeln på elementet håller färgerna där all annan stil bor och låter leken säga vilken av dem ett kort får, vilket är exakt L3:s modell tillämpad på en egenskap i stället för på ett helt utseende.

Ett värde utan egen färg får `else`, precis som ett kolumnvärde utan variant får basutseendet — utan varning, för de flesta kort är det vanliga.
Saknas även `else` är formen omålad, vilket är vad en form utan fyllning alltid har varit.

I editorn är det en växel på fyllningen.
Den färg designern redan valt blir regelns `else` när växeln slås på, så inget kort byter utseende förrän ett värde fått en egen färg; slås den av bär formen den färgen vidare.
Värdena som erbjuds är lekens egna, i den ordning korten står, plus de värden regeln målar men vars kort har försvunnit — en färg utan något att visa sig på måste ändå gå att hitta och ta bort.
Varje värde med egen färg har ett kryss tillbaka till `else`, för "följer standardfärgen" och "är målad i samma nyans som standardfärgen" är två olika saker och skillnaden går bara att uttrycka med en väg tillbaka.

Följdkrav:
Textens färg och formens linje är fortfarande enfärgade. De kan ta samma `Paint` den dag någon behöver det — modellen är redan skriven för det — men inget i editorn skapar en sådan regel i dag.
Färgblindhetskontrollen (E5) läser den färg raden faktiskt får, alltså kortet i handen och inte mallen i abstrakt form.

Byggt 2026-09-14 (ingen prototyp: växeln och listan är egenskapspanelens egna former, och regeln ritar ingen ny yta).

### L17. En form är en väg, och en väg bär mönster och skugga (prototypat 2026-09-14)

Formvokabuläret var `rect`, `circle` och `line`, och av dem nådde bara fyllningen egenskapspanelen: det gick inte ens att välja cirkel i editorn, och en linje ritades som en rektangel.
Nu ritas varje form som en path i en SVG inuti sitt element.
En kodväg för rektangeln, sexhörningen och linjen, och konturen betyder samma sak i alla tre.

Vokabuläret är en parametrisk kärna med ett galleri ovanpå, vilket är L14:s mönster igen — en dörr, inte en grind.
Kärnan är `polygon` (hörnantal, vridning) och `star` (uddar, vridning, uddjup); tillsammans täcker de triangel, romb, kvadrat, femhörning, sexhörning i båda lägena, oktagon och varje stjärna.
`shield`, `banner` och `arrow` är konturer ett hörnantal inte kan beskriva och står som egna namn.
En kapsel är ingen egen form utan en rektangel med en radie större än rutan; galleriet skriver ut det i rutans egna mått, så dokumentet säger en siffra och inte ett magiskt ord.

Formen passas in i sin ruta i stället för att skrivas in i en cirkel inuti den.
Motivering: rutan är det designern drar i, hörnhandtagen hänger på den och hjälplinjerna snäpper mot dess kanter — exakt samma skäl som gav bilden `cover` (L1, 2026-09-12).
En form som slutar före rutans kanter får hela editorn att peka på kortets papper i stället för på något som syns, och en roterad fyrhörning inskriven i en ellips fyllde inte rutan alls.
Priset är att en sexhörning i en bred ruta är en bred sexhörning, vilket är vad ett ombrytningsverktyg gör.

Konturen ligger innanför rutan, som den ram den ersätter.
En `border` i CSS ritas innanför rutan medan en `stroke` i SVG grenslar linjen den ligger på, så vägen dras in med halva linjebredden: linjens yttre kant hamnar exakt på rutan.

Mönstret är ett lager över fyllningen, inte en fyllning i sig.
Därför fortsätter en fyllning som följer en kolumn (L16) att göra det, och mönstret rider på den färg raden än landar på.
Fem sorter — ränder, rutnät, prickar, romber, fiskben — med färg, storlek och vinkel; rutnätet vridet 45° är korsskraffering och ränderna vridna 45° är diagonaler, vilket är varför vinkeln förtjänar sin plats och inte två sorter till.
Brickan namnges efter kortet den hör till: många kort delar en sida i kortväggen och i tryckarket, och två brickor under samma id hade lämnat varje kort med det första kortets mönster — ett fel som bara visar sig när en lek har två av något.

Skuggan är ett filter på elementet och inte på vägen, så den följer den form som faktiskt ritades: en sexhörning kastar en sexhörnings skugga.
Reglaget är fyra förval — ingen, mjuk, hård, upphöjd — med ett `Anpassa` som fäller ut riktning, avstånd, mjukhet, färg och genomskinlighet.
Genomskinligheten är ett eget tal och inte en del av färgen, eftersom väljaren som plockar en färg inte kan säga hur genomsiktlig den är, och en skugga som inte är genomsiktlig är en utstansning.
Skuggan sitter på formen. Modellen är skriven så att den kan flyttas upp till alla element den dag det behövs, men skugga på text är en tryckrisk (E5) som behöver egen validering och inget i editorn skapar en sådan i dag.

Den fysiska kontrollen läser båda färgerna på en mönstrad platta.
Text som syns mellan ränderna och försvinner på dem är ett kort som faller i handen medan kontrollen kallade det helt, så kontrasten mäts mot den sämsta av fyllningen och mönstrets bläck.

Baksidan erbjuder färdiga ryggar.
Var och en är en vanlig elementlista — botten med mönster, en inre kant, ibland en medaljong — så den går att ta isär och ändra efteråt; det är en utgångspunkt och inte en låst bild.
Galleriet står framme i lagerpanelen så snart baksidan är öppen, inte bakom en knapp: den som landar på en tom baksida ska se vägen vidare utan att leta efter den.

Följdkrav:
Varje ny namngiven form är en modelländring och ett beslut här; den parametriska kärnan finns just för att listan inte ska växa för varje önskemål.
Galleriets glyfer ritas av samma `pathFor` som kortet, och mönstersvalen av samma `tileMarkup`, så bilden på knappen kan aldrig säga emot vad ett tryck på den ger.
En glyfruta är bredare än hög: en kapsel i en kvadratisk ruta är en cirkel, och ett galleri där två knappar ritar samma bild går inte att läsa.

Prototypat 2026-09-14: tre paneler — allt staplat, panel med flikar, galleri på duken.
Valet blev den staplade panelen, som är precis hur panelen redan beter sig för text, med baksidesgalleriet hämtat från flikvarianten.
Flikarna göms fyllningen medan formen väljs och inför en navigering inuti en panel som inte har någon; galleriet på duken skilde formen från sina egna siffror.

### L14. Ett spel utan den guidade starten (2026-09-13)

Den guidade starten (E3, L6) är en dörr, inte en grind.
Den som hellre bygger allt själv skapar spelet från steg 1 i wizarden med bara namnet och antalet spelare — de två saker varje spel har — och hamnar direkt i editorn med ett tomt spel: inga kort, inga fält, en tom fram- och baksida.
Bordet är receptets, precis som för ett spel som går den guidade vägen (B5, K18, C4), eftersom ett spel har ett bord vilken dörr det än kom in genom; det vrids efteråt i fliken "Bord".

Motivering:
Wizarden är en kort grafisk start för den som vill se sina fält på exempelkort innan editorn (E3).
Den som redan vet vad hen vill ha tvingades igenom tre steg och fick sedan städa bort exempelkort, startram och fyra föreslagna fält som inte var hens.
Villkoret från E3 gäller oförändrat: samma dokument, samma väg (`POST /projects`), ingen parallell kodväg — editorn kan inte se vilken dörr ett spel kom in genom, och det första elementet och det första kortet görs där med samma redigeringar som varje annat spel får.

Utseende: ett stillsamt block under namnet och spelarantalet i steg 1 — "Utan guidad start", en mening om vad som utelämnas, och knappen "Skapa ett tomt spel i editorn".
Knappen är *andra handlingen* i vyn (L13): kantad, aldrig fylld, så att den guidade vägen förblir den första.
Den är stängd utan namn, som den guidade vägen.
Ett utkast som skickas förbi den guidade starten och möter en inloggning återupptas förbi den, inte genom den (G1).

Startsidans "＋ Nytt spel" leder som förut till `/new`; det är där valet mellan de två dörrarna står, en skärm in.
Byggt utan prototyprunda, som ett tillägg i wizardens redan beslutade form (L6, L10); en egen granskning ingår i nästa UX-kontroll.

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

Filtens storlek på små och låga fönster, kvar efter #77 (2026-09-14).
Två frågor som mätningen öppnade. Den andra är stängd av #77:s andra halva; den första står kvar och är ett produktbeslut och inte ett kodval.

Hur ett kort ska läsas på en telefon: ett helt fyraplatsbord ritar kortets kortsida i som mest 23 px vid 390 × 844, mot K9:s 45, och det är sant för varje plats och varje vridning.
Alternativen är en kamera som TV:ns (C5), som slutar rita hela bordet, eller att skriva in i K9 att filten på telefon är en översikt och att det enskilda kortet läses genom INSPEKTION (K8).
Tills det är avgjort finns ingen grind som påstår 45 px vid 390, se K17.

Om K9:s 45 px eller K17:s band ska ge vika vid 1280 × 800: **löst 2026-09-14, bandet gav vika.**
Den första av de tre vägar som stod här — att bandet blir en kolumn vid fönstrets sida i ett liggande fönster — är den som togs, tillsammans med att den egna handens fläkt på filten viks ihop till sin bricka när handen redan är ritad bredvid filten.
Kortets kortsida går därmed från 31 till 46 px vid 1280 × 800, vid varje plats och varje handstorlek, och 45 px är ett golv och inte längre ett tal som gäller från 1920 och uppåt.
Resonemanget och mätningarna står under K17 och K9; de två avrådda vägarna — att kalla fram handen, och att lägga bandet över filten — är avrådda av samma skäl som förut.

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
