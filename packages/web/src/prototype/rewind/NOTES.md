# PROTOTYP — ångra och spola tillbaka (B)

Fråga: var bor beslutet att spola tillbaka, och hur ber en telefon om det?

Kör: `pnpm proto` → http://localhost:5173/prototype/rewind?variant=A

Motorn kör på riktigt i webbläsaren: knapparna skickar `undo.self`, `rewind.propose`, `rewind.confirm` och `rewind.reject`.
Raden överst visar seq, öppet förslag och vad "ångra" skulle betyda för Ada och Bo just nu.

- **A — Dialog på TV:n.** Ångra på telefonen; om någon annan spelat sedan dess frågar telefonen "föreslå?" i ett ark.
  Förslaget blir en dialog mitt på TV:n med de drag som tas tillbaka överstrukna och Godkänn/Avvisa.
  Den andra telefonen får en banner med samma knappar; förslagsställaren ser "väntar" och kan dra tillbaka.
- **B — Tidslinje.** Loggen är gränssnittet.
  TV:n får en tidslinje över bordet; förslaget stryker de drag som skulle försvinna och en list med Godkänn/Avvisa.
  Telefonen kan spola till vilken rad som helst ("spola hit"), inte bara sitt eget senaste drag; den andra svarar ja/nej inne i listan.
- **C — Förhandsvisning på bordet.** TV:n har inga knappar.
  Under ett förslag visar bordet hur det såg ut vid målet, med gyllene ram och en etikett.
  Ångra på telefonen är ett tryck: blir det kontesterat skickas förslaget direkt.
  Den andra telefonen får en helskärmsfråga; förslagsställaren kan dra tillbaka.

## Fynd under bygget (oavsett variant)

- Ett förslag eller ett avslag är inte ett drag: de får inte kontestera någons ångra, och ska inte listas bland "drag som tas tillbaka".
  → Motorn filtrerar `rewind.propose`/`rewind.reject` ur de verksamma raderna (test finns).
- Telefonen behöver veta vad "ångra" betyder just nu (ok / kontesterat / inget att ångra) innan man trycker.
  Prototypen räknar det ur loggen på klienten; den riktiga klienten har bara aktivitetslistan, som räcker för samma beräkning.
- Aktivitetsflödet bör visa förslag och avslag i ord ("Ada föreslog att spola tillbaka").
  → `describe.ts` har raderna.

## Svar

_(fylls i när en variant valts)_
