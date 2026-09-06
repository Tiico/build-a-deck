# PROTOTYP — anslutningsflödet

Fråga: hur sätter man sig vid bordet från telefonen?

Kör: `pnpm proto` → http://localhost:5173/prototype/join?variant=A (mobilviewport)

- **A — Bordet som platsväljare.** Litet bord ovanifrån, tryck på ledig plats, namn, "Sätt dig".
- **B — Listan.** Namn överst, platser som lista med status.
- **C — Bara namnet.** Ett fält, nästa lediga plats automatiskt.

## Svar (2026-09-06)

**A med C:s förval.**
Bordet som platsväljare — upptagna platser visar namn, lediga är tryckbara — men nästa lediga plats är förvald, så den som inte bryr sig skriver sitt namn och trycker "Sätt dig".
Prototypen ligger kvar som referens tills den riktiga vyn är byggd, och tas sedan bort.
