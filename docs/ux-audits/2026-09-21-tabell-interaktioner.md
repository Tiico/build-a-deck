# UX-granskning av Tabell-fliken: hovring, fokus och den breda kolumnen, 21 september 2026

Den 16 september granskades editorns interaktioner som helhet ([2026-09-16-interaktioner.md](2026-09-16-interaktioner.md)).
Den här granskningen tar en enda flik — **Tabell** — och ställer tre frågor om den.
Vilka element hoppar fram vid hovring och lägger sig i vägen?
Vilka fokusringar syns bara delvis?
Och vad går sönder när `body`-kolumnen blir stor?

Tio fynd, varav fem är rena buggar med givet rätt svar och fem rör vid fattade beslut.
Det tyngsta är att **utfällningen från L43 öppnas på hovring utan fördröjning och gör grannkolumnens rubrik, den egna dragkanten och den egna fokusringen oåtkomliga**.
Det näst tyngsta är att **varannan Tabb genom tabellen tappar fokus till `<body>`**, därför att ikonknappen i cellen avmonteras i samma ögonblick som den tar emot fokus.

## Omfattning och metod

Den riktiga webbappen mot den riktiga lokala HTTP/WebSocket-tjänsten och Chromium-renderaren, med minneslagring, auth-bypass och syntetiska data.
Inga riktiga konton, mejl eller personuppgifter.

Testleken är `spelkortDoc` — **Sal's Saloon** — uppskalad till **308 kort**, eftersom 77 kort döljer varje täthetsfråga.
Fälten är `id · title · typ · body · raritet · antal` plus gruppkolumnen.

Mätningarna är gjorda med pekar- och tangentbordsautomation i Chromium, inte lästa ur koden.
Varje hovring är ett riktigt `pointermove`, varje Tabb ett riktigt `keydown`, och varje rektangel är läst av sidan mellan stegen med `getBoundingClientRect` och `elementFromPoint`.
Där ett fynd säger att någonting inte går att klicka är det prövat och inte antaget.
Fokusringarna är fotograferade efter riktiga tangentbordssteg, aldrig efter `element.focus()` — det senare ger inte `:focus-visible` i Chromium och hade visat en ring som inte finns.

Bredder: **1440 × 900** som det vanliga skrivbordet, samt **1280** och **1024** som de bindande (L12).
Editorn är skrivbordsförst, så inget fynd gäller telefonbredder — men tillgängligheten är inte mjukad, och fyra av fynden är tangentbordsfynd.

`fitColumns` ger förvalsbredderna **id 196 · title 216 · typ 102 · body 1 684 · raritet 95 · antal 65 · grupp 106**.
Tabellen är alltså **2 552 px i en 1 408 px låda redan i vila**: den breda `body`-kolumnen är inte ett gränsfall man måste framkalla, den är förvalet.

| Yta | Vad som prövades | Fynd |
| --- | --- | --- |
| Kolumnhuvudet, prosamärket | hovring, svep i sidled, Tabb, `Escape`, `elementFromPoint` på grannen | 1, 2, 4 |
| Kolumnhuvudet, dragkanten | drag på varje höjd av kanten, dubbelklick, `Alt`+`Skift`+pil | 2, 8 |
| Cellen, tabbordningen | Tabb och `Skift`+Tabb genom en rad, `document.activeElement` efter varje steg | 5, 7 |
| Body-cellen, öppen | verktygsradens plats, taket, uttoningen, tabbordningen | 7, 9 |
| Kronans filterräls | Tabb genom chipsen, `scrollLeft`, ringens klippning | 6 |
| Tabellen i sidled | skroll, rubrikrad, kapmärken, radens identitet | 3, 10 |

Fyra saker prövades och visade sig vara i sin ordning, och står här för att de inte ska prövas igen.
Ikonens egen lane krockar aldrig med cellens värde — #140 håller.
Pinnens uttoning ritas bara när något verkligen går in under den.
Kolumnordningen är stabil över omladdningar, mätt fyra gånger vid fyra tidpunkter var.
Och konsolen är tyst genom hela genomgången.

## Fynd i prioritetsordning

### 1. Hög · Prosautfällningen öppnas på hovring och täcker grannkolumnens rubrik

Utfällningen från L43 är 294 × 122 px och hänger från rubrikens överkant + 16 px, i linje med kolumnens vänsterkant.
Den öppnas utan fördröjning så snart pekaren går in i rubriken.

Hovra `title`, och tre saker försvinner på en gång: **ordet «title» självt**, **hela `typ`-rubriken** och **två datarader**.
`elementFromPoint` på grannens sorteringsknapp svarar panelens `<b>` — grannen går inte att klicka.

Handtaget är hela rubriken och inte pricken, vilket L43 valde av goda skäl.
Följden är att man inte kan flytta pekaren i sidled genom huvudet: nästa rubrik ligger under panelen, så `pointerleave` uteblir och panelen står kvar över en rubrik man aldrig nådde.
Hovring på `raritet` tar bort raritet, antal **och** grupp samtidigt.

