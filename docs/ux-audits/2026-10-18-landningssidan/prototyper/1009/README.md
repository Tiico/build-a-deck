# Landningssidan (#1009) — prototyp

Kör: `python3 -m http.server 8471 --bind 127.0.0.1` i den här mappen och öppna `http://127.0.0.1:8471/?v=A`.
Pilarna längst ned (eller ← →) byter variant.

- **A — Bordet.** Klassisk hjältesektion: rubrik och två dörrar till vänster, ett dukat bord med telefoner till höger, sedan fyra steg och en avslutande uppmaning.
- **B — Från rad till kort.** Berättelse som rullas: en klistrad scen där tabellraderna blir kort, korten blir en lek på filten, delas ut till händerna och får en version två efter en flagga.
- **C — Solfjädern.** En skärm, ingen rullning: fem kort i en solfjäder, ett per steg; den som väljer ett kort får steget förklarat. Byggarens och spelarens dörr sida vid sida.

Kortleken «Skogens herrar» är påhittad och ritad i CSS; i produkten ritar `CardPreview` korten.
Beslutet skrivs i #1009 och i DESIGN-BESLUT.md.
