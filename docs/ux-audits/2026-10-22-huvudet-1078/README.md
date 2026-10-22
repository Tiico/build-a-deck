# Vad som ger vika i editorns huvud (#1078)

Prototypen gjord 2026-10-22 på den byggda appen, i en Linux-Chromium med DejaVu Sans som `system-ui`, som på CI.
Varje bild visar huvudet vid 1280 i dag och med varianterna A, B och C, i ett språk och med eller utan bord igång.

- A: «Dela» utan ord under 1440.
- B: primärknappen säger sitt ärende kort under 1440, också utan bord.
- C: «Dela» ger vika bara när spelets namn inte ryms.

Beställaren valde B. Beslutet står i DESIGN-BESLUT, reviderat under #566, och mätningarna står i #1078.
