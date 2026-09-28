# Prototyp #529 · exportera och importera ett spel i Mina spel (G5)

In-app på grenen `proto/529-export-ui` (`packages/web/src/prototype/529-export/`), mot de riktiga vägarna från #527 och #528 (`POST/GET /projects/:id/export`, `POST /projects/import`). Riggen är `run-lasbarhet.ts`: Sal's Saloon, riktiga texturer och en renderare som gör tryck-PDF:erna.

## Varianterna

- **A — i rutnätet.**
  - «Exportera» i spelets ⋯. Förloppet står som en rad med stapel på spelets eget kort, och nedladdningen går av sig själv; kortet säger sedan «Exporten är nedladdad · Ladda ner igen».
  - «Importera spel» är en streckad ruta bredvid «＋ Nytt spel». Under importen blir den en ruta med spelets namn och förlopp, och vid fel med skälen.
- **B — dialoger.**
  - «Exportera…» i ⋯ öppnar en dialog som säger vad som följer med och vad som inte gör det, med knapparna «Förbered export» → förlopp → «Ladda ner».
  - «Importera spel…» i huvudet öppnar en dialog med filval, och felen står som en lista.
- **C — släpp och notis.**
  - En zip släpps var som helst på sidan, och en ram säger «Släpp zippen för att importera spelet». Det finns också «Importera…» i huvudet.
  - Export och import säger sitt i en notis längst ner.

## Iakttagelser

- Exporten av Sal's Saloon (77 kort) var klar på någon sekund med en varm renderare. Med en kall kö tar det längre tid, och då är förloppet det enda tecknet på att något händer.
- Serverns fel är på engelska («the file is not a zip»). I bygget bör de bli koder som verktyget översätter (A4).
- Ett importerat spel heter likadant som originalet, så två «Sal's Saloon» står bredvid varandra (C-7). Bygget kan behöva markera kopian, till exempel «(importerad)», eller låta den som importerar döpa den.
- A kräver ingen ny yta men gör rutnätet till en plats för tillstånd. B säger mest om vad som följer med, men är två steg till en nedladdning. C är snabbast för den som vet, men går inte att upptäcka utan knappen i huvudet.

Bilder: `<variant>-1-vila`, `-2-meny`, `-3-förbereder`/`-3-dialog`, `-4/5-klar`, `-6-import-fel`, `-7-importerad`, `C-8-slapp`.
