# Tunn vertikal skiva — H1 detaljerad

Syftet är inte en användbar produkt.
Syftet är att varje söm i arkitekturen tvingas fungera på riktigt medan den fortfarande är billig att flytta.
Skivan är klar när ett fysiskt tryckt kortlek som skapats, speltestats och beställts genom systemet ligger i brevlådan.

Referenser till beslut i formen B3, C6 och så vidare pekar på [DESIGN-BESLUT.md](DESIGN-BESLUT.md).

---

## 1. Avgränsning

Ingår:

En komponenttyp: standardkort 63 × 88 mm, en definition, en version.
En kortmall med databindning, byggd i editorn.
En korttabell med ett tiotal rader, skapade via wizarden.
En setup-definition med fyra zoner: draghög, kasthög, spelyta, hand per plats.
Ett bord i `table`-rollen med två platser, plus en telefon i `player`-rollen.
Versionslåsning av sessionen och en händelselogg.
En `PrintProvider`-implementation mot en verklig partner, och en verklig lagd order.

Ingår uttryckligen inte:

Regelbok, samredigering, screening, abonnemang, kvoter, observatörsroll, enkäter, telemetri, tillbakaspolning, flerspråkighet, symbolbibliotek, fysisk validering utöver utfall och DPI.
Dessa har alla beslut fattade i DESIGN-BESLUT.md och byggs efter skivan.

Ingår som skelett men inte som funktion:

Synlighetsmodellen enligt B6, eftersom den inte går att lägga till i efterhand utan att skriva om synken.
Oföränderlig historik enligt B4, av samma skäl.
Åtkomstkontrollerade ansikten enligt avsnitt 5 nedan.

---

## 2. Kontraktsyta ett: intent-protokollet

Vokabuläret är slutet och fysiskt.
Ett verb beskriver vad en hand kan göra med ett föremål, aldrig vad ett spel betyder.
Mängden är ändlig eftersom fysiken är ändlig, och det är hela poängen — kontraktet slutar växa när det är färdigt.

### 2.1 Fysiska verb

```ts
type PhysicalIntent =
  | { v: 'move';       component: ComponentId; to: ZoneId; index?: number; x?: number; y?: number; rot?: number }
  | { v: 'rotate';     component: ComponentId; rot: number }
  | { v: 'flip';       component: ComponentId; face: FaceId }
  | { v: 'stack';      component: ComponentId; onto: ComponentId }
  | { v: 'split';      pile: ZoneId; at: number; to: ZoneId }
  | { v: 'shuffle';    pile: ZoneId }
  | { v: 'draw';       from: ZoneId; to: ZoneId; count: number }
  | { v: 'deal';       from: ZoneId; to: ZoneId[]; each: number }
  | { v: 'roll';       component: ComponentId }
  | { v: 'setCounter'; component: ComponentId; value: number }
  | { v: 'peek';       components: ComponentId[] }
  | { v: 'showTo';     components: ComponentId[]; seats: SeatId[] }
  | { v: 'reveal';     components: ComponentId[] }
```

`deal` är medvetet ett eget verb och inte socker för `shuffle` följt av `draw` gånger n.
Skälet är analys: en utdelning är en händelse designern tänker i, och att rekonstruera den ur tolv separata drag är förlustbringande.
Servern expanderar den internt men loggar en rad.

`peek` ändrar inget tillstånd men ändrar kunskap.
Den måste loggas, annars kan tillbakaspolningen i C6 inte veta vilka högar som behöver blandas om, och synlighetstestet i D4 kan inte verifieras.

### 2.2 Sessionsverb

Dessa är inte fysiska och hålls därför åtskilda i schemat.

```ts
type SessionIntent =
  | { v: 'seat.claim';   seat: SeatId; name: string }
  | { v: 'seat.release'; seat: SeatId }        // blandar tillbaka dolda kort, C9
  | { v: 'setup.reset' }
  | { v: 'undo.self' }                         // C6
  | { v: 'rewind.propose'; toSeq: number }
  | { v: 'rewind.confirm'; proposal: string }
  | { v: 'version.change'; to: GameVersionId }  // C7
  | { v: 'session.end' }
```

### 2.3 Kuvert och svar

```ts
type Envelope = { id: string; seat: SeatId | null; intent: PhysicalIntent | SessionIntent }

type Applied = {
  seq: number            // monotont per session, definierar loggens ordning
  at: string             // servertid
  by: SeatId | null
  intent: Envelope['intent']
  outcome?: Outcome      // slumpresultat, se nedan
}
```

All slump avgörs på servern och lagras som **resultat**, aldrig som frö.
`shuffle` ger en permutation, `roll` ger ett värde.
Detta är förutsättningen för deterministisk återspelning i D4 och för tillbakaspolning i C6.

### 2.4 Utgående diff

Varje plats får sin egen ström, filtrerad mot synlighetsmängden i B6.

```ts
type Patch = { seq: number; ops: Op[] }
type Op =
  | { op: 'upsert'; component: ComponentId; state: VisibleComponentState }
  | { op: 'remove'; component: ComponentId }
  | { op: 'zone';   zone: ZoneId; order: ComponentId[] }
```

`VisibleComponentState` innehåller aldrig identitet för en komponent platsen inte får se.
Ett dolt kort är ett ogenomskinligt handtag med position, rotation och typ — inget mer.
Vid anslutning och återanslutning skickas ett fullständigt snapshot i stället för patchar.

---

## 3. Kontraktsyta två: typdefinitionsschemat

