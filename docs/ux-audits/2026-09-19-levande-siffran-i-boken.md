# Prototyp: den levande siffran i boken (#226)

Efter beställarens beslut 18 september: «En taggad speldetalj visar den levande siffran.
«Draghögen» säger vad högen innehåller *just nu* i det pågående spelet.»

Beslutet fixerar beteendet och de två följdkraven — ingen läcka, och en vettig återfallsform utan bord.
Vad prototypen ska avgöra är **formen**: hur siffran står med namnet, hur läsaren ser att den lever, och hur en dold hög läses utan att vare sig läcka eller se trasig ut.

[`prototyper/08-levande-siffran-i-boken.html`](2026-09-19/prototyper/08-levande-siffran-i-boken.html) laddas ned och öppnas direkt i en webbläsare; GitHub renderar den inte.
Växeln uppe till höger jämför fem lägen: `Nu` som referens och fyra förslag.
Båda ytorna står bredvid varandra i sina riktiga mått — den redigerbara boken ur `editor.css` och bordets lucka ur `rules.css` — och ritas av **en och samma renderare**, precis som `RuleSpan` betjänar editorn, bordet och pressen.
Boken har tjugofyra block, tio avsnitt och fyrtiotvå taggar, varav två som spelet inte längre har.
Raden överst i amber är prototypens egen och aldrig en del av förslaget.

Väljaren `Läsaren` byter projektion: plats A, plats B, bordets egen skärm, eller inget bord alls.
Samma text, fyra olika svar.

## Fyndet som ändrar frågan

**En dold hög lämnar ut sin räkning. Det gör den redan i dag, till alla, och det är inte prototypens val utan kodens.**

`packages/engine/src/project.ts` lägger *varje* zon i `zones` för *varje* vy.
Den zon vars ordning platsen inte får se rapporteras som `{ mode: 'count', count }` — en räkning, alltid utlämnad.
K15 säger samma sak från andra hållet: «En dold hög ska fortsätta vara en räkning och inget annat på tråden.»
Inget annat, men en räkning.

Beslutstexten befarar att «Draghögen: 18 kort» när högen är dold vore ett läckage.
Det är det inte.
Det som är hemligt är **ordningen och korten**, aldrig tjockleken — precis som vid ett fysiskt bord, där vem som helst kan titta på draghögen och se ungefär hur många kort som är kvar, och där ingen kan se vilka.
Att dölja siffran hade alltså inte skyddat någonting, och hade gjort boken sämre än filten den står bredvid.

Den råa ramen i mätspalten visar det: för plats A är tre av sju zoner räkningar, och `zon:drag` står där som `{"id":"zon:drag","mode":"count","antal":18}`.
Ingen `order`, inga kort-id:n.
Taggarna i en uppritning av hela boken läste 74 fält, alla ur den listan, och noll utanför den.

**Det som verkligen kan läcka är kortreferensen.**
`[[kort:vargen]]` ligger i en dold hög.
Ett levande lager som sa «Vargen: i Vinterförrådets andra hög» skulle lämna ut exakt det K15 finns för att skydda.
I prototypen finns Vargen inte i `komponenter` för någon plats, så taggen har ingenting att säga och faller tillbaka på namnet.
`[[kort:bjornen]]` ligger däremot uppvänt överst i Slänghögen och namnges i zonvyns `top` (K15), så det kortet *får* ett levande lager.
Skillnaden avgörs av projektionen och av ingenting annat.

## Det som mäts

Mätt i Chromium vid 1440 × 900, med boken i `calc(68ch + 80px)` = **664 px låda, 584 px text** och luckan i `min(380px, 92vw)` = **340 px text**.
Det är samma två mått som #227 mätte, kontrollerade mot den prototypen i samma webbläsare.

### Vad siffran kostar i höjd

Hela boken, plats A, alla fyrtiotvå taggar levande.

| Form | Bok | Δ | Lucka | Δ | List |
| --- | --- | --- | --- | --- | --- |
| Nu | 1 607 | — | 1 787 | — | — |
| A · Efterled | 1 726 | **+119 px, +7,4 %** | 2 048 | **+261 px, +14,6 %** | — |
| B · Bricka | 1 631 | +24 px, +1,5 % | 1 810 | +23 px, +1,3 % | — |
| C · Vid fokus | 1 607 | — | 1 787 | — | — |
| D · Marginal | 1 607 | — | 1 787 | — | +134 px |

