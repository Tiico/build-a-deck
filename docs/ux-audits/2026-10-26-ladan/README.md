# Spelets låda, steg 1 (2026-10-26, #1406)

Lådan som komponenttyp (B1, B2) med sex designbara ytor, måtten räknade ur leken, och lådans framsida som spelets omslag digitalt.
Steg 2, med stansform, CMYK och lådan i tryckpaketet, väntar på partnern (F1, F2) och ingår inte.

## Runda 2: hybriden och den stegvisa introduktionen

Beställarens beslut efter runda 1 står i #1406.
- B presenterar och A redigerar.
- Omslaget syns i heron i Mina spel, i båda länkarnas bild och i «Visa upp», men inte på TV:n eller landningssidan.
- Måtten har ett lås per mått, och luften går att ändra.
- Steg 1 har bara tuckbox.
- En låda som inte är ritad är neutral, med spelets namn och lekens färg.

Två styrningar kom medan runda 2 byggdes:
- «Fördela stegen»: den som just har börjat på sin lek bryr sig inte om lådan, men att den går att styra är en säljpunkt och en wow-faktor.
- «C är snyggast på Mina spel-sidan. Den animerade ska bara visas på den egna sidan.»

Därför är heron i Mina spel C:s stilla form: lådan står bakom lekens första kort, utan rotation och utan ljus.
Produktbilden med ljus och glans, som rör sig och går att vrida, finns bara i «Visa upp».
Länkarnas bild är en stillbild, som förut.

Prototypen är `prototyper/runda2.html`.
Den delar lådans ritning med runda 1 genom `lada.js` och `lada.css`, som är utbrutna ur `index.html` med två ändringar: luften går att ändra, och den neutrala lådan bär namn och färg.
`index.html` står kvar som runda 1:s underlag.

### Hybriden: A redigerar, B visar upp

`runda2.html?del=hybrid` (bilder `R2-hybrid-*`).
Fliken «Låda» öppnar på nätet (A) med ytorna, lagren, måtten med ett lås per mått och luften.
«Visa upp» viker ihop nätet till lådan på sin plats.
Varje yta glider in på sin sida, sidopanelerna dras undan, ljuset tänds, leken ställer sig bredvid, och lådan vrider sig lugnt och går att vrida.
Ett klick på en sida, «Redigera nätet» eller Escape viker ut den igen, med den sidan vald.
Det är samma tolv plan hela vägen, så designern ser vilken sida hon redigerar, och vyn byts aldrig.
Samma «Visa upp» nås ur Mina spel.

Produktbilden ritas i full storlek, 3,8 px per mm, och arket är samma ritning förminskad till 0,6.
En CSS 3D-yta som förstoras blir suddig, eftersom den rastreras i sin egen storlek.
Vid `prefers-reduced-motion` byts läget direkt, och lådan står still.

### Introduktionen: tre varianter

`runda2.html?del=resa&v=1|2|3` (bilder `R2-resa-1..3`).
Varje variant visas som en remsa över fem steg: tom lek, några kort, en spelbar lek, efter första speltestet och före tryck.
Mina spel i C:s form är den bärande ytan, och bredvid står editorns kortvägg eller tryckpaketet.

- **1 · Lådan står i heron.** När leken går att spela ställer sig den neutrala lådan bakom första kortet i heron, med raden «Lådan följer leken. Rita den ›», och editorn får fliken «Låda». Den syns för alla som kommer så långt, men den dyker upp utan att designern gjort något.
- **2 · Lådan växer i editorn** (rekommenderas). Från första kortet står en liten neutral låda längst ut i kortväggens fot, med sina mått, och den blir tjockare för varje kort. När leken går att spela blir raden en knapp, «Låda ›», och fliken kommer. Heron visar lådan först när designern har öppnat den.
- **3 · En stund efter första speltestet.** Ingenting om lådan förrän första bordet är avslutat. Då står en stund i herons ställe, en gång, med den stilla lådan, «Så här kan Skogens råd se ut i en låda», «Rita lådan», «Visa upp ›» och «Inte nu». Det är ingen ruta över sidan och ingen rörelse.

I alla tre visar tryckpaketet lådan som del 3, neutral om den inte är ritad, med «Rita lådan ›».

### Rekommendation: hybriden som den är, och introduktion 2

Introduktion 2 är den enda som aldrig står i vägen och ändå alltid säger sanningen.
Lådan är där från första kortet men tar en rad i en fot designern redan läser.
Wow-faktorn är själva växandet, för lådan blir tjockare för varje kort hon skriver, och det är just det som skiljer Deckster från ett ritprogram.
Designern väljer själv när lådan ska bli något mer, och först då flyttar den in i heron.

