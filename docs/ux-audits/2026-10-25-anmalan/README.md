# Anmälan och spärr per hash (2026-10-25, #1274)

Del av #1268, skiva 5.
Besluten som ligger fast står i F4 i DESIGN-BESLUT och i DRIFT §4.
Betans villkor står på den som driver tjänsten i dag (fråga 1).
En borttagning är en spärr per hash: servern, renderaren, trycket och exporten behandlar hashen som om den inte fanns, historiken står kvar och ritar bilden tom, och bytesen rensas ur R2 och Postgres bara när innehållet är olagligt (fråga 12).
Villkorens avsnitt 11 finns redan (#1272) och säger i dag «skriv till {contact}».

## Prototyp

`prototyper/index.html`, en fil med växlare för variant, yta, läge och bredd (Alla, dator, 375, 320).
Kör den över http: `python3 -m http.server 8794 --bind 127.0.0.1` i `prototyper/` och öppna `http://127.0.0.1:8794/`.
Bredden «Alla» ritar de tre bredvid varandra.
En streckad gul ram markerar det som är nytt.

Ytorna: ingången (#757:s rad, villkorssidans avsnitt 11 och, i C, det lyfta kortet), formuläret, kvittot på skärmen och i mejlet, operatörens mejl och skript, designerns mejl (DSA art. 17), editorn med den spärrade bilden och invändningen, och den spärrade bilden på bordet, i exporten och i historiken.
Mejlen är ritade i L72:s tre band som tabeller med inline-stil, utan `<svg>` i den riktiga byggnaden.

### Varianterna

- **A · En sida, ett mejl.**
  «Anmäl» på #757:s rad och en knapp i avsnitt 11 leder till `/villkor/anmal`, en sida i villkorssidans form.
  Fem fält och god tro i den ordning DSA art. 16 räknar dem: vad, var, varför, namn och e-post, och kryssrutan.
  «Var» tar rumskod, länk eller spelets namn, eftersom en rumskod bara gäller i tre timmar.
  Kvittot är ett mejl som upprepar anmälan, med ärendets nummer.
  Designern får ett mejl med skälen och invänder genom att svara på det.
  I editorn står ett band över Tabell, och «Spärrad» i den tomma cellen är en knapp som öppnar C:s remsa med skälen och «Byt bilden», utan invändningsfält: så som rekommendationen säger.
- **B · Fyra steg, ett ärende.**
  En guide: vad gäller det, var, varför och vem.
  Valet i första steget styr frågorna: «mitt verk» frågar efter verket och originalet, «rör barn» gör namn och adress frivilliga (art. 16.2 c).
  Rumskoden slås upp och svarar med spelets namn.
  Adressen bekräftas med en länk innan anmälan räknas, och kvittot har «Följ anmälan» till en statussida.
  Designern får ett band i editorn och en egen sida per spärr med beslutet och ett invändningsfält.
- **C · Från kortet.**
  Ett lyft kort på telefonen får «Anmäl bilden…», och arket bär bordet och kortet med sig, så att anmälaren bara säger varför och vem.
  Från raden och villkorssidan öppnar samma ark med «Var» som fritt fält; på datorn är det en dialog.
  Kvittot är en rad på telefonen och ett kort mejl.
  Designern trycker på den spärrade cellen i Tabell och får L9:s remsa med skälen, «Byt bilden» och «Invänd…», där invändningen skrivs.

Bordet, exporten och historiken är samma i alla tre, eftersom fråga 12 redan avgjort dem.
Gästerna ser en tom bild som vilken saknad bild som helst, och inget på tråden säger «spärrad» till någon annan än ägaren och medredigerarna.
Exporten säger det i `manifest.json` under `blocked` och i LASMIG.md; B och C säger det också i exportdialogen.
Historiken ritar varje version med bilden tom, och B och C märker versionerna och säger att en återställning inte tar tillbaka bilden.

## Rekommendation

**A för anmälan, med C:s remsa i Tabell för designern, och invändningen som ett svar på mejlet.**

- Anmälningarna blir få och läses alla av en människa med ett skript (DRIFT §10, §12).
  En sida med fem fält uppfyller art. 16 och kostar en tabell och ett mejl; B:s guide, ärenden, statussida och spärrsida är fyra ytor för ett fåtal fall.
- B:s bekräftelselänk skyddar mot att någon låter Deckster mejla kvitton till främmande adresser, men samma skydd ges av en gräns per adress och avsändare, som inloggningen redan har (DRIFT §9, §11), och länken stoppar den som anmäler i sista stund.
- C:s väg från kortet ger en exakt plats som överlever rumskoden, men den lägger ett tredje val på det lyfta kortet, en yta som är prövad och full, och den som sett ett kort vid ett bord kan skriva kortets och spelets namn.
  `report show` hittar bilden ur spelets och kortets namn lika väl.
- För designern räcker ett mejl juridiskt: art. 17 kräver skälen och vägarna att invända, och art. 20:s interna klagomålssystem gäller bara onlineplattformar.
  Men en tom cell utan förklaring i editorn ser ut som ett fel, och därför tar rekommendationen C:s remsa: «Spärrad» i cellen är en knapp, och remsan säger skälen, «Byt bilden» och att man invänder genom att svara på mejlet.
  Då behövs ingen tabell för invändningar i betan, och designern får veta varför där hen ser det.

## Beslut som beställaren behöver fatta

1. **Varianten**: A, B, C, eller rekommendationens blandning.
2. **Svarstiden** som RUNBOOK lovar för en anmälan och en invändning. Prototypen säger två arbetsdagar, som granskningen före tryck (fråga 14).
3. **Vem prövar en invändning** när det bara finns en operatör? Prototypen säger «en människa som inte fattade beslutet», vilket inte går med en person; förslaget är att operatören prövar igen och att texten säger «prövar invändningen» utan löftet.
4. **Samma bild i flera konton.** En hash är en spärr för alla spel som nämner den, också andra kontons; förslaget är att varje ägare vars spel nämner hashen får mejlet.
5. **Text och annat än bilder.** Spärren gäller en bilds hash. Ett kortnamn, en regeltext eller en gästs anteckning kan också anmälas; förslaget är att operatören då kontaktar ägaren och vid behov tar bort spelet eller maskar bordet (G6), utan en egen spärr i första versionen.
6. **Bekräftelselänk eller gräns** för anmälarens adress. Förslaget är en gräns per adress och avsändare, utan länk.

Beslut: _väntar på beställaren_.