Den avgörande raden är A:s andra Δ.
Efterledet kostar dubbelt så mycket i luckan som i boken — 14,6 % mot 7,4 % — eftersom en 340 px spalt bryter rad dubbelt så ofta och varje tillagt ord därför oftare blir en hel ny rad.
**Formen som är dyrast är dyrast just där boken faktiskt läses.**

### Den långa meningen

Meningen i block `b7` har fem taggar i en enda sats.

| Form | Rader i boken | Rader i luckan |
| --- | --- | --- |
| Nu | 4 | 7 |
| A · Efterled | 5 | **8** |
| B · Bricka | 4 | 7 |
| C · Vid fokus | 4 | 7 |
| D · Marginal | 4 | 7 |

A lägger till en rad i båda.
B lägger inte till någon: brickan är 0,72 em och får plats i det slack en Georgia-rad redan har.

### Längsta realistiska högnamnet i luckans 340 px

«Vinterförrådets andra hög» med 128 kort — tjugofem tecken och tre siffror.

| Form | Odelbar löpa | Hela taggen på en rad |
| --- | --- | --- |
| Nu | 95 px | 161 px |
| A · Efterled | **179 px** | **317 px** |
| B · Bricka | 95 px | 193 px |
| C · Vid fokus | 95 px | 161 px |

Ingenting svämmar över: 317 px ryms i 340.
Men A:s tagg äter **93 % av en rad** i luckan, och dess odelbara löpa — «hög: 128 kort», som aldrig får brytas — är 179 px, nästan hälften av spalten.
Ett namn fem tecken längre, eller en telefon smalare än 380 px, och A spricker.
B:s odelbara löpa är oförändrat 95 px, eftersom brickan får ligga kvar på nästa rad tillsammans med namnets sista ord.

### D:s register i luckan

Luckan är 713 px hög vid 900 px fönster.
Frågeraden tar 62 px, registret **134 px — 19 %** — och boken får 517 px kvar.
Registret rymmer fem av bokens åtta levande detaljer.
Det är D:s verkliga problem: **ett register som inte rymmer allt måste välja**, och ingenting i beslutet säger efter vilken regel.

### Kontrast mot papperet

Alla former klarar 4.5:1.

| Bläck | På | Kvot |
| --- | --- | --- |
| Namnets `#7a4d1d` | papperet `#f7f3ea` | 6.52:1 |
| A: siffrans `#6b6255` | papperet | 5.41:1 |
| B: fylld brickas `#3f3a2e` | brickan `#e0d6c0` | 7.84:1 |
| B: ihålig brickas `#7a4d1d` | papperet | 6.52:1 |
| D: registrets tillägg `#6b6255` | listen `#ece5d8` | 4.79:1 |

### C:s tabbstopp

Luckans bok har **38 levande taggar**.
Som fokuserbara blir de 38 nya tabbstopp i en yta som i dag har tre: frågefältet, stängknappen och rullytan.
Träffytorna är 16–20 px höga; `--tap` är 44.
På telefonen, där luckan är hela skärmen, är det 38 mål under halva minsta träffyta.

## Varianterna

### A · Efterled — «Draghögen: 18 kort»

Siffran är en del av meningen, i bokens eget bläck, efter kolon.
Dold ordning sägs med ord: «Draghögen: 18 kort (dold ordning)».

Den enda formen som fungerar helt utan att något läggs till för örat — texten *är* det som sägs — och den enda som kan säga «dold ordning» där den står i stället för i en etikett.
Levande mot återfallande syns direkt: antingen finns efterledet eller inte.

Priset står i tabellerna och det är stort.
Två saker till, som bara syns när man läser:
Rubriken «Om Draghögen: 18 kort (dold ordning)» — och sedan #272 kan en referens stå i en rubrik — läses inte längre som en rubrik utan som en rad data.
Och kursiveringen av «(dold ordning)» krockar med L2:s egen `*kursiv*`, som samma bok använder två stycken längre ned.

### B · Bricka — «Draghögen ⟨18⟩»

