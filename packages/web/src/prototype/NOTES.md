# Prototyp — bildens ram och symbolens färg

Kastas när frågorna nedan är besvarade.
Kör `pnpm --filter @byd/web dev` och gå till `/prototyp?yta=bild&variant=A`.
Piltangenterna vänster och höger byter variant; fliken högst upp byter yta.

## Frågorna

**Bilder.** Hur ser det ut att öppna en bilds källa och rama den, när poängen är att en leks olika filer ska sluta se olika ut?
Beslutat innan prototypen: varianterna är *olika filer med samma sorts motiv*, och redigeringen är *ett icke-destruktivt recept* — filens bytes rörs aldrig.

**Symboler.** Hur ser det ut att välja färg på en symbol, när färgen hör till det enskilda bruket på kortet?
Beslutat innan prototypen: färgen sitter *per användning*, inte på symbolen i spelets uppsättning.

## Vad varianterna är

| | Bilder | Symboler |
| --- | --- | --- |
| A | **Ramverkstaden** — en bild i taget på en egen yta, leken som remsa under, grannkortet som spöke i fönstret | **Färgen i listan** — färg och symbol väljs i samma grepp vid klammern, skriver `{svard:rost}` |
| B | **Rutnätet** — hela leken är redigeringsytan, motivet dras direkt i sin ram, källan vänds fram på plats, linjal genom alla korten | **Chippet i cellen** — skrivandet är oförändrat, det skrivna ritas som chip och klickas för att målas |
| C | **Måttet** — en regel för leken plus en lista över de filer som inte kan svara på den | **Rollpaletten** — spelet namnger sina betydelser, bruket väljer roll, `{svard|fara}` |

## Vad prototypen redan har svarat på

Det här är fynd, inte åsikter — de kom ur att bygga det.

1. **Ramen måste passa motivet i den sida som binder, inte i höjden.**
   Första utkastet räknade fönstret ur motivets höjd. En bred teckning i en liggande ram rann då ut genom sidorna på var tredje fil.

2. **Fönstret måste klämmas mot filen, annars ljuger räknaren.**
   En fil utan luft kvar (Riddare) fick ett fönster större än filen och räknades ändå som "ritad lika stort".
   Först när fönstret kläms till det som faktiskt finns ritat syns avvikelsen på kortet — och då säger räknaren 5 av 6, vilket är sant.

3. **En fil kan vägra.**
   En bild som levererats hårt beskuren kan inte ritas lika stort som resten, hur regeln än ställs. Ytan måste säga det rakt ut; variant C är den enda som har en plats för det.

4. **Biblioteket måste ritas om för att kunna färgas.**
   Dagens symboler stansar hål med vitt (`mynt`, `tarning`, `dra`). Vitt är ett hål bara mot en vit bricka — färgat, eller på ett mörkt kort, blir det vit färg.
   En färgbar symbol är *en* form i *en* färg med hålen skurna av `fill-rule: evenodd`, ritad som mask med färgen bakom. Det är en omritning av E4:s bibliotek, inte en inställning.

5. **En mörk symbol behöver en ljus bricka i editorns mörka krom.**
   Med bläck vald försvann varje symbol i listan mot panelen. Samma sak i färgväljaren. Det gäller varje yta som visar en symbol i editorn.

6. **Färgen måste mätas mot kortets botten där den väljs.**
   Alla åtta bläck i prototypen klarar 3:1 mot `#f4ead8`, men det är ett urval — en fri färgväljare är fyrtio chanser att skriva ett oläsligt kort (E5).

7. **Att lagra färg per bruk är svårare än det ser ut.**
   Variant B binder färgen till ett teckenläge i cellen, och den bindningen bryts så fort texten redigeras.
   A och C skriver färgen i texten (`{svard:rost}`, `{svard|fara}`), vilket överlever redigering men är en protokolländring i `parseInline` (L2) och i ikonradens kolumnsyntax (L1).

## Kvar att svara på

- Vilken bildvariant, och vilka delar ur de andra?
- Vilken symbolvariant, och vilken syntax — `{namn:färg}`, `{namn|roll}`, eller färg utanför texten?
- Ska ramregeln vara per lek, per bildfält i mallen, eller per mallelement?
- Ska ett recept kunna följa med en bild till en annan lek, eller hör det till leken?

## Svaret

_Fylls i när varianterna är valda. Därefter skrivs beslutet in i DESIGN-BESLUT (E1 och E4) och katalogen här tas bort._
