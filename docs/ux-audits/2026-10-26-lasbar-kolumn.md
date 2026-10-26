# Vilken kolumn står still i Tabell — prototyp 2026-10-26

Beställarens fynd: id och antal tar för mycket plats till vänster i tabellen.
Ingen av dem är särskilt intressant att se hela tiden; det är fritexten man utgår från.
Förslag att prototypa: låt användaren låsa vilken kolumn hon vill.

Prototypen ligger i [`prototyper/`](2026-10-26-lasbar-kolumn/prototyper/index.html).
Öppna den över http: `python3 -m http.server 8826 --bind 127.0.0.1` i katalogen, sedan `http://127.0.0.1:8826/index.html?v=A&w=1280`.
`?v=nu|A|B|C`, `?w=1024|1280|1440|0`, `?lek=prov|tat`, `?font=mac|bred`.
Tabellen ritas med editorns egna värden ur `editor.css` (inte importerade), provleken Sal's Saloon med 77 rader, och samma lek skalad till 308 rader och elva kolumner.
Skärmbilderna i `prototyper/bilder/` tas av `prototyper/matning/shoot.mjs`.

## Utgångsläget

Listen (L55) är tre kolumner: bocken, id och antal (#145, #609, #695).
id är lekens längsta nyckel plus 20 px, så listen är 302 px i provleken och 315 i den täta, vid varje fönsterbredd.
Det som står still när man skriver långt ut i body är alltså `sals-saloon-guld · 2`, och titeln har rullat bort.

## Fyra lägen

| | Listen | Vem bestämmer | id | antal | Nytt grepp |
|---|---|---|---|---|---|
| **Nu** | bock, id, antal · 302 px | verktyget | på listen | på listen | — |
| **A · Låset** | bock + det designern låst · 237 px med titeln | designern, per kolumn | rullar, först i raden | rullar, efter id | hänglås i dörren och på rubriken |
| **B · Namnkolumnen** | bock + kortets namn · 244 px | verktyget (namnet väljs i dörren) | under namnet i cellen, ingen kolumn | under namnet; skrivs i en kolumn sist | en prick i dörren |
| **C · Kanten** | bock + allt till vänster om kanten · 237 px med titeln | designern, genom ordning och kant | bärbar kolumn | bärbar kolumn | handtag i huvudet; ← → flyttar det |

Mått vid 1280 (rummet 1248 px), provleken, rullning 0:

| | Listen | body i bild | body:s bredd (L46) | Tab bock → antal |
|---|---|---|---|---|
| Nu | 302 | 520 | 902 | 1 |
| A | 237 | 520 | 967 | 2 |
| B | 244 | 771 | 960 | 5 (11 i den täta) |
| C | 237 | 520 | 967 | 2 |
| C med id och antal indragna | 495 | 600 | 709 | 2 |

Vid 1024 (rummet 992): Nu 264 px body i bild, A och C 264, B 515.
Rullad så att body fyller rummet: Nu 895 px, A 960.

## Vad prototypen visade

- **Titeln ensam är inget namn.** Provleken har fyra kort som heter «Duel» och tre «Stolen Goods»; på listen i A och C säger raden bara «Duel». B:s underrad (`duel-koppar · 4 st`) är det som skiljer dem åt. Det var skälet till att id nålades fast från början (#145).
- **Listen krymper 65 px, inte 300.** Det som går att vinna är skillnaden mellan id-kolumnen och titelkolumnen, eftersom titeln är nästan lika bred som nyckeln. Vinsten är vad som står still, inte hur mycket plats det tar.
- **B vinner mest rum för body** (771 mot 520 px i bild) därför att id inte är någon kolumn och antal står sist; priset är att antal läses på ett ställe och skrivs på ett annat, och att id inte går att sortera på.
- **A och C är samma svar med olika grepp.** A är ett tillstånd per kolumn, två platser att hitta det på; C gör listen till en plats i ordningen och ger id och antal den bärbarhet L4 i dag nekar dem.

## Rekommendation

A, med B:s underrad i den låsta titelkolumnen som en möjlig förening: id i listens bläck under titeln skulle ge namnet tillbaka utan en kolumn.
Beslutet är beställarens; se frågorna i sessionen.

## Beslut

*(väntar)*
