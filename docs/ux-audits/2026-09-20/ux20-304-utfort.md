# Utfört 2026-09-21: startens, kontots och guidens texter (#304, L36)

Före-/efter-listan över de tio förklarande strängarna i `sv.account.ts`, som L36 räknade: 879 tecken på tre ytor.
Efter-texten är prototypens ([13-startens-texter.html](prototyper/13-startens-texter.html)) och beslutet 2026-09-20.
Det som flyttar går bakom L32:s frågetecken (`Help` i `HelpDrawer.tsx`); det som står kvar är en kort rad ytan fortfarande läser efter.
Engelskan följer samma indelning i `en.account.ts`.

| nyckel | yta | före | efter på ytan | i lådan |
|---|---|---|---|---|
| `home.empty` (149) | start, tomt läge | Inget spel ännu. Ett spel är en kortlek med sin mall, sina regler och sitt bord. "+ Nytt spel" frågar efter namn och kortstorlek, och öppnar editorn. | Inget spel ännu. | `home.help.game`: Ett spel är en kortlek med sin mall, sina regler och sitt bord. · `home.help.new`: «+ Nytt spel» frågar efter namn och antal spelare och gör resten åt dig. |
| `wizard.blank.body` (137) | guiden, steg 1 | Vill du hellre bygga allt själv? Spelet skapas med namnet och platserna ovanför, utan kort, fält eller mall, och öppnas direkt i editorn. | Bygg hellre allt själv? | `wizard.blank.help`: Spelet skapas med namnet och platserna ovanför, utan kort, fält eller mall. |
| `login.lead` (102) | inloggningen | Skapa ditt kortspel, speltesta det på skärmen, beställ hem det. Logga in för att komma till dina spel. | Logga in för att komma till dina spel. — och `login.pitch` «Skapa ditt kortspel, speltesta det på skärmen, beställ hem det.» **bara första gången** | `login.pitch`, alltid |
| `wizard.footer` (88) | guiden, steg 3 | Du kan lägga till resten av leken, importera CSV och finjustera mallen efter nästa steg. | — | oförändrad, i steg 3:s låda |
| `login.no-password` (83) | inloggningen | Inget lösenord. Länken i mejlet loggar in dig; första gången skapar den ditt konto. | — | oförändrad |
| `wizard.handoff.body` (81) | guiden, steg 1 | Skapa några exempelkort här. Layout, hela leken och CSV-verktyg väntar i editorn. | — (rubriken «Wizarden är startpunkten» står kvar) | oförändrad, i steg 1:s låda |
| `login.guest` (66) | inloggningen | Ska du bara spela? Skanna QR-koden på bordet — inget konto behövs. | — | oförändrad |
| `claim.lead` (61) | claim | Logga in för att spara bordet du spelade vid till ditt konto. | Logga in för att spara bordet till ditt konto. | `claim.help`: Bordet du spelade vid följer med till kontot du loggar in med. |
| `wizard.fields.body` (56) | guiden, steg 2 | Varje fält blir direkt en kontroll på varje exempelkort. | Fälten på varje kort. | `wizard.fields.help`: Varje fält blir direkt en kontroll på varje exempelkort. |
| `wizard.cards.body` (56) | guiden, steg 3 | De hjälper editorn att visa hur fälten faktiskt används. | — | Exempelkorten hjälper editorn att visa hur fälten faktiskt används. |

## Vad som står kvar synligt

De sju som är fel, följder och status rördes inte: `claim.error.unknown`, `login.error.too-many`, `invite.spent`, `claim.error.other`, `login.sent.body` (länken gäller 15 minuter och en gång), `home.claimed` och `home.remove.ask`.

## Ett frågetecken per guide-steg

Vid stegets rubrik, i rubrikens egen rad (`.byd-help-row`), och inte ett per förklaring.
Steg 1:s låda bär överlämningen och det tomma spelet; steg 2:s bär fälten; steg 3:s bär exempelkorten och det som kommer efter.
På skrivbordet står alla tre stegen och alltså tre frågetecken, ett per rubrik; under skrivbordet ett åt gången.

## Säljtexten första gången

`login.pitch` visas när `localStorage` saknar `byd.login.pitch-seen`, och nyckeln sätts till `1` första gången raden renderats.
Kan lagringen inte läsas eller skrivas visas raden (L36).
Claim-sidan, som byter ut raden mot sin egen, visar aldrig säljtexten och räknar inte besöket som sett.
Frågetecknet står bredvid raden i båda fallen och lådan bär säljtexten, lösenordsraden och gästraden.

## Mätt (Chromium, `start-help-layout.test.tsx`)

Inloggningskortet: 461 px → 368 px vid 390 px bredd (första besöket, med säljtexten), 440 px → 368 px vid 1280; den som återvänder får 312 px.
Samma höjd med lådan öppen som stängd, frågetecknet 44 × 44, lådan inom fönstret, ingen sidledes rullning — vid 390 × 844 och 1280 × 800, på kortet och i guiden.

## Arket

Mönstrets regler flyttade från `editor.css` till `help.css`, som `HelpDrawer.tsx` själv laddar: kontot laddar aldrig editorns ark.
Filtens egen hörnhjälp hette också `.byd-help` och heter nu `.byd-shortcut-help`; båda arken blockerar första målningen och skulle annars ha låst kortets frågetecken i hörnet.