L43 beslutade att utfällningen ska finnas och att den ska nås med både pekare och fokus.
Den sade ingenting om att den får skymma något — tvärtom är hela motivet till variant C att den *kostar ingenting* när den inte behövs.
Att den skymmer är alltså ett genomförandefel och inte beslutet.

[Utfällningen över grannen](2026-09-21-tabell-interaktioner/t1-utfallningen-over-grannen-1440.png)

### 2. Hög · Samma utfällning gör dragkanten oanvändbar

Dragkanten från #46 är 10 × 60 px längst till höger i rubriken.
Utfällningen börjar 16 px ned, så **10 × 16 px av kanten är fri** och resten ligger under panelen.

Ett drag mitt på kanten: 102 px → 102 px.
Ingenting händer, och ingenting säger varför.
Ett drag i den fria 16-px-remsan högst upp: 102 px → 222 px, alldeles riktigt.

Det gäller varje kolumn som är smalare än panelens 294 px — i den här leken alla utom `body`.
En kolumnbredd som bara går att ändra om handen råkar hamna i den översta fjärdedelen av en kant som inte syns är en kolumnbredd som inte går att ändra.

### 3. Medel · Raderna har ingen hovringsmarkering

Radens `background` är oförändrad med pekaren över den, mätt med `getComputedStyle`.
På ett 2 552 px brett bord i en 1 408 px låda finns då ingenting som binder ihop en rad tvärs över rullningen.
Det är just den uppgiften den fastnålade `id`-kolumnen (#145) finns till för, och den löser den bara vid radens början.

### 4. Hög · Fokusringen på ett kolumnhuvud är till 76 % täckt

Tabba till ett kolumnhuvud, så öppnar utfällningen sig på fokus — det är L43:s åtagande och det är rätt.
Men den lägger sig **över den ring som just sade var fokus står**.

Ringen är 54 × 54 px; panelen börjar 8 px in i den och täcker 76 % av dess yta.
Kvar är en 8-px båge över panelens rundade hörn.
Rubrikens ord är dolt i samma drag, så varken ringen eller namnet säger vilken kolumn man står i.
`id`-rubriken, som saknar prosamärke, visar samma ring hel och tydlig — skillnaden är alltså panelen och ingenting annat.

[Hela huvudet](2026-09-21-tabell-interaktioner/t2-fokusringen-under-utfallningen-1440.png) · [närbild](2026-09-21-tabell-interaktioner/t3-fokusringen-narbild-1440.png)

### 5. Hög · Varannan Tabb i tabellen tappar fokus till `<body>`

Ställ markören i en `title`-cell och tryck Tabb.
`document.activeElement` blir `<body>`.
Nästa Tabb börjar om från sidans topp.

Orsaken är mätt och inte gissad.
Knappen **Sätt in en ikon** (`.byd-data-icon`) renderas bara medan cellen är besökt (`here?.cardRef === cardRef`).
Tabb flyttar fokus till den, inputen tappar fokus i samma ögonblick, cellen slutar vara besökt, knappen avmonteras — och fokus har ingenstans att ta vägen.
Cellens HTML före Tabb innehåller `input` + `button.byd-data-icon`; efter Tabb innehåller den bara `input`.

Två fel i ett.
Knappen är **omöjlig att nå med tangentbord**, vilket är motsatsen till vad kommentaren vid den siktar på.
Och tangentbordsvägen genom tabellen är trasig: `title` → `<body>` → `body`-cellen → `raritet` → `<body>` → `antal`.
`Skift`+Tabb bakåt drabbas inte, eftersom fokus då aldrig passerar knappen.
`antal`-cellen, som inte har någon ikonknapp, drabbas inte heller — vilket bekräftar orsaken.

### 6. Medel · Ett fokuserat filterchip rullas aldrig in i synfältet

Kronans filterräls har 1 089 px innehåll i en 1 019 px låda.
Tabba till det sista chipet, «Special»: `scrollLeft` ligger kvar på **0**, chipet står 66 px utanför lådans högerkant, bakom «›»-knappen.
Ungefär 6 px av fokusringen syns som en skära bakom pilen.
Ett `scrollIntoView({ inline: 'nearest' })` på samma element ger `scrollLeft` 66, så rullningen finns — den sker bara aldrig.
Mätt om efter 100, 600 och 1 500 ms: oförändrat.

Därtill klipps **alla** chips fokusringar 1 px upptill och nedtill av rälsens egen `overflow: auto`.
En 3 px ring som ritas som 2 px på två sidor är en ring som är ritad fel överallt i fliken.

[Chipet bakom pilen](2026-09-21-tabell-interaktioner/t5-chipet-bakom-pilen-1440.png)

### 7. Hög · Body-cellens verktyg hamnar utanför skärmen när kolumnen är bred

Öppna en body-cell vid förvalsbredden.
Etiketten «BODY · DUEL-KOPPAR» står på x 584.
Verktygsraden — fet, kursiv, lista, symbol — står på x 2 072.
**1 353 px isär, och verktygen är inte på skärmen alls** i ett 1 440 px fönster.

L39 säger uttryckligen: «Verktygen syns finnas innan man börjar skriva — en rad som tonar fram vid fokus säger ingenting till den som ännu inte klickat.»
Vid den bredd verktyget själv väljer åt kolumnen är det åtagandet brutet, inte av en tonande rad utan av avstånd.

Framåt-Tabb från skrivytan hoppar dessutom över alla fyra verktygen och landar i `raritet`, eftersom huvudet står före skrivytan i DOM.
I en vanlig textcell står verktyget *efter* fältet, i en prosacell *före* det.
Samma hand lär sig alltså två olika ordningar i samma tabell.

[Öppen body-cell](2026-09-21-tabell-interaktioner/t4-oppen-body-cell-1440.png)

### 8. Hög · Det finns ingen pekarväg till att göra en bred kolumn smalare

`fitColumns` ritar `body` som 1 684 px.
Dess egen dragkant hamnar då på x 2 248 — **824 px utanför** scrollboxens högerkant.
Kanten man ska ta i för att kolumnen är för bred är otillgänglig just därför att kolumnen är för bred.

Dörren i huvudet ger tillbaka en satt bredd, men knappen «420 px» dyker upp först när en bredd redan är satt.
Vid förval står det ingenting där, så dörren är ingen väg in.

Kvar är `Alt`+`Skift`+vänsterpil från rubriken, 16 px per tryck.
Från 1 684 px till 420 px är det **79 tangenttryck**, och ingenting i ytan berättar att genvägen finns.

### 9. Medel · Tvåradstaket skivar en tredje textrad

`max-height` är 34,8 px (två rader) och står på **innehållsrutan**, medan `overflow: hidden` klipper på **utfyllnadsrutan**.
Cellens 8 px bottenutfyllnad blir därmed ett fönster in i rad tre: **8,2 px av en 17,4 px rad syns**, tvärs genom bokstäverna.
Uttoningen är 12 px och dämpar men döljer inte — de kapade bokstavsformerna går att läsa.

L39 säger «ett tak på två rader och en uttoning under».
Det som ritas är två rader, en halv rad till, och sedan en uttoning.

[Skivad tredje rad](2026-09-21-tabell-interaktioner/t6-skivad-tredje-rad-1440.png)

### 10. Medel · Rubrikraden är tom när body rullats förbi, och kapet mot lådan saknar märke

Rulla till `scrollLeft` 1 144.
Kvar i huvudet syns «id», och sedan ungefär 1 200 px tomt innan `raritet`.
Body-textens svansar står där utan rubrik, utan vänsterkant och utan något som säger vilken kolumn de tillhör.

#145 gjorde att man ser *vilket kort* raden är.
Den här granskningen visar att man fortfarande inte ser *vilken kolumn* texten står i.

Samtidigt låg **1 232 celler** utanför lådans högerkant utan att vara märkta `data-cut`.
Kapmärket från #46 — ellipsen och masken — gäller bara när värdet är kapat av *sin egen kolumn*.
Det betydligt vanligare fallet, att det är lådan som kapar, har inget märke alls.

Vid 1 024 px är fyra av sju kolumner osynliga, och ingenting på skärmen antyder att de finns.

[Tom rubrikrad](2026-09-21-tabell-interaktioner/t7-tom-rubrikrad-1440.png) · [1024](2026-09-21-tabell-interaktioner/t8-tabellen-1024.png) · [tabellen i vila](2026-09-21-tabell-interaktioner/t0-tabellen-i-vila-1440.png)

## Sammanfattning

| # | Allvar | Fynd | Rör ett beslut? |
| --- | --- | --- | --- |
| 1 | Hög | Utfällningen täcker grannkolumnens rubrik | Nej — genomförande av L43 |
| 2 | Hög | Utfällningen gör dragkanten oanvändbar | Nej — genomförande av L43/#46 |
| 4 | Hög | Fokusringen på kolumnhuvudet är 76 % täckt | Nej — genomförande av L43 |
| 5 | Hög | Varannan Tabb tappar fokus till `<body>` | Nej — ren bugg |
| 6 | Medel | Fokuserat filterchip rullas inte in | Nej — ren bugg |
| 7 | Hög | Body-cellens verktyg utanför skärmen | Ja — L39 |
| 8 | Hög | Ingen pekarväg till att smalna av en kolumn | Ja — #46 |
| 9 | Medel | Tvåradstaket skivar en tredje rad | Ja — L39 |
| 3 | Medel | Ingen hovringsmarkering på raderna | Ja — täthet, L36 |
| 10 | Medel | Tom rubrikrad och omärkt kap mot lådan | Ja — #46, #53, #145 |
