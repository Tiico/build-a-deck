# PROTOTYP — bordslägets mått och höghandtag

Kastas när frågan är besvarad.
Filer: `PROTOTYPE-bordslage.tsx`, `PROTOTYPE-bordslage.css`, plus tre märkta krokar i `TableRenderer.tsx`, `TablePage.tsx` och `geometry.ts`.

## Frågan

Två frågor som hänger ihop, från playtestet 2026-09-12:

- [#64](https://github.com/Tiico/build-a-deck/issues/64) Filten tar 29–39 % av bordsskärmen mot TV-lägets 63–88 %, och ett kort blir 38 px kort sida vid 1280 × 800.
- [#63](https://github.com/Tiico/build-a-deck/issues/63) En hel hög dras i en etikett som är 22 px hög — hälften av projektets träffytegräns, och det enda handtaget K14 ger för `movePile`.

## Så här körs den

```
pnpm dev:server        # och i ett andra skal:
pnpm dev:web
pnpm --filter @byd/server seed http://localhost:8080 demo
```

Lägg `&variant=A`, `&variant=B` eller `&variant=C` på bordslänken seeden skriver ut.
Pilarna i listan nere till höger, eller vänster- och högerpil på tangentbordet, byter variant.
Utan `?variant=` är rutten orörd, och listen ritar ingenting.

## Varianterna

| | Filten | Lutning | Höghandtag |
| --- | --- | --- | --- |
| **A** | som i dag: två femtedelar av ramens **oluttade** yta | 24° | pillret, 90 × 22 px |
| **B** | passas in mot den form bordet faktiskt **ritas** i | 24° | pillret, 114 × 45 px |
| **C** | samma inpassning som B | 13° | pillret, 113 × 47 px |

Mätt vid 1280 × 800 på ett seedat bord:

| | Filtens ruta | Andel av skärmen | Minsta kortsida | Handtag |
| --- | --- | --- | --- | --- |
| A | 796 × 476 | 37 % | 38 px | 90 × 22 |
| B | 949 × 562 | 52 % | 45 px | 114 × 45 |
| C | 914 × 583 | 52 % | 45 px | 113 × 47 |

Alla tre drar exakt: kortet följer fingret med högst 0,5 px avvikelse och landar där det släpps, även under C:s flackare lutning — `setPrototypeTilt` håller matten och stilmallen på samma vinkel.

## Vad prototypen redan har svarat på

**En rund bricka på högens hörn går inte.** Första C var TV-lägets räknarbricka flyttad till filten, 48 px.
Vid bordslägets skala är ett kort 45 × 63 px, så en 44-pixlars bricka är lika stor som kortet den sitter på och sväljer högen.
Varje handtag som ska nå 44 px på den här filten måste vara **brett och lågt**, inte runt — vilket är vad B och C gör med pillret.
Det är därför tredje varianten i stället angriper lutningen.

**Inpassningen mäter fel form.** Dagens regel mäter den oluttade rutan mot ramen och låter sedan `rotateX` krympa den, så det som ritas hamnar under de två femtedelar K9 beslutade.
B och C projicerar hörnen genom samma lutning som renderaren och söker fram skalan; det är den ändringen som ensam tar 37 % till 52 %.

## Svaret

> **Vald variant:** _(fylls i)_
>
> **Varför:** _(fylls i)_

När den är ifylld: skriv in talet och regeln i DESIGN-BESLUT under K9, bygg om den med test först, och ta bort prototypfilerna och de tre krokarna.
