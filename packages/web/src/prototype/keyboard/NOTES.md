# PROTOTYP — att spela med tangentbord på alla tre ytorna (#1, #2)

Fråga: ett kort på bordet har en **position**, och en dragning säger "lägg det där".
Ett tangentbord har ingen position.
Hur säger någon *var*, utan pekdon — och samma svar måste hålla i handen, på filten och i distansvyn, annars är det inte ett svar.

Kör: `pnpm --filter @byd/web dev` → `http://localhost:5175/prototype/keyboard?variant=A&route=play`
`variant=A|B|C`, `route=play|table|online`, `&bare` tar bort prototypens egna två lister.
Alt+piltangent byter variant (piltangenterna är upptagna av varianterna själva).

Bordet är på riktigt: `initialState` → `decide` → `apply` → `project`, aktörens fyra anrop (D2), i minnet.
Filten är den riktiga `TableRenderer` (K9) — ingen variant ritar ett kort.
Det varianterna lägger till är roll, namn, tabbstopp och fokusmarkering på de noder renderaren redan ritar, vilket är exakt den form den riktiga ändringen skulle ta.

---

## Vad som faktiskt är omöjligt i dag (mätt, inte läst ur issuetexten)

Mätt i Chromium mot en riktig server, 390 × 844 för telefonen och 1280 × 720 för de andra.
Skärmbilder: `/tmp/byd-shots/kbd-before-{play,table,online}.png`.

**`/table` har noll tabbstopp.**
Inte få — noll.
En sökning efter fokuserbara element i hela vyn ger tom lista.
Det enda Tab landar på är `section.byd-tv-feed`, och bara för att Chrome gör en överfull rullyta fokuserbar; nästa Tab tappar fokus till `body`.
Kort, högtoppar, högetiketter, händer och zoner är alla `div` utan roll och utan namn: i tillgänglighetsträdet är ett kort `generic` vars text är kortnamnet plus "Kortet renderas…".
Radialmenyn öppnas bara av ett pekarhåll på 350 ms, så `flip`, `rotate`, `reveal`, `shuffle`, `split` och `movePile` har ingen tangentväg alls.
`table.css`, `player.css` och `online.css` innehåller inte ordet `focus` en enda gång — det finns alltså ingen fokusmarkering att göra synlig, ens för de knappar som finns.

**`/play` har två.**
"Flagga" och "Avsluta"; "Ångra" är avstängd tills man gjort ett eget drag.
Handens kort är `div.byd-strip-card` utan roll, utan `tabindex` och utan eget namn.
De tre verben — tryck = titta, håll = välj flera, dra upp = spela — har ingen tangentmotsvarighet, vilket betyder att `PlaySheet` aldrig kan öppnas.
Det är den enda vägen till C4:s zongenvägar, så en tangentbordsanvändare kan inte spela ett enda kort.
Zonbrickorna i `TableSummary` (Kasthög, Draghög, Marknad) är `div`, inte knappar.

**`/online` har två**, samma två, och inga landmärken alls: rutten har varken `header`, `main` eller `footer`.
`HandFan` fångar pekaren (`setPointerCapture`) och har ingen tangentväg ur handen.

**Ingen rörelse på bordet når en skärmläsare.**
`App` har sedan #7 två live-regioner, men de bär bara anslutningslägen.
Ett drag — mitt eget eller någon annans — sägs aldrig.
`describeActivity` formulerar redan meningen ("Ada flyttade ett kort till Marknad"); den når bara aldrig en live-region.
Aktivitetslistan "Senast" är en vanlig `<ul>`.

Sammanfattat är detta pekaruteslutande i dag: `move` (fritt och till zon), `stack`, `split`, `movePile`, `flip` (kort och högtopp), `rotate`, `reveal`, `shuffle`, plus lokal inspektion och flerval.
Alltså hela det fysiska vokabulär som över huvud taget används.

---

## De tre modellerna

Vokabulären i `packages/protocol` är sluten och fysisk, så ingen variant hittar på ett verb.
Skillnaden ligger enbart i hur *adressen* uttrycks.

### A — Zonlistan: bordet är en lista med platser

Bordet har ingen geometri för tangentbordet.
Det är ett träd av namngivna platser — min hand, Kasthög, Draghög, de andras händer, Marknad, Spelyta — och korten ligger i dem.
Enter tar upp ett kort, piltangenterna går till en annan plats, Enter lägger ner det.
Mellanslag markerar flera; flera markerade spelas som ett kuvert (K3).
Enter på ett *kort* med något upptaget är `stack` — den enda placering A kan uttrycka exakt.

Samma lista på alla tre ytorna: på telefonen är den hela vyn, på bordet och i distansvyn står den bredvid filten som fortsätter visa vad som händer.

**Verb:** `move` (utan x/y), `flip`, `stack`, `split`, `movePile`, `shuffle`, `rotate`, `reveal`.

