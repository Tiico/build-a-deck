# TV-vyn från grunden (2026-10-25)

Beställaren 2026-10-25: «Hela TV-vyn fokuserar på fel saker, t.ex. händelseloggen tar för lång tid och den förstorade visningen är för liten.»

Prototypen är `prototyper/index.html`, ritad i 1920 × 1080 CSS-px och skalad till fönstret.
Servera den över http (`python3 -m http.server --directory prototyper`) och bläddra med ← →; `?variant=0|A|B|C`, mellanslag spelar nästa kort, N döljer anteckningar och mått.
Allt är ritat för hand: filten följer dagens geometri med fyra platser, och korten har 8,5 pt brödtext i kortets egen skala (K26), så måttet i hörnet är den brödtext rummet får.

| | Förstorat kort | Brödtext | Logg | Kort på filten |
| --- | --- | --- | --- | --- |
| 0 — I dag | 190 px i spalten | 9 px | tre meningar | 76 px |
| A — Scenen | 570 px, alltid uppe | 27 px | en rad under kortet | 57 px |
| B — Strålkastaren | 650 px över filten i 8 s per spelat kort | 31 px | ingen; platslistan visar vem | 80 px |
| C — Kortloggen | 500 px + fyra miniatyrer | 24 px | kort i stället för meningar | 61 px |

Alla tre tar bort «Starta om», snabbkommandon och ?-hjälpen från TV:n.

Beslutet är inte fattat.
