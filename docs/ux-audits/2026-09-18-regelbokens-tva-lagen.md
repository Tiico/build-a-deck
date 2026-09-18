# Prototyp: regelbokens två lägen (#227)

Efter beställarens beslut 18 september: «En växel i regelflikens eget huvud.
Två lägen av samma sak, som ögonen på kortväggen — inte två flikar och inte ett nytt fönster.»

Beslutet säger var växeln hör hemma och vad den ska klara.
Vad prototypen ska avgöra är växelns **plats och utseende**, och **hur de två lägena står bredvid varandra**.

[`prototyper/04-regelbokens-tva-lagen.html`](2026-09-18/prototyper/04-regelbokens-tva-lagen.html) laddas ned och öppnas direkt i en webbläsare; GitHub renderar den inte.
Växeln uppe till höger jämför tre varianter.
Boken går att läsa, rulla, skriva i och fråga: tio avsnitt, tretton underrubriker, femtiofem taggade speldetaljer varav två som spelet inte längre har.
Raden överst i amber är prototypens egen och aldrig en del av förslaget — den bär måtten, det som sägs för en skärmläsare, och knappen som låtsas ladda om projektet.

## Det som mäts, och som ändrar bilden

Mätt i Chromium vid 1440 × 900.

| | Redigerbar | Som på bordet |
| --- | --- | --- |
| Radbredd | 584 px | 340 px |
| Bokens höjd | 4 507 px | 4 361 px |
| Avsnittsrubrik | 19 px | 16 px |
| Underrubrik | 15 px | 13 px |
| Bokens titel | 26 px | 20 px |

**Rullningsläget kan inte vara ett tal.**
Boken är 68 tecken bred i editorn och 340 px bred i bordets lucka, så samma avsnitt står på olika höjd i de två lägena.
Uppmätt: avsnittet «Skogens väsen» stod vid `scrollTop` 2 600 i den redigerbara boken och vid 2 387 i luckan — 213 px fel om talet hade burits över.
Längre ned, vid «Vintern kommer», var skillnaden 156 px.
Prototypen bär därför **blocket överst i vyn och hur långt in i det läsaren kommit**, och sätter tillbaka det efter växeln.
Det är det enda som betyder samma sak i båda lägena, och det är också det som går att säga ut: «Som på bordet. Samma avsnitt: Skogens väsen.»

**Uppställningen försvinner vid bordet.**
Editorn ritar uppställningsblocket som spelets egna zoner (B5); bordets `RuleBlockView` har ingen bild för ett `setup`-block alls och ritar bara dess bildtext.
Prototypen ritar samma skillnad, eftersom det är kodens och inte prototypens.
Det är ett fynd i sig: växeln gör synligt att uppställningsbilden inte finns i boken spelarna får, och det har hittills ingen kunnat se.

**Regelknappen ligger under sin egen lucka.**
Vid bordet står `Regler` på `right: 16px; top: 16px` och luckan tar de yttersta 380 px, så den öppna luckan täcker knappen som öppnade den.
Prototypen ritar det som det är.

## Varianterna

### A · uppslaget byter

Växeln står först i huvudet, direkt efter `REGELBOKEN` och före raden som säger vad reglerna är till för.
Två lägen, ett i taget.
Bordets lucka tar bokens plats i läsytan, i sin egen bredd, och spalten står kvar i båda lägena.

Kostar ingenting: ett tryck, inget extra steg, ingen yta som flyttar på sig.
Läsytan är samma låda i båda lägena, vilket är det som gör att rullningen känns som samma bok och inte som två.
Priset är att luckan står och flyter på editorns egen mörka botten, med en skugga som bara finns på ena sidan — den är ritad för en kant den inte står vid här.

### B · bredvid varandra

Samma växel men tre lägen — `Redigerbar · Båda · Som på bordet` — placerad längst ut i huvudet bland flikens andra knappar.
I «Båda» står boken och luckan sida vid sida och rullar tillsammans, så en ändring syns där den hamnar.
Det är den enda varianten där man kan skriva och se resultatet samtidigt, och det är verkligt bra.

Måtten dömer den ändå.
För att båda ska rymmas vid 1440 måste den redigerbara boken ned från 584 till 447 px — 137 px, 23 %, alltså under de 68 tecken som är bokens beslutade läsbredd.
Vid 1280 är paret 1 248 px brett i en låda på 1 248 px, alltså exakt ingen marginal.
I «Båda» är alltså ingen av de två böckerna den riktiga: den vänstra är smalare än editorns och den högra är bordets.
Och editorn är skrivbordsförst (L12), men 1280 är ett skrivbord.

### C · bordet självt

