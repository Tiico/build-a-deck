# #270 — uppställningen i spelarnas regelbok

Beställaren har valt att samma uppställning ska finnas i editorns och spelarnas bok.
Den återstående designfrågan är hur den ryms, särskilt på telefonen.

Tre interaktiva alternativ ligger i den riktiga RuleShelf på `/play`, `/online` och `/table`,
DEV-gatade och med syntetiska bok-/zondata. Start: `pnpm prototype:setup`.
[Instruktioner och avgränsning](../../packages/web/src/rules/prototype/NOTES.md).

## Första iterationens mätningar i Chromium

Bildens höjd, exklusive bildtext och vertikala marginaler:

| Yta | A, 6 zoner | A, 45 zoner | B, 45 zoner | C, infälld |
| --- | ---: | ---: | ---: | ---: |
| Telefon 390 × 844, läsbredd 350 | 106 px | 786 px | 172 px | 44 px |
| Lucka 1280 × 800, läsbredd 340 | 106 px | 786 px | 172 px | 44 px |
| TV 1280 × 720, läsbredd 340 | 106 px | 786 px | 172 px | 44 px |

Vid 320 × 740 tar C utfälld 1190 px inklusive öppningsknappen. Ingen horisontell
sidrullning uppmättes på telefonen. B:s miniatyr skalar hela innehållet till 128 px,
knappen tar 44 px. Den lilla texten är inte tänkt att läsas förrän bilden öppnas.
Prototypverktygen tar 146/120 px från läsytans höjd; tabellen mäter själva bilden.

## Flöde och avvägning

- A har ingen extra handling och fungerar bra för det lilla exemplet. 45 zoner skjuter
  nästa regel mer än en läsyta nedåt både i luckan och på telefonen.
- B behåller en bild i boken och gör alla namn läsbara i en separat vy. Testat öppna,
  stänga med Escape och återgå med fokus på samma knapp och oförändrad rullposition.
  Alla 45 zoner finns i läsvyn, inklusive sista zonen för plats H, utan sidöverflöde.
- C är billigast stängd men visar då ingen bild. När den öppnas får läsaren samma
  långa rullning som A, plus ett extra steg. Svagast mot beslutet att boken ska visa bilden.

Rekommendation för designvalet: A för små uppställningar, B när zonbilden blir hög.
Ett sådant adaptivt val är ännu inte implementerat eller beslutat. Jämför A/B med samma
bok och 6 respektive 45 zoner innan gränsen eller en universell form bestäms.

## Produktionsgräns

Inga produktionsbeteenden, API:er eller speldata ändras. Nuvarande regelbokssvar har
bara uppställningens bildtext; implementationen behöver föra zonmetadata från den låsta
versionen till en delad renderare. Engångsbilden får inte flyttas in som en separat väg.

Produktionsbygget kontrollerat: inga `setup-proto`, `setupPrototype` eller varianttexter
återfinns i byggda assets. Manuell provning är beviset för prototypens interaktioner;
produktens tester ersätter inte den.

## Kvalitetsgrind

`pnpm typecheck`, `pnpm lint`, `pnpm test` och webbbygget är godkända.
Webben: 2 620 tester. E2E: 107 godkända mot riktig lokal stack. 16 separata
Postgresberoende tester hoppades över i denna körning utan DATABASE_URL;
de körs med Postgres i PR-grinden. Inga tester lades till för engångsprototypen.


## Iteration 2 — beställaren väljer C, men uppställningen är stökig

C:s utfällbara flöde är valt. Den nya iterationen tar bort A/B och ändrar innehållet:

- Gemensamma zoner får en egen rubrik och en enkel lista.
- Spelarplatser visas en i taget, med en märkt väljare för A–H. Inga zoner tas bort.
- Namnen bevaras exakt. Ägarskapet kommer från explicit fixturemetadata.
- Platsvalet finns kvar när uppställningen fälls ihop och öppnas igen.

Vid 320 px blir den utfällda uppställningen med 45 zoner **539 px**, tidigare **1190 px**.
Samma innehåll är 539 px i luckan med 340 px läsbredd. Sex zoner blir 365 px på telefonen;
den extra strukturen kostar alltså höjd i det lilla fallet. Ingen sidrullning uppmättes.
Manuellt verifierat: välj plats H, fäll ihop/öppna med samma plats kvar, byt till två
platser med giltigt val A, och läs långa namn på 320 px. Själva liststrukturen är ännu
inte ett produktionsbeslut; det användaren valt är C:s utfällning.
