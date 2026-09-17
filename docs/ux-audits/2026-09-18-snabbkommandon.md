# Prototyp: snabbkommandon och den diskreta hjälpen (#224)

Efter beställarens återkoppling 17 september: «en ctrl + klick ska direkt vända ett kort, föreslå andra
bra shortkeys och lägg till en liten hjälpknapp för att ta fram alla shortkeys … Den ska vara diskret
och inte påverka tjänsten i övrigt.»

[`prototyper/03-snabbkommandon.html`](2026-09-18/prototyper/03-snabbkommandon.html) öppnas direkt i en
webbläsare. Filten går att spela på: klicka på ett kort för hjulet, modifierarklicka för att vända,
hovra över högen och tryck `D` eller `S`. Loggen till höger säger vad som hände.

## Ett fynd som ändrar beställarens egen formulering

**Ctrl + klick kan inte vända ett kort på en Mac.** Där är Ctrl+klick systemets sekundärklick: sidan får
`contextmenu` och aldrig `click`. Mätt i Chromium:

```
ctrl+klick gav: contextmenu ctrl=true meta=false button=0   → kortet vändes inte
cmd+klick gav : click       ctrl=false meta=true button=0   → kortet vändes
```

Kommandot bör därför vara **Cmd på macOS och Ctrl på Windows och Linux** — vilket är vad varje annan
modifierargenväg i tjänsten redan gör, och vad beställaren rimligen menade. Det är inte en invändning
mot önskemålet, bara mot bokstaven i det.

## Förslag på kommandon

| Tangent | Gör | Varför just den |
| --- | --- | --- |
| `Cmd/Ctrl` + klick | Vänd kortet | Det som efterfrågades. Vändning är den vanligaste handlingen och den enda som är helt omvändbar — alltså den som tål minst ceremoni. |
| `F` | Vänd det valda | Samma handling utan modifierare, för den som inte kan hålla två tangenter. |
| `D` | Dra från högen under pekaren | Draw. Det näst vanligaste, och det som annars kräver hjulet varje gång. |
| `S` | Blanda högen under pekaren | Shuffle. Sällan, men alltid mitt i något annat. |
| `Esc` | Stäng hjulet · avbryt draget | Finns redan (#142, #152). Står i listan för att hjälpen ska vara hela sanningen och inte bara det nya. |
| `?` | Visa listan | Där hjälp har legat sedan terminalen. |

Varje kommando har en väg utan modifierare. Allt går genom samma intents som hjulet — inga nya verb,
som CLAUDE.md kräver.

## Hjälpknappen

En 34 px rund `?` i filtens nedre högra hörn. Den tar ingen plats från bordet, den ligger inte över
något som spelas, och den visar bara den här ytans kommandon. Escape stänger den, som varje annan dörr
(#152).

Samma komponent är tänkt att kunna stå på fler ytor och då visa deras egna kommandon — men den bör inte
sättas ut på någon yta som ännu inte *har* några, för då lovar den något som inte finns.

## Kvar att avgöra

1. **Ska `D` och `S` verka på högen under pekaren eller på den valda högen?** Prototypen använder pekaren,
   vilket är snabbast med mus och omöjligt utan.
2. **Ska hjälpknappen vara synlig hela tiden, eller först vid hovring över filten?** Prototypen visar den
   hela tiden; «diskret» kan betyda båda.
3. **Vad gör `Cmd/Ctrl` + klick på en hög?** Vänder översta kortet, eller ingenting? Prototypen gör
   ingenting, vilket är säkrast men inkonsekvent.

Ingenting här importeras av appen.