Siffran är en bricka efter namnet, aldrig en del av satsen, i tabulära siffror.
**Fylld bricka = boken kan se vad som ligger där. Ihålig bricka = räkningen är allt boken vet.**
Det är den enda formen där en dold ordning syns som en form i stället för att stavas ut.

Brickan rymmer ett tal och därför ingenting om ett kort: `[[kort:bjornen]]` får inget levande lager alls i B.
Det är variantens söm, och den är inte gratis — men den gör också B till den form som **inte kan** läcka en kortposition, för det finns ingen plats att skriva den på.

Örat måste få brickan tillagd: taggen bär `aria-label="Draghögen, 18 kort, ordningen dold"` och brickan är `aria-hidden`.
Utan det hade en skärmläsare sagt «Draghögen18».

### C · Vid fokus

Boken ser ut precis som i dag; siffran är ett svar man ber om, genom hovring eller fokus.
Kostar noll i bredd och noll i höjd, och är den enda formen som kan säga hur mycket som helst i en bubbla.

Men den ger ingenting åt den som bara läser — och beslutets egen motivering är att siffran «blir bättre mitt i ett speltest», alltså i ögonkastet.
Skillnaden mellan en levande och en återfallande tagg är en heldragen mot en prickad understrykning, vilket i praktiken inte syns.
Och 38 tabbstopp i luckan är inte en detalj att lösa senare.

### D · Marginal

Orden rörs inte alls.
Alla levande tal står i ett eget register — en list under boken i editorn, en rad överst i luckan.

Det är den enda formen som är helt sann mot «en enda renderare»: bokens ord är bokstavligen oförändrade, och det levande är ett andra lager bredvid dem.
Men örat får ingenting där ögat får allt: taggen i texten läses «Draghögen», och registret är ett eget område en skärmläsare måste hitta till.
Och registret rymmer fem av åtta i luckan.

## Vad jag skulle argumentera för

**B, brickan — med A:s ord i `aria-label` och C:s bubbla som andra steg för det brickan inte rymmer.**

Måtten avgör mellan A och B, och de avgör tydligt.
A kostar 14,6 % av luckans höjd och en rad i varje lång mening; B kostar 1,3 % och ingen rad alls.
A:s längsta tagg äter 93 % av en rad i luckan och har en odelbar löpa på 179 px som inte får brytas; B:s odelbara löpa är oförändrad.
Det är samma slags dom som fällde #227:s variant B — en form som bara ryms om man ger upp den beslutade läsbredden är inte en form som ryms.

C och D kostar noll, och det är just därför de inte duger: båda gör siffran till något annat än det beslutet ville ha.
C gör den till en fråga, D till en tabell bredvid.
Beslutet säger «en taggad speldetalj **visar** den levande siffran», i ögonkastet, mitt i en mening.

Det brickan tillför utöver att vara billig är **den ihåliga formen**.
Det är prototypens egentliga svar på det som såg ut som det svåra: skillnaden mellan «arton kort, och jag vet vilka» och «arton kort, och det är allt som finns att veta» blir en form och inte en mening.
Den skillnaden är sann i varje läge, den kostar noll tecken, och den går att verifiera på ramen: fylld brickan ⇔ `mode: 'order'`, ihålig ⇔ `mode: 'count'`.

### Hur en dold hög läses, konkret

Tre olika saker som beslutet buntar ihop som «dolt», och tre olika svar:

1. **En dold hög** — `Draghögen ⟨18⟩` med ihålig bricka. Räkningen är offentlig och visas. Ordningen är hemlig och det säger formen. Örat får «Draghögen, 18 kort, ordningen dold». Inget läckage, ingenting som ser trasigt ut.
2. **En annan spelares hand** — `Annas hand ⟨4⟩`, också ihålig. Samma sak, och samma sak som filten redan visar.
3. **Ett kort som ligger i en dold hög** — `Vargen`, blott namnet, utan bricka.

Punkt 3 är den som beslutet oroar sig för, och den har ett svar som gör att den *inte* ser trasig ut:
**återfallsformen och den dolda formen är avsiktligt identiska.**
«Vargen» utan bricka ser exakt likadan ut som «Vargen» i en bok som läses utan bord — vilket är bokens vanligaste vilotillstånd, det läsaren ser varje gång hon skriver i den.
En tagg utan bricka betyder alltid och bara «boken har inget levande att säga om den här», och läsaren behöver aldrig veta om det beror på att inget bord är igång eller på att hon inte får veta.

