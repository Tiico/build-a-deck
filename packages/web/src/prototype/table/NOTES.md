# PROTOTYP — table-vyn

Fråga: hur ska det delade bordet (`table`-rollen) se ut?

Kör: `pnpm proto` → http://localhost:5173/prototype/table?variant=A

- **A — Planritning.** Schematisk ovanifrån; zoner som streckade rektanglar; händer som chips.
- **B — Filtbord (bordsläge).** CSS-perspektiv; platser runt fyra kanter; handfläktar; högar med tjocklek.
- **C — Sändning (TV-läge).** Mörk och stor; dock med platspaneler; aktivitetsflöde ur loggen; inspektion som panel.

## Fynd under bygget (oavsett variant)

- `Snapshot` saknar platsernas namn. Bordsvyn behöver dem; prototypen läser `state.seats` direkt, vilket en riktig klient inte kan. → Platser med namn hör hemma i snapshot/patch.
- Aktivitetsflödet i C behöver loggrader i klienten. Protokollet skickar bara patchar. → Antingen ett `applied`-meddelande på tråden, eller så härleds "senast" ur patchar (fattigare).

## Svar (2026-09-06)

**B som bord, C som TV-omgivning.**
En bordsrenderare byggd på B: filt, perspektiv, högar med tjocklek, handfläktar med antal, orientering per plats.
I bordsläge visas den ensam med platser runt kanterna.
I TV-läge (C5) vänds allt åt ett håll och omges av C:s header med rumskod och QR, dock med platspaneler, och aktivitetsflöde ur loggen.
A blir på sin höjd ett felsökningsläge senare.

Protokollet måste först få platser med namn i snapshot/patch, och ett `applied`-meddelande på tråden för aktivitetsflödet.
Prototypen ligger kvar som referens tills den riktiga vyn är byggd, och tas sedan bort.
