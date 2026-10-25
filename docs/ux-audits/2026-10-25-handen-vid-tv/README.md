# Handen på en dator vid ett TV-bord (2026-10-25)

Sedan L85 (#1286) ger anslutningssidans enda «Gå med» vid ett bord startat «Runt en skärm» handen ensam, också i en dator, på `/play`.
Bordet står på TV:n (C2, reviderat 2026-09-16: telefonen är spelarens kontroll, aldrig bordet).

## Idag

`/play` är telefonens yta (C4, #1147): en kolumn på 580 px mitt på skärmen, flikarna Handen · Framför mig · Bordet · Mer längst ner, och handen som ett rutnät av kort 100 px breda.
På en dator på 1280 × 800 står två tredjedelar av skärmen tomma, och det man har framför sig ligger bakom en flik fast det finns plats för allt.
Musen gör inget av det K11 bestämde för datorns hand i `/online` (#1291): vila läser, klick vänder, dra spelar.

## Prototyp

`prototyper/index.html`, ett fönster på 1280 × 800 (ritas mindre i ett smalare).
`?v=0|A|B|C`, och ← → byter.
Servera katalogen över http, till exempel `python3 -m http.server 8781` i `prototyper/`.

- **A · Handen längs nederkanten** (rekommenderas): det vägen-in-prototypen visade i steg 4, utbyggt.
  Handen ligger i full storlek (150 px) längs nederkanten, och ovanför den står ytorna korten kan spelas till som stora mål: draghögen, Framför mig med det som ligger där, kasthögen, de andras ytor och bordet.
  Musen gör det den gör i `/online`s hand: vila läser, klick vänder, dra till en yta spelar. Ett klick på draghögen drar.
  Räknarna och Mer-flikens innehåll står i huvudet.
  Priset: en tredje form av handen (telefonens rutnät, `/online`, och den här), fast den delar gesterna med `/online`.
- **B · Flikarna i en spalt**: telefonens yta, bredare. Flikarna till vänster, rutnätet med kort 150 px breda, klick markerar och raden under spelar.
  Priset: Framför mig och Bordet ligger fortfarande bakom flikar, och klick betyder «markera» här men «vänd» i `/online` på samma dator.
- **C · Allt på en gång**: flikarnas fyra paneler sida vid sida, handen i mitten med telefonens verb.
  Priset: handen får bara mitten (kort 130 px), samma dubbla betydelse av klick som B, och en Bordet-spalt som upprepar TV:n.

Bilder i `prototyper/bilder/`.

Beslut: _väntar på beställaren_.