**Vad det kostar.**
Två kort som spelas till Spelyta hamnar på exakt samma punkt och täcker varandra.
Det är mätt i prototypen, inte antaget: `move` utan x och y låter kortet behålla sina gamla koordinater, och ett handkort har 0,0 — båda korten landar i filtens övre vänstra hörn.
Ett spel som lägger ut en tablå, en rad eller ett rutnät går inte att spela med tangentbord i A.
A är dessutom inte ren: `movePile` och `split` utan `to` *kräver* x och y i protokollet, så A måste hitta på en koordinat ändå (zonens hörn respektive bredvid källhögen).
Modellen "position finns inte" håller alltså inte hela vägen ner i vokabulären.

### B — Kompassen: lyft kortet och stega det

Fokus står på filten själv, på de riktiga korten.
Enter lyfter kortet, piltangenterna stegar det en kortbredd i taget (Shift: en fjärdedel), Enter släpper, Esc ångrar lyftet.
Varje punkt på bordet går att uttrycka.
Släppet avgörs av pekarens egna regler: prototypen bygger ett `Drag` och anropar den riktiga `dropIntents` — samma funktion, samma resultat, ingen andra tolkning av vad ett släpp betyder.
På ett kvartsvridet bord (C5, distansvyn) vrids pilarna tillbaka, så "upp" betyder bort från den som sitter där och inte uppåt på skärmen.
Verben ligger på bokstäver: v vänd, r vrid, b blanda, a avslöja.

**Verb:** exakt pekarens uppsättning, `move` med x/y inräknad, samt `stack`, `split`, `movePile` med x/y, `flip`, `rotate`, `shuffle`, `reveal`.

**Vad det kostar.**
Tangenttryckningar.
Bordet är 1200 × 800 mm och ett steg är 63 mm: nitton tryck för att korsa filten, och det är den vanliga rörelsen, inte undantaget.
Telefonen har ingen filt, så B måste ge den en: `/play` får C4:s "fäll ut bordet" som huvudyta, med handen som en remsa under.
Vid 390 px blir korten på filten några få millimeter breda och namnen oläsliga — modellen fungerar, bilden gör det knappt.
Och stegandet vill säga något efter varje tryck; det får det inte, se avsnittet om uppläsning nedan.

### C — Adressen: välj kort, välj namngiven plats

Allt på filten är en kontroll med ett namn.
Enter öppnar en panel med två avsnitt: **Gör** (verben) och **Flytta till** (platserna).
Platserna är zonerna vid namn, högarna, de andras händer, "Bordet" — och varje löst kort som "På Drake", vilket är `stack`.
En zon får en riktig koordinat: nästa lediga plats i en rad, uträknad av klienten, så två kort som spelas med tangentbord inte hamnar på varandra.
Panelen tar fokus, svarar på Escape och lämnar tillbaka fokus — `Question.tsx`:s uppförande, tillämpat på en lista i stället för ett svar.
Efter en flytt följer fokus kortet dit det landade, för det är dit blicken går.

På telefonen är C i praktiken dagens `PlaySheet`, befordrad: handens kort blir knappar, Mellanslag markerar flera, Enter öppnar arket.
I distansvyn är det samma panel över filten, plus solfjädern som knappar.

**Verb:** `move` med uträknad x/y, `stack`, `split`, `movePile`, `flip`, `rotate`, `shuffle`, `reveal`.

**Vad det kostar.**
En godtycklig punkt går inte att säga.
Panelen låtsas inte om det: raden "Fri placering — en punkt på filten" står där, avstängd, med "kräver pekdon".
Ett spel där avståndet mellan två kort betyder något — en tidslinje, ett spår, en karta lagd av spelarna — kan en tangentbordsanvändare inte bygga, bara approximera genom att adressera kort efter kort.
Listan växer också med bordet: med tjugo lösa kort blir "Flytta till" tjugosex rader.

---

## Vad som inte varierar

**Dold information.**
Alla namn kommer ur `project`, samma filter som servern filtrerar tråden med (B6, D1).
Ett kort vyn inte får se heter `Dolt kort` och bär ingen identitet; en dold hög är en räkning, och dess topp heter "Dolt kort" om den ligger nedvänd.
Uppmätt i prototypen är hela namnuppsättningen på filten: `Översta kortet i Draghög: Dolt kort`, `Draghög, hela högen, 9 kort`, `Dolt kort, kort i Spelyta`.
Det är ingen egen regel i något variantskikt — det finns ingenting att läcka, eftersom namnet aldrig kommer fram till klienten.
Vändningen av en dold högs topp adresseras med `{ top: hög }` (K15), precis som ringen gör.
Det som ska bevisas i den riktiga implementationen bevisas därför fortfarande på tråden och inte på skärmen (D4).

**Uppläsning.**
En regel för alla tre: det jag gör sägs direkt (polite), det någon annan gör samlas ihop och sägs på en taktslag om 1,4 s — tre drag på en gång blir "3 drag av de andra, senast: Ada delade Draghög" — och ett avvisat drag avbryter (assertive), samma indelning som D5.
Meningarna är `describeActivity`, inte nya formuleringar.
B:s stegande sägs **inte** i live-regionen: att läsa upp "över Marknad" nitton gånger på väg över bordet är precis den översvämning kravet förbjuder.
I stället står det i en synlig rad, och det bärs kortets eget namn i trädet ("Skugga, bärs, över Marknad"), så en läsare kan fråga om det när hon vill.
Det är det svagaste stället i B och den öppna frågan om B vinner.

