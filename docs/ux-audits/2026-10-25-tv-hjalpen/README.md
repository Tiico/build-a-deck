# Hjälpens «?» på TV:ns väg in (2026-10-25, #1343)

På rummets TV står vägen in i scenens fot (#1290).
Under värden står koden, QR-rutan och hjälpens «?» på en rad (L32, #305).
Vid 1024 och 1280 står scenen på sitt golv på 360 px, så foten har 320 px innehåll.
Raden behöver 361 px: koden 237 (40 px, sex tecken), 18, rutan 52, 18 och ringen 36.
Därför står «?» ensam på en egen rad under koden.
Koden och rutan får inte krympa (K26), och en bredare kolumn kostar filten kort.

Måtten är mätta på det byggda bordet 2026-10-25, och prototypen ritar foten i samma mått (kod 237 × 52, kodens rad 361 av 320 i «Nu»).

## Prototyp

`prototyper/index.html`, en fil med växlare för variant, fönsterbredd (1024, 1280, 1440, 1920), språk och typsnitt (eget eller Verdana/DejaVu).
Raden längst upp läser av det som ritats: kodens rad mot kolumnen, var «?» står och fotens höjd.
«?» öppnar lådan; `Esc` och krysset stänger den.
Kör den över http: `python3 -m http.server 8843` i `prototyper/` och öppna `http://127.0.0.1:8843/`.

- **Nu**: main i dag; vid 1024 och 1280 står «?» ensam under koden, och foten är 338 px hög.
- **A · «?» på radens rubrik** (rekommenderas): «Öppna på telefonen ?» vid alla bredder, L32:s egen form. Kodens rad har 13 px över vid golvet, och foten blir 36 px lägre där. Vid 1440 och 1920 blir foten 8 px högre, och scenens kort betalar det.
- **B · «?» efter värden**: «deckster.se ?» vid alla bredder. Samma höjder som A, men ringen tar 48 px av en rad vars värd kan bli längre.
- **C · tätare kodplatta vid golvet**: spärren 6 → 2 px, luften 14 → 10, mellanrummen 18 → 10, bara där kolumnen står på 360. «?» står kvar efter rutan och foten blir 44 px lägre vid golvet, men plattan är 32 px smalare och raden har bara 7 px över.

## Rekommendation

A.
Den är den form L32 redan har överallt: rubriken och dess frågetecken på en rad.
Den står på samma plats vid varje bredd, och hjälpen handlar om just att gå med, alltså om rubriken.
Kod och ruta är orörda, och raden de står på har marginal kvar.
C håller #305:s ordning men krymper kodens platta och lämnar 7 px, så en längre kod eller ett annat typsnitt bryter raden igen.
B lägger ringen på den rad som har minst marginal, eftersom värden byter namn med lådan.

Skärmdumparna ligger i `bilder/` (`<variant>-<bredd>-<språk>.png`, och `A-1280-sv-oppen.png` med lådan öppen).

Beslut: **A**, beställaren 2026-10-25 (#1343).
