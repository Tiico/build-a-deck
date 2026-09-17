# Prototyp: ett val bland femtio (#230)

Efter beställarens återkoppling 17 september: «Överväg också om vi kan presentera dessa knappar på ett
bättre sätt överlag, det är lite otympligt med en select med 4 olika block med ungefär 50 element att
välja på.»

[`prototyper/02-slotvalet.html`](2026-09-18/prototyper/02-slotvalet.html) öppnas direkt i en webbläsare.
Växeln uppe till höger jämför **Nu** med **Förslag**. Rutan står öppen i båda lägena, eftersom det är
den som jämförs.

## Vad som mäts

I ett spel med tjugo zoner har rutan **47 val**. I dag står de i en enda kolumn, i den ordning koden
råkar bygga dem: ett talfält, sedan mängdorden, sedan varje zon, sedan varje sida ett kort kan ligga på.
Den sista är sex rullningar bort.

## Vad förslaget ändrar

Inte *vad* som går att välja — bara hur man hittar i det.

- **Sök.** En zon nås genom att skrivas. Det är den enda vägen som inte blir värre av att spelet växer,
  och den enda som klarar en lek med femtio zoner lika bra som en med fem.
- **Senast valda överst.** Samma zon väljs om och om igen när en uppsättning byggs. Det är den billigaste
  förbättringen på sidan och den enda som inte kräver att man skriver något.
- **Rubriker som verkligen skiljer blocken åt.** De fyra blocken finns redan; de syns bara inte.
- **Det troliga först.** «Ett kort» och «varje hand» står före tjugo zoner ingen valt.

## Vad som inte är den här frågan

**Riktningen på rutan.** Den byggdes i #229 och är redan merged: rutan öppnas dit det finns plats, och
en slot vid sidans fot skjuter inte längre sidan framför sig. Det här issuet handlar om innehållet.

## Kvar att avgöra

1. **Fyra block eller fyra steg?** Prototypen behåller blocken i en ruta. Alternativet är att göra dem
   till steg — «hur många» → «varifrån» → «vart» → «vilken sida». Det gör varje steg litet, men lägger
   till ett klick för den som redan vet vad hon vill ha, och de flesta gånger vet hon det.
2. **Ska sökfältet ta fokus när rutan öppnas?** Det gör tangentbordet snabbare och musen långsammare:
   den som siktade på «ett kort» får först en blinkande markör.
3. **Hur många «senast valda» ska stå kvar?** Prototypen visar två.

Ingenting här importeras av appen. Tokens är kopierade från `packages/web/src/editor/editor.css`.

## En anteckning från bygget

Prototypen ritade först sin egen ruta fel: en `<div>` inuti ett `<p>` stänger stycket i parsern, så rutan
hamnade utanför sin omslutande `<span>` och positionerades mot sidan i stället för mot knappen. Den låg
alltså i nederkanten av fönstret. Värt att nämna eftersom det är samma *sorts* fel som #229 handlade om,
och det syntes bara när sidan renderades på riktigt.