**Träffytor och kontrast.**
Varje kontroll varianterna lägger till är minst 44 px hög; panelens rader mätta till noll under 44 vid både 390 och 1280.
Alla text/bakgrund-par är minst 4,5:1 och tagna ur produktens egna tokens.
Reducerad rörelse: kamerans glidning sätts till noll och `a11y.css` stillar resten.
Prototypens egna två lister (rutt- och variantväxlaren) är mindre än 44 px — de är ställning, inte yta, och försvinner med `&bare`.

---

## Rekommendation

**C, med B:s stegande som ett tillägg för den som behöver det, och A avrådd.**

A avråds därför att den inte är ärlig mot bordet.
Ett bord utan positioner är inte det bord produkten har beslutat sig för: K2 säger fri placering utan rutnät, C1 säger att tillståndet är position, rotation och z-ordning.
A gör tangentbordsanvändaren till en andra klass med ett annat bord, och den kan ändå inte undvika koordinater i `movePile` och `split`.
Listan är dock inte bortkastad: den är en utmärkt *översikt*, och den är i praktiken C4:s "fäll ut bordet" i läsbar form.

C rekommenderas därför att den ger en tangentbordsanvändare hela vokabulären utom en sak, säger vilken den saken är, och därför att den är minst avvikelse från det som redan finns:
telefonens ark är redan en lista med namngivna zoner, och panelen på filten är radialmenyn med destinationerna tillagda.
Den fungerar likadant i handen, på filten och i distansvyn utan att någon yta får en egen modell — vilket var villkoret.
Den kräver heller ingen protokolländring.

B rekommenderas som ett andra steg och inte som grunden.
Den är den enda som kan säga en godtycklig punkt, och för ett spel som lägger ut en tablå är den skillnaden mellan att kunna spela och att inte kunna det.
Men som enda väg är den för dyr i tryckningar för det vanliga draget, och på en telefon tvingar den fram en filt som inte får plats.
Rätt form är: C är hur man spelar, och "Flytta fritt" i C:s panel är ingången till B:s stegande för den som behöver placera exakt.
Då är den avstängda raden "Fri placering — kräver pekdon" i stället en påslagen rad, och kravet i #2 om att flytta utan pekdon är uppfyllt fullt ut.

---

## Frågor jag inte kan svara på själv

1. **Vad händer med ett kort som saknar koordinat?**
   Om A eller någon form av "lägg i zonen" ska finnas behöver areor en utläggningsregel — en rad, ett rutnät, nästa lediga plats.
   Det är ett produktbeslut som ändrar hur filten ser ut också för pekaranvändare, och det står inte i K2.
   C gissar i dag "nästa lediga plats i en rad"; det är prototypens antagande, inte ett beslut.

2. **`movePile` och `split` utan `to` kräver x och y.**
   Ett tangentbord har inga.
   Antingen hittar klienten på en koordinat (det A och C gör nu), eller så får de två verben en zonrelativ form — vilket är en protokollmigrering och ett dokumenterat beslut — eller så förblir hela högar pekaruteslutande.
   Jag har inte tagit det beslutet.

3. **Vem är tangentbordet på `/table`?**
   Bordsskärmen har ingen plats; den agerar som "Bordet". Fokus är en enda markör på en skärm som ett helt rum tittar på.
   Om två personer vid bordet vill röra olika kort finns bara ett fokus — och till skillnad från två pekare syns det inte att det är en kö.
   Kanske är svaret att tangentbordsvägen på `/table` bara är till för den som sitter vid skärmen, och att alla andra använder sin telefon.

4. **Namnger vi mer än pekaren visar?**
   En lista med "Marknad: Skugga, Gruva, Spion" gör korträkning lättare än att läsa filten på tre meters håll.
   Det är samma information och jag har behandlat det som tillåtet, men det är ett produktbeslut om playtestets naturlighet (C8 resonerar likadant om observatören).

5. **"Titta" loggas inte.**
   Ringens `Titta` sätter bara lokalt tillstånd och skickar ingen `peek`, medan B6 säger att varje titt loggas som händelse.
   Avvikelsen finns redan i pekarvägen; tangentbordet gör den bara synlig, eftersom verbet nu står i en lista med de andra.
   Ska `Titta` bli `peek`, eller är B6:s "titt" bara den som ger ny kunskap?

6. **B på telefonen bryter mot K10.**
   K10 säger att telefonens mitt är den *kollapsade* bordsöversikten.
   B behöver den utfälld som huvudyta för att det ska finnas något att stega över.
   Om B väljs är det en revidering av K10, inte en detalj i implementationen.

## Svar

*(fylls i när en variant har godkänts)*
