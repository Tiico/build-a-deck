# PROTOTYP — flagga, avsluta, enkät, observatör (C8, C9, G3)

Fråga: hur flaggar man ett ögonblick, avslutar sessionen och svarar på enkäten på telefonen, och hur syns observatören för alla?

Kör: `pnpm proto` → http://localhost:5173/prototype/session?variant=A

Telefonen är Adas. Bredvid: TV:n med observatören Eva vid bordet och sessionens slut, samt Evas egen vy.
Motorn kör i webbläsaren; enkäten hålls i minnet. "Bo drar" lägger drag i loggen; "börja om" laddar om.

- **A — Knappar i huvudet · enkät steg för steg.** "Flagga" och "Avsluta" i telefonens huvud. Flagga öppnar ett ark med frivillig kommentar; Avsluta ett ark som säger vad som händer. Enkäten tar en fråga i taget med stora 1–5-knappar och en fritext sist.
- **B — Ark från botten · enkät på en sida.** En list under handen med "Flagga ögonblicket" och "Meny" (ångra, lämna platsen, avsluta). Enkäten är en sida med tre 1–5-rader och en fritext.
- **C — Håll på loggraden · samtalsenkät.** Ingen flaggknapp: håll på en rad i "Senast" flaggar det ögonblicket, med raden som sammanhang. Avsluta i en ⋯-meny. Enkäten är ett samtal med snabbsvar.

Fast i alla tre: TV:n visar "Eva tittar på · ser allt" i docken och, efter avslut, en summering (drag, flaggade ögonblick, spelare) med "enkäten finns på telefonerna". Evas vy är bordet med allas händer och dolda högar, en banderoll om vad hon är, och bara en knapp: Flagga.

## Fynd under bygget (oavsett variant)

- Flaggan i C har ett sammanhang (raden man höll på) som A och B saknar; i loggen är flaggan ändå bara tidsstämplad mot seq. Vill man ha "vid vilken rad" bör flaggan bära `atSeq`.
- Enkäten skickas efter avslut och behöver veta vem: platsens namn räcker för spelare; observatören svarar med `observer: true`.
- TV:ns avslutade läge behöver bara `ended` i snapshoten och loggen; summeringen räknas ur aktivitetsraderna.
- Observatörens roster finns på tråden men inte i snapshoten; TvChrome ritar chipet ur rostern.

## Svar

_(fylls i när en variant valts)_
