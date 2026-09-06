# PROTOTYP — grupper som styr båda sidorna (L3, L7)

Fråga: hur säger en designer "fällor ser ut så här, fram och bak; butikskort så där; allt annat som basen", utan att göra det kort för kort?

Kör: `pnpm --filter @byd/web dev` → http://localhost:5175/prototype/groups?variant=A

Mallen är riktig: `FaceTemplate` med `base`, `variants` och `variantBy: 'typ'` på både fram- och baksida, kompilerad genom `CardPreview`.
Det de tre varianterna skiljer sig i är hur designern ser och redigerar just den strukturen.

- **A — Gruppkolumn + variantflikar på duken.** Ett val "grupperas av kolumnen" gör kolumnens värden till grupper. Duken får en flik per grupp (Bas, typ = fälla, typ = butik) och en för fram/baksida. Det man ändrar med en gruppflik vald blir gruppens överskrivning; lagerpanelen markerar vilka lager gruppen skriver över. Hela leken syns till höger.
- **B — Grupper som regler i en egen flik.** En grupp är en regel (`typ = fälla`) med både fram- och baksida. Listan visar vad varje grupp ändrar mot basen och ett exempelkort. "Alla andra" är basen. Ny grupp: kolumn, operator, värde.
- **C — Stil och baksida per rad i tabellen.** Två kolumner i tabellen: stil (framsida) och baksida. Snabbt för undantag; tjugo fällor kräver tjugo val och ett nytt kort minns inte att det är en fälla.

## Fynd under bygget

- Modellen räcker redan: `variantBy` väljer variant per ansikte, och `override` per element-id ersätter ett baselement. Det som saknas är enbart UI för det och att baksidan får samma behandling som framsidan i editorn.
- En grupp måste vara en regel på data, inte en lista med kort-id:n. Annars går den sönder vid varje nytt kort.
- Den vinnande formen är A för redigering och B för överblick: A visar konsekvensen direkt på duken, B visar vad som gäller. De utesluter inte varandra — B kan vara "Grupper"-fliken och A dukens flikar.

## Rekommendation

A, med B:s regellista som sammanfattning i sidopanelen.
C avråds som primär väg men kolumnen "grupp" i tabellen bör visa vilken grupp raden faller i (läsbar, inte redigerbar).

## Svar

_(fylls i när Nicklas valt)_