Definitionen är data, oföränderlig och versionerad enligt B3.
En spelversion pinnar `{ id, version }`.

```ts
type ComponentTypeDef = {
  id: string                    // 'card.standard.63x88'
  version: number               // oföränderlig; ändring skapar ny version
  physical: {
    shape: 'rect' | 'roundedRect' | 'hex' | 'circle'
    widthMm: number
    heightMm: number
    thicknessMm: number
    cornerRadiusMm?: number
    material: string
  }
  faces: FaceId[]               // ['front','back']
  behaviours: {
    stackable: boolean
    shufflable: boolean
    flippable: boolean
    rollable: false | { faces: number }
    counter: boolean
  }
  editorSchema: FieldDef[]      // driver både datatabellens kolumner och mallens bindningar
  print: {
    bleedMm: number
    safeMm: number
    dpi: number
    colorProfile: string
    minPtByScript: Record<ScriptTag, number>   // E5 och A4
  }
  manufacturableBy: ProviderId[]               // statisk flagga, F3
}
```

`manufacturableBy` är kompensationen för att kostnadsbeskedet kommer först i kassan.
Editorn får aldrig låta någon bygga en komponent ingen partner tillverkar, och den kontrollen kräver inga live-anrop.

---

## 4. Kontraktsyta tre: PrintProvider

Gränssnittet ska designas mot minst två verkliga partner enligt F2, även om bara en implementeras i skivan.
Att designa mot en och föreställa sig resten ger ett gränssnitt format efter en enda leverantörs egenheter.

```ts
interface PrintProvider {
  readonly id: ProviderId

  supports(type: ComponentTypeRef): boolean
  requirements(type: ComponentTypeRef): PrintRequirements   // utfall, DPI, färgrymd, filformat, dielineform

  quote(manifest: ComponentManifest, dest: Destination): Promise<Quote>   // anropas i kassan, F3
  submit(order: PreparedOrder): Promise<ProviderOrderRef>
  track(ref: ProviderOrderRef): Promise<OrderStatus>
}

type ComponentManifest = { items: { type: ComponentTypeRef; qty: number }[]; boxing: BoxingSpec }
type Quote = { unitPrice: Money; shipping: Money; duties: Money | 'unknown'; leadTimeDays: number }
```

`duties: 'unknown'` är medvetet en del av typen.
Tull till EU från amerikansk eller asiatisk partner är en öppen fråga i DESIGN-BESLUT.md avsnitt I, och kontraktet ska inte låtsas att den är löst.

---

## 5. Åtkomstkontrollerade ansikten

Den vanligaste implementationen av ett kortspel i webbläsare skickar leken som data till klienten och renderar lokalt.
Det upphäver hela synlighetsmodellen i B6 tyst, eftersom varje dolt kort då ligger läsbart i klientens minne.

Regeln är därför:

En komponents ansikte hämtas per komponentinstans, aldrig som en lekbunt.
Varje hämtning kontrolleras mot samma synlighetsmängd som tillståndsdiffen.

```
GET /face/{sessionId}/{componentId}/{faceId}   →   200 textur  |  403
```

Editorn är undantaget: där äger användaren hela leken och får förstås se den.
Skillnaden ligger i sessionskontexten, inte i assetet.

---

## 6. Domänobjekten i skivan

```
Project
  └── GameVersion            (oföränderlig, B4; pinnar ComponentTypeDef-versioner, B3)
        ├── ComponentSet     (korttabellens rader)
        ├── Template         (HTML/CSS, E2)
        └── Setup            (zoner, startuppställning, B5)

Session                      (låst till en GameVersion, C7 kan byta)
  ├── Seat[]                 (äger hand och privata zoner, C3)
  ├── Connection[]           (roll table eller player, C2)
  └── EventLog               (Applied[], sanningen, D1)

Order
  └── PreparedOrder → ProviderOrderRef
```

---

## 7. Acceptanskriterier

Skivan är klar när allt nedan är sant, i ordning.

En ny användare tar sig genom wizarden och har en korttabell med tio rader och en mall som binder dem.
Kortet renderas identiskt i editorns förhandsvisning och som textur på bordet, från samma kodväg.
Två personer sitter vid ett bord, en på storskärm och en på telefon, ansluten via QR utan att skapa konto.
Handen på telefonen är osynlig för den andra platsen — verifierat genom att inspektera nätverkstrafiken, inte genom att titta på skärmen.
`shuffle` och `draw` fungerar, och loggen innehåller permutationen.
Sessionen är låst till en versionsidentitet som går att läsa ur loggen.
Sessionens logg kan spelas upp från början och ger bit för bit samma sluttillstånd, och samma synliga vy per plats vid varje steg.
En order läggs mot den implementerade partnern och en fysisk kortlek levereras.
Det tryckta kortet matchar skärmen.

Det sista kriteriet är det enda som inte går att automatisera, och det enda som verkligen bevisar något.

---

## 8. Vad skivan medvetet gör dåligt

Editorn är obekväm och saknar allt utom det som krävs för tio kort.
Bordet har ingen polish: inga ljud, ingen animation utöver det nödvändiga, ful typografi.
Det finns ingen felhantering värd namnet vid nätverksavbrott utöver snapshot vid återanslutning.
Ingen betalning — ordern läggs manuellt mot partnerns API med en hårdkodad destination.

Ingen av dessa brister får åtgärdas genom att kringgå ett kontrakt i avsnitt 2 till 4.
Det är hela skälet till att skivan är tunn.
