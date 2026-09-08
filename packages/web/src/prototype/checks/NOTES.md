# PROTOTYP — fysisk validering i editorn (E5)

Fråga: hur möter designern ett fel som bara syns i handen?

Kör: `pnpm proto` → http://localhost:5173/prototype/checks?variant=A

Alla varianter läser samma anmärkningar ur den riktiga kontrollen och ritar samma lek med den riktiga kompilatorn. Leken har äkta fel: en smaktext på 5,5 punkter i ljusgrått, och två typmärken som bara skiljs åt av rött och grönt.

- **A — Markerat på kortet.** Elementet ramas in på kortet och anteckningen står bredvid, som en stavningskontroll. Ett kort i taget, med antalet anmärkningar på varje miniatyr.
- **B — En rapport över hela leken.** Anmärkningarna samlade per slag med hur många kort de gäller, eftersom ett fel i mallen är ett fel på fyrtio kort. Varje rad öppnar korten den gäller.
- **C — Se med läsarens ögon.** Ingen lista: leken visas som den möter läsaren — i ett annat öga, i gråskala, med snitt och skyddsmarginal inritade, eller på armlängds avstånd. Felet syns i stället för att beskrivas.

## Fynd under bygget

- Nästan varje anmärkning är mallens, inte kortets: samma element på varje rad. Bara bundna värden (för lång text, tom bild) skiljer sig mellan kort.
- Färgblindhet går inte att beskriva i ord på ett användbart sätt — den måste ses. Samma matriser som kontrollen använder fungerar som SVG-filter över den riktiga renderingen.
- Ett fel stoppar en order, en varning gör det inte. Skillnaden måste synas i ytan, annars blir allt lika brådskande.
- "På armlängds avstånd" är den billigaste kontrollen av alla och kräver ingen validering: kortet ritas litet.

## Svar

_(fylls i när en variant valts)_
