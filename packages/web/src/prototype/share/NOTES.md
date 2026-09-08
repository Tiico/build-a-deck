# PROTOTYP — dela ett spel (D3)

Fråga: var säger designern vem mer som får arbeta på spelet, och i vilken roll?

Kör: `pnpm proto` → http://localhost:5173/prototype/share?variant=A

Alla varianter talar samma roller som servern redan upprätthåller: ägare, medredigerare, testledare, betraktare. En inbjudan mejlas till en adress, lever en vecka och går att använda en gång.

- **A — En panel från editorns huvud.** Delningen hör till arbetet: en panel bredvid korten, där man redan är.
- **B — På spelets kort på startsidan.** Delningen hör till spelet, inte till stunden man redigerar det.
- **C — De som är inne är dörren.** Avatarerna i huvudet öppnar listan: vilka som är inne nu och vilka som får vara med är samma fråga.

## Fynd under bygget

- Närvaro och behörighet vill stå bredvid varandra: "Bo är inne" och "Bo är medredigerare" besvarar samma fråga för den som undrar vem som rör spelet.
- Ägaren går inte att ta bort ur listan, och rollen ägare går inte att bjuda in till. Det gör listan enklare än den ser ut.
- Inbjudan säger ingenting om spelet förrän den använts, så en vilsen länk berättar inget för en främling.
- En testledare behöver bordet men inte leken; det syns i listan bara som ett ord, och det räcker.

## Svar

_(fylls i när en variant valts)_