Växeln är kortväggens egen ruta: `Läge: Redigerbar ▾`, med valen i ett band under raden, precis som `CrownBox` och `CrownDrawer`.
Det är den variant som ligger närmast beslutets egen liknelse.
Presentationsläget ritar bordet: filten, luckan vid kanten, knappen där den verkligen står.
Spalten finns inte i det läget, eftersom bordet inte har någon.

Det är det ärligaste svaret på frågan «hur ser boken ut på bordet» — bredden läses som en bredd när det finns en filt bakom den.
Priset är två: rutan kostar ett tryck till för varje växling, och spalten som försvinner bryter #131:s löfte om att tomt och skrivet är *en* yta.
Att kortväggen har fem ögon och regelfliken har två lägen spelar också roll: en ruta som öppnar ett band är rätt för fem val och en omväg för två.

## Vad jag skulle argumentera för

**A, med C:s filt bakom luckan, och spalten kvar.**

A är den enda som inte kostar något: ett tryck, samma låda, samma spalt.
Det är också den som gör beslutets «två lägen av samma sak» till något man känner — samma ruta, samma plats i boken, ett annat utseende.
B faller på sina egna mått: den kan bara rymma båda genom att göra den redigerbara boken smalare än den beslutade läsbredden, och då är det inte längre boken man tittar på.
C:s ruta är rätt form för fem ögon och fel form för två lägen, men C:s *bakgrund* är rätt: en lucka på 340 px mot editorns mörka botten ser ut som en smal panel, och mot en filt ser den ut som det den är.

Det är alltså A:s växel och A:s spalt, med C:s filt som botten i presentationsläget.
Ingen av de tre är det rakt av, och det är sådant en prototyp är till för.

## Vad beslutet redan avgjort, och som prototypen bara visar

- **Ingen andra kodväg.** Prototypen har en enda renderare för bokens ord; det som skiljer lägena är ramen runt orden och aldrig orden.
- **Tangentbordet.** Växeln är vanliga knappar i tabbordningen, den byter läge med Enter, och Escape stänger C:s band och lämnar tillbaka fokus till rutan. Uppmätt i Chromium.
- **Skärmläsaren.** Ett `role="status"` med `aria-live="polite"` säger läget och avsnittet: «Som på bordet. Samma avsnitt: Skogens väsen.» Amber-radens `Sagt för skärmläsaren` speglar samma text så att den syns när man provar.
- **L4.** Läget bor bara i prototypens eget minne. Knappen `Låtsas ladda om projektet` lämnar tillbaka boken i redigerbart läge och säger varför.

## Kvar att avgöra

1. **Vilken variant**, och om rekommendationen ovan — A:s växel med C:s filt — är rätt sammansättning.
2. **Ska webbläsaren minnas läget per projekt?**
   L4 säger att en vy inte är ett faktum om spelet, men L4 låter redan en kolumnbredd minnas i formgivarens egen webbläsare, per projekt.
   Läget kan alltså minnas utan att bryta mot någonting.
   Frågan är om det *ska*: den som lämnade fliken i presentationsläge kommer tillbaka till en bok hon inte kan skriva i.
   Prototypen minns ingenting.
3. **Vilket bord betyder «som på bordet»?**
   Luckan är 380 px vid bordet och på TV:n, och hela skärmen på telefonen (`inset: 0`).
   Prototypen visar bordets.
   Telefonen är den yta flest spelare faktiskt läser boken på, och den enda som inte syns någonstans i verktyget i dag.
4. **Ska spalten stå kvar i presentationsläget?**
   A och B behåller den, C tar bort den eftersom bordet inte har någon.
   Att behålla den är bekvämt och osant; att ta bort den är sant och gör att hela uppslaget rör sig vid varje växling.
5. **Ska frågerutan fungera medan man förhandsgranskar?**
   I prototypen gör den det, eftersom det är bordets kod.
   Men en lista med träffar har inget avsnitt att bära tillbaka över växeln, så rullningen faller tillbaka på det som stod överst innan frågan skrevs.
6. **Uppställningsbilden vid bordet.**
   Att den saknas där är ingenting det här issuet infört, men växeln är det som gör det synligt.
   Är det avsett, eller ska `setup` ritas också i luckan?

Ingenting här importeras av appen.
Tokens är kopierade från `packages/web/src/editor/editor.css`, och luckans mått ord för ord ur `packages/web/src/rules/rules.css`.

## En anteckning från bygget

Växelns knappar bär `data-lage`, och fliken själv bär läget som attribut av samma namn.
En `closest('[data-lage]')` i en klickhanterare på `document` träffade därför fliken vid varje tryck var som helst i boken, och svalde det: inget block gick att öppna.
Det syntes bara när prototypen kördes på riktigt, eftersom båda selektorerna är korrekta var för sig.
