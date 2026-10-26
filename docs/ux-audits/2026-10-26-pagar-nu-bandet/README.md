# «Pågår nu»-bandet inför release (2026-10-26)

Beställaren: «Banderollen för öppna bord ser lite placeholder-aktig ut, nu när vi börjar närma oss release tycker jag vi kan polera den.»

Bandet är L64:s (#724): ett per bord som pågår, på Mina spel, med spelets namn, rumskoden i monotyp och «Öppna bordet»; sedan #1217 också «Öppna spelet», och sedan #1376 ett band av samma form under «Startade, aldrig spelade».
Mätt i main `0744f9d0`: en platt grön ruta (`#1b2a22`), namnet 15 px, koden 22 px monotyp med 4 px spärr, två knappar om 44 px som delar bredden.

Vad som gör den placeholder-aktig: koden hänger fri utan den platta TV:n och anslutningssidan skriver den på; ingen bild och inga fakta om bordet, fast listan redan bär version, senaste drag och hur man sitter (L77); och två lika stora knappar gör att ingen väg är den som står redo (L13).

## Prototyp

`prototyper/index.html`, en fil med växlare för variant (Idag, A, B, C) och bredd (1280, 1024, 390).
Kör den över http: `python3 -m http.server 5412 --bind 127.0.0.1` i `prototyper/` och öppna `http://127.0.0.1:5412/?v=A&w=1280`.
Bilderna i `bilder/idag-*.png` är den byggda appen, inloggad med två spel och tre bord; variantens kolumn ritas som DOM ovanpå, och på telefonen står den mellan sidans huvud och resten av sidan.
Skärmdumpar av varje variant vid varje bredd ligger i `bilder/<variant>-<bredd>.png`.

Fakta bandet säger i varianterna finns redan i `GET /projects/:id/sessions`: `version`, `lastAt` och `seating`.
«Startat för 20 min sedan» för ett orört bord kräver att listan också säger när bordet startades, vilket minnesaffären redan vet (`createdAt`) men inte lämnar ut.

### Varianterna

- **A · Fönstret mot filten** (rekommenderas).
  Kortet öppnar med en bild av bordets form: filten, de två högarna och platserna, i samma bildspråk som hjältekortet och Bord-flikens miniatyr.
  Kodplattan ligger i bildens hörn, i den form TV:n skriver koden (`byd-tv-join strong`), och ett läge («Pågår» med grön prick, «Aldrig spelat» i grått) i det andra.
  Spelets namn med en pil är vägen till editorn, under det bordets fakta på en rad, och **en** väg står redo: «Öppna bordet», fylld.
  Ett orört bord har samma kort med filten dämpad.
  Kostar ≈ 200 px per bord.
  Bilden är bordets form ur receptet, inte dess live-läge; Bord-flikens miniatyr kopplar upp sig mot bordet, och det är inte värt det på startsidan.
- **B · Grupperat per spel.**
  Ett kort per spel, i «Väntar på dig»:s form: spelets namn och «Öppna spelet» på en rubrikrad, och varje bord en rad som i sig är vägen till bordet, med läge, fakta, kodplatta och pil.
  Tätast, ≈ 60 px per bord, och två bord på ett spel säger spelets namn en gång.
  Ingen bild, och ett spel med ett bord kostar ändå en rubrikrad.
  Efter beställarens val: raden leder med hur man sitter (L77) som en ikon på egen grund, i «Väntar på dig»:s form — en skärm på fot för «Runt en skärm», två fönster för «Var och en vid sin dator» — ritade på glyfernas 16-rutnät med den enda 1,6 px-linjen; orden står bara för skärmläsaren.
  Pricken för läget flyttar in i den feta raden.
- **C · Beskedet.**
  Bandet säger det som en mening, i kvittonas gröna: läget överst i versaler, koden stor och mitt i, «*Sal's Saloon* på rev-1, runt en skärm.», «Öppna bordet» över hela bredden och «Öppna spelet» som en tyst länk.
  Koden blir det man ser från andra sidan rummet.
  Centrerat och ≈ 190 px per bord; ett orört bord blir en grå ruta med en stor kod.

## Rekommendation

A.
Den ger bandet det som saknas, en bild och fakta, med former sidan redan har: hjältekortets bild, TV:ns kodplatta, L13:s enda fyllda väg.
B är det bättre valet om kolumnen ska rymma många bord, men den säger minst om varje och ser mest ut som en lista.
C är vacker för ett bord och tröttsam för tre.

Beslut: **B, med en ikon för hur man sitter**, beställaren 2026-10-26.
Ikonerna är nya glyfer i `glyphs.tsx` (`screen`, `computer`); listan `GET /projects/:id/sessions` bär redan `seating`.