Det är också det enda svaret som är säkert.
Om en dold detalj hade fått en egen markering — ett lås, ett streck, en tom bricka — hade *frånvaron* av siffra blivit ett budskap, och den som läser boken hade kunnat läsa av vilka kort som ligger dolda från vilka taggar som bär märket.
Att inte kunna skilja «dolt» från «inget bord» är inte en brist i formen. Det är formen.

## Vad beslutet redan avgjort, och som prototypen bara visar

- **Ingen andra kodväg.** En enda `ritaNoder` betjänar båda ytorna och mätlabbet; det som skiljer dem är lådans bredd.
- **Projektionen och inget annat.** `levande()` läser bara ur `projicera(plats)` och räknar varje fält den rör; mätspalten visar den råa ramen bredvid summan.
- **Utan bord faller taggen tillbaka på namnet**, i alla fyra formerna, mätt: bokens höjd är då 1 607 px i varje form, alltså exakt `Nu`.
- **En referens spelet tappat** är oförändrad från i dag: röd, och den säger vad som skrevs (L2).

## Kvar att avgöra

1. **Vilken form** — och om argumentet ovan, att A faller på 14,6 % i just den yta som är trängst, är rätt sätt att väga.
2. **Är beslutets läckagepremiss fel, och ska den rättas i issuet?**
   Räkningen är offentlig i projektionen redan i dag, för varje zon och varje plats.
   Om beslutet menade att en dold högs *räkning* ska döljas är det en ändring i `project.ts` och i K15, inte i boken — och den skulle göra boken sämre än filten bredvid.
   Prototypen utgår från att räkningen visas.
3. **Får en kortreferens ett levande lager alls?**
   B kan inte ge den något, C och A kan.
   «Björnen, överst i Slänghögen» är sant och offentligt, men det är också den enda plats i boken där ett läckage är möjligt, och det är den svåraste raden att skriva ett test för.
   Att säga nej till kortets levande lager är ett steg mindre att bevaka.
4. **Ihålig bricka — räcker formen, eller behövs ett ord?**
   Skillnaden fylld/ihålig är en 1 px ring. Den är sann men tyst, och den lärs in en gång och sedan aldrig igen.
   Alternativet är att ihåliga brickor får en punkt eller ett streck, vilket kostar bredd igen.
5. **Uppdateras siffran medan boken är öppen?**
   Luckan läser i dag boken *en gång* («The rules of a running table never change under the players»).
   En levande siffra gör inte det: den måste följa patchströmmen.
   Det är inget formval men det är en ändring i `RuleDrawer` som formvalet förutsätter, och «levande» betyder inget annat.
6. **Vad gör siffran i den tryckta A5-häftet?**
   Pressen kör samma renderare (B7, `booklet.ts`).
   Ett häfte är per definition utan bord, så återfallsformen gäller — men det är inte sagt någonstans, och en bricka som råkar följa med in i trycket är en bricka som ljuger för alltid.
7. **Frågerutans träffar.**
   `findRules` söker i `rules.text`, som byggs av `plainOf`.
   Ska «18» vara sökbart? I dag är bokens text de skrivna orden; en levande siffra i sökindexet gör indexet till något som ändrar sig under handen.

Ingenting här importeras av appen.
Tokens kommer ur `prototyper/proto.css`, boken ur `packages/web/src/editor/editor.css` och luckan ord för ord ur `packages/web/src/rules/rules.css`.

## En anteckning från bygget

Boken ritades först i en rutnätsspalt skriven som `minmax(0, calc(68ch + 80px))`, alltså samma uttryck som `.byd-rulebook` själv bär.
Den blev 637 px i stället för 664.
Ett `ch` i ett rutnätsspår räknas mot **rutnätets** typsnitt — skalets system-ui 13 — och inte mot bokens Georgia 14, och `max-width: 100%` på boken klämde in den i det för smala spåret.
27 px smalare text hade förskjutit varje radbrytning som mäts här, och felet syntes inte alls förrän #227:s prototyp kördes i samma webbläsare och svarade 664.
Spåret är nu `max-content` och boken bär sitt eget mått.
