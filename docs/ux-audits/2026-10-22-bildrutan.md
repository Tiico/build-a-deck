# Bildrutan — en komponent för varje bild i Tabell (prototyp 2026-10-22)

Prototyp: [`2026-10-22-bildrutan/prototyper/index.html`](2026-10-22-bildrutan/prototyper/index.html), serverad över http (`python3 -m http.server` i mappen), `?variant=nu|a|b|c|d`.

## Frågan

Bilder i Tabell hanteras av tre ytor som var och en bygger upp samma sak för hand i `DataTable.tsx`: kortets bildcell, massredigeringens bildfält och bildremsan över tabellen.
Guiden bygger en fjärde i `NewProjectPage.tsx`, biblioteket och Media var sin bricka.
Alla håller samma delar — `AssetImage`, `dropSurface` + `DropSays`, «Välj», «Ladda upp», ×, behållen text (#1085), bytes på väg (#907), läsläge — i var sin kopia med var sin stilregel.

Frågan är inte om det ska bli en komponent utan vilken form den ska ha: var handlingarna står, hur mycket plats rutan tar i en rad, och vad den säger om bilden.

## Varianterna

| | Form | Tabbstopp/cell | Klick bibliotek / fil / ta bort | Pris |
|---|---|---|---|---|
| Nu | miniatyr + «Byt» + «Ladda upp» + × | 3 | 2 / 2 / 1 | bredaste cellen i tabellen (≈230 px) för en 60 px bild |
| **A** | brickan är en enda knapp som öppnar biblioteket; biblioteket får «Ta bort från kortet» | 1 | 2 / 3 / 2 | ta bort och fil blir två tryck; inget sägs i ord i vila |
| B | miniatyr + en menyknapp («Ur biblioteket», «Ladda upp fil», «Ta bort») | 1 | 3 / 2 / 2 | ett lager till i tabellen, varje handling två tryck |
| C | ett fält kolumnen brett: liten miniatyr, bildens namn, pil, × | 2 | 2 / 3 / 1 | miniatyren är bara en ledtråd; kolumnen blir textkolumnbred |
| D | 96×64-bricka med ikonverktyg på hovring/fokus | 3 | 2 / 2 / 1 | raden blir 72 px; verktyg på hovring är ett mönster editorn undvikit (L39) |

Samma props i varje variant; remsan, bibliotekets och Medias brickor är en annan sak (en bricka som visar) och lämnas utanför.

## Beslut

_Väntar på beställaren._