Variant 1 byter herons bild en dag utan att designern gjort något.
Variant 3 ger starkast intryck men når bara den som speltestar, och en engångsstund behöver ett tillstånd som minns att den visats.
Stunden kan läggas ovanpå 2 senare, om beställaren vill ha den (beslut R2-3).

### Beslut i runda 2

1. **Introduktionen:** 1, 2 eller 3. Rekommendationen är 2.
2. **När är en lek spelbar?** Prototypen låter fliken komma när ett bord går att starta. Ett antal kort vore enklare men säger mindre.
3. **Stunden efter första speltestet:** ska den läggas ovanpå 2?
4. **Länkens bild före ritad låda:** ska rumskodens och inbjudans bild visa den neutrala lådan från första kortet, eller följa heron?
5. **Hybridens övergång:** godkänns vikningen mellan nät och låda, ungefär 0,9 s, som den enda rörelsen utanför «Visa upp»?

## Runda 1: riktningen från beställaren

Den kom medan prototypen byggdes, 2026-10-26, och den styr rekommendationen:

- «Vi vill spela på att en användare kommer vilja ha spelet som fysisk kopia. Ett stort fokus måste ligga på snygg rendering av paketet och leken.»
- Preciserat samma dag: «Det ska inte kännas som en case opening.»

Lådan visas alltså i 3D med ljus, glans och kartongkänsla, och den går att vrida.
Det är en lugn produktbild av ett föremål, och leken står bredvid som ett föremål i samma stil.
Prototypen har ingen avtäckning, ingen animation i spelstil, inga kort som glimmar och ingenting som påminner om slump eller belöning.

## Prototypen

`prototyper/index.html`, en fil med växlare för variant, yta, lekens storlek, om lådan är ritad och språk.
Kör den över http: `python3 -m http.server 8794` i `prototyper/`, och öppna `http://127.0.0.1:8794/index.html?v=B&yta=visaupp`.
Ytorna är Editorn, Måtten, Visa upp, Mina spel, Delad länk, TV före start och Landningssidan.
«Leken: 120 kort» lägger till tolv kort.
Lås djupet först och lägg till dem sedan, så syns varningen.

Allt bygger på riktiga mått: 108 kort på 63 × 88 mm och 0,3 mm (kortets typ i `recipe.ts`).
Lådan är en tuckbox med 1 mm luft runt kortet och 2 mm i djupet, avrundat uppåt till en halv millimeter.
Med 108 kort blir den 65 × 90 × 34,5 mm, och med 120 kort 65 × 90 × 38 mm.
Nätet är 211 × 199 mm och ryms med utfall på ett A4 liggande vid 108 kort, men inte vid 120.

Varje yta ritas av en och samma funktion i millimeter, i nätet, i 3D, i heron och i länkens bild, som E2 kräver.
Lådans text är designerns och står kvar på svenska när verktyget byter språk.

### Varianterna

- **A · Nätet, lådan som papper.** En ny flik, «Låda», visar hela nätet på ett A4 med flikar, vik- och snittlinjer, och man ritar en yta i taget med kortets lager och egenskaper. Måtten är tre rader med ett lås var och formeln under. Omslaget står överallt: heron, raderna, båda länkarna, en titelskärm på TV:n och en låda på landningssidans bord.
- **B · Produktbilden, lådan och leken i ljus** (rekommenderas). Fliken «Låda» visar lådan och leken bredvid som föremål, med lack, slitna vikkanter, kortens randiga kant och skugga, i lekens egna mått. Man drar för att vrida och klickar på en sida för att rita den platt i panelen. Måtten står på lådans kanter med ett lås var, och «Genomskinlig» visar leken i lådan, röd när den inte ryms. Omslaget är produktbilden i heron, i båda länkarnas bild som stillbild, i TV:ns inspektionspanel före start och i en egen vy, «Visa upp».
- **C · En yta i taget i Mall.** Ingen ny flik: lådan är en komponent i Malls väljare bredvid Kort, och de sex ytorna är sidoknappar, som kortets Framsida och Baksida (L7). Grannytorna skymtar runt duken, och ett litet nät eller en liten låda i hörnet väljer yta. Måtten är ett val, «Följer leken» eller «Fast mått», som kortets format. Omslaget står där det inte kostar något: lådan bakom första kortet i heron, i TV:ns inspektionspanel och i rumskodens länk.

### Rekommendation: B

