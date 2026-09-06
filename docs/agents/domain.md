# Domändokument för agenter

Repot använder ett gemensamt produktkontextspår, inte separata bounded-context-
dokument. Före planering, triage eller ändringar ska agenten läsa de dokument
som berör arbetet:

- `DESIGN-BESLUT.md` — normerande produkt- och arkitekturbeslut.
- `TUNN-SKIVA.md` — den första vertikala skivan och kontraktsytorna.
- `DRIFT.md` — driftsmiljö och begränsningar.
- `ROADMAP.md` — ordning, status och releasekrav.
- `docs/UX-KONTROLLER.md` — återkommande UX-granskning och disposition av fynd.

Om `CONTEXT.md` eller `docs/adr/` införs senare ska de också läsas. Ett beslut
ändras i sin normerande källa; en ticket eller kodändring får inte tyst avvika.