Riktningen gör föremålet till målet, och bara B behandlar lådan som något designern ska få hem och vill visa upp.
B följer leken synligt: det designern lägger till i Tabell syns som en tjockare lek och en djupare låda, och en låst låda som inte rymmer leken syns i rött i stället för som en siffra.
Ytorna B visar omslaget på är de som redan har plats för det.
Heron har en bildyta sedan #1204.
TV:ns inspektionspanel står tom före start (K8), så omslaget där kostar filten ingen höjd.
Länkarna har en bild sedan #1084.
B rör inte landningssidan, eftersom tryck inte finns i betan (L36) och lådan skulle lova något som inte går att beställa än.

När B byggs bör den ta två saker från de andra varianterna, som prototypen ännu inte visar i B.
Formeln och varningens ord kommer från A, så att Fysisk kontroll säger hur många kort som inte ryms.
Nätet i hörnet kommer från C, som en andra vy i fliken, eftersom bara nätet visar hur en yta står på arket, med locket upp och ner.

Priset är att en yta ritas i en sidopanel som är trängre än Mall.
Om det väger tyngst är alternativet B:s produktbild som flikens vy, med ritandet i Mall som i C (beslut 2 nedan).

### Tekniken: CSS 3D, inte WebGL

Produktbilden är CSS 3D-transformer: sex plan för lådan, fem för leken och ett golv, alltså tolv lager som webbläsaren sammansätter på grafikkortet.
Ljuset är bakat i två lager per plan.
Det ena skuggar planet efter dess normal mot ljuset, och det andra är en glansrand där lacken speglar ljuset.
Skriptet räknar om lagrens opacitet när lådan vrids, vilket är tolv multiplikationer per bildruta.
Lådan vrider sig ±22° kring sin vinkel, långsamt, och står still vid `prefers-reduced-motion`.
Skuggan är en statisk gradient, och ingen `filter` animeras.

Ytorna är texturer från den enda renderaren (E2), samma `/faces`-bilder i 150 dpi som bordet redan använder (K9).
Presentationen sätter dem på planen och ritar aldrig ett kort eller en yta själv.
I prototypen står en SVG i texturens ställe.

Det bär på en telefon och på en TV:s webbläsare, eftersom inget annat än transformer och opacitet ändras.
Byggd på riktigt pausar slingan när bilden inte syns (IntersectionObserver) och när fliken är dold.

WebGL med three.js skulle ge riktigt ljus, reflektioner från en miljö och rundade kanter i geometrin.
Det kostar ett bibliotek på runt 150 kB komprimerat, som får laddas lättjefullt, och WebGL är ojämnt på TV-webbläsarna (Tizen, webOS).
Det är ett senare steg om CSS-bilden inte räcker.
Förslaget är att inte börja där.

Länkens bild måste vara en stillbild, eftersom en förhandsvisare bara hämtar en PNG.
Renderarens Chromium fotograferar samma scen i 1200 × 630 per version.
Det är ett nytt jobb för renderaren, men ingen andra ritväg.

## Beslut beställaren behöver fatta

1. **Variant**: A, B eller C. Rekommendationen är B.
2. **Var en yta ritas**: i B:s sidopanel bredvid produktbilden, eller i Mall som i C, med produktbilden som flikens vy.
3. **Hur måtten låses**: ett lås per mått (A, B) eller ett val för hela lådan (C).
4. **Luften**: 1 mm runt kortet och 2 mm i djupet är prototypens antagande. Ska designern kunna ändra den, till exempel för kortfickor?
5. **Var omslaget syns**: heron, rumskodens länk, inbjudans länk, TV:ns inspektionspanel och «Visa upp». Landningssidan rörs inte (L36).
6. **Ett spel utan ritad låda**: en blank kartong med spelets namn bredvid leken (B), ett omslag av namnet och första kortet (A), eller som i dag (C).
7. **Länkens bild hämtas utan inloggning**: den som har länken ser omslaget innan hon loggat in. Är det rätt också för inbjudan att redigera?
8. **TV:n**: ska produktbilden vrida sig långsamt i ett rum där ingen håller i skärmen, eller stå still?
9. **Lådans text vid skapandet**: «Ett kortspel för 2–4 spelare» och antalet kort fylls i ur spelet, på designerns språk, och blir hennes text (A4).
10. **Bara tuckbox i steg 1?** Prototypen har en lådtyp. En låda med lock och botten (telescope) skulle vara en egen typ i registret.

Skärmdumparna ligger i `bilder/`, namngivna `<variant>-<yta>`.
`-120-last` har djupet låst och tolv kort till, och `-tom` visar ett spel utan ritad låda.

Beslut: _väntar på beställaren_.
