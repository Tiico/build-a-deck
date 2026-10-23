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
Dynamiska zoner och atomiska batchar enligt K1 och K3, eftersom båda ändrar protokollets form.
Zonrektanglar i setup-definitionen enligt K2, eftersom `move` annars saknar ett mål att snappa till.

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
  | { v: 'flip';       component: ComponentRef; face: FaceId }
  | { v: 'stack';      component: ComponentRef; onto: ComponentId }
  | { v: 'split';      pile: ZoneId; at: number; to: ZoneId }
  | { v: 'shuffle';    pile: ZoneId }
  | { v: 'draw';       from: ZoneId; to: ZoneId; count: number }
  | { v: 'deal';       from: ZoneId; to: ZoneId[]; each: number }
  | { v: 'roll';       component: ComponentId }
  | { v: 'setCounter'; component: ComponentId; value: number }
  | { v: 'peek';       components: ComponentId[] }
  | { v: 'showTo';     components: ComponentId[]; seats: SeatId[] }
  | { v: 'reveal';     components: ComponentId[] }
  | { v: 'movePile';   pile: ZoneId; to: ZoneId; x?: number; y?: number; rot?: number }
```

`ComponentRef` är `ComponentId | { top: ZoneId }` (K15): översta kortet i en hög, adresserat utan id eftersom en dold hög inte ger något.
Motorn löser upp toppen när raden appliceras, så loggen spelas upp identiskt.

`movePile` tillkom med K1: att plocka upp en hel hög är en fysisk handling.
`stack` på ett löst kort i en area skapar en ny pile-zon på platsen, med areans synlighet; en hög med ett kort kvar löses upp.
Zoner är därmed tillstånd som kan tillkomma och försvinna, och pile-zoner har en position.

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
  | { v: 'rewind.reject';  proposal: string }  // K13
  | { v: 'version.change'; to: GameVersionId }  // C7
  | { v: 'session.end' }
```

### 2.3 Kuvert och svar

```ts
type Envelope = { id: string; seat: SeatId | null; intents: (PhysicalIntent | SessionIntent)[] }

type Applied = {
  seq: number            // monotont per session, definierar loggens ordning
  batch: string          // kuvertets id; alla rader ur samma kuvert delar det
  at: string             // servertid
  by: SeatId | null
  intent: Envelope['intents'][number]
  outcome?: Outcome      // slumpresultat, se nedan
}
```

Ett kuvert bär en eller flera intents och är atomiskt (K3).
Servern validerar alla mot ett temporärt tillstånd innan någon appliceras; sedan appliceras alla med löpande seq, eller inget.
`undo.self` och tillbakaspolning behandlar en batch som en enhet.

All slump avgörs på servern och lagras som **resultat**, aldrig som frö.
`shuffle` ger en permutation, `roll` ger ett värde.
Detta är förutsättningen för deterministisk återspelning i D4 och för tillbakaspolning i C6.

### 2.4 Utgående diff

Varje plats får sin egen ström, filtrerad mot synlighetsmängden i B6.

```ts
type Patch = { seq: number; ops: Op[] }
type Op =
  | { op: 'upsert';     component: ComponentId; state: VisibleComponentState }
  | { op: 'remove';     component: ComponentId }
  | { op: 'zone';       view: ZoneView }
  | { op: 'zoneRemove'; zone: ZoneId }
```

`zoneRemove` tillkom med K1, eftersom ad hoc-högar är zoner som försvinner.
Närvaro (markörer, peka-gest, K6) går i en separat efemär kanal och finns inte i patchar eller logg.

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

Byggt 2026-10-23 (#1206) i `packages/print` (`@byd/print`), format efter The Game Crafter och QPMN i #1199 utan att någon av dem byggs.
Paketet är ramverksfritt och gör ingen I/O: filerna som `submit` behöver injiceras, och ingenting i det ritar ett kort (E2).
Typerna nedan är förenklade ur zod-schemana i `packages/print/src/schema.ts`, som är sanningen och valideringen där data korsar gränsen.

```ts
type PrintProvider = {
  readonly id: ProviderId
  readonly label: string
  readonly manufacturesIn: readonly Country[]   // ISO 3166-1 alpha-2; EU-kravet dirigerar på det

  supports(type: TypeRef): boolean
  requirements(type: TypeRef): PrintRequirements   // kastar för en typ som supports() säger nej till
  prepare(manifest: PrintManifest): PreparedOrder   // inga sidoeffekter mot partnern, deterministisk
  quote(manifest: PrintManifest, dest: Destination): Promise<Quote>   // anropas i kassan, F3
  submit(order: PreparedOrder, files: FileSource): Promise<ProviderOrderRef>
  track(ref: ProviderOrderRef): Promise<OrderStatus>
}

type FileSource = { bytes(name: string): Promise<Uint8Array>; url(name: string): Promise<string> }
type Quote = { basis: 'partner' | 'fictional'; unitPrice: Money; shipping: Money; duties: Money | 'unknown'; leadTimeDays: number }
type Money = { amountMinor: number; currency: 'EUR' | 'SEK' | 'USD' }
```

`duties: 'unknown'` är medvetet en del av typen.
Tull till EU från amerikansk eller asiatisk partner är en öppen fråga i DESIGN-BESLUT.md avsnitt I, och kontraktet ska inte låtsas att den är löst.
`basis: 'fictional'` är fake-providerns märkning av ett påhittat pris, som aldrig får visas som ett pris, och ett påhittat pris över en tullgräns säger alltid `'unknown'`.

### 4.1 `requirements()`: partnerns krav som data

`requirements(type)` är den enda källan till vad partnern vill ha, och inget nedströms antar ett fast utfall på 3 mm (#1207).
Svaret är en av två former.

```ts
type PrintedRequirements = {
  kind: 'printed'
  type: TypeRef
  sku: string                                     // partnerns produkt, till exempel «PokerDeck»
  trim: { widthMm: number; heightMm: number }     // snittmåttet, i partnerns mått och inte typens
  bleedMm: number                                 // utfall på varje kant
  safeMm: number
  file: { kind: 'raster'; format: 'png' | 'jpg'; dpi: number; widthPx: number; heightPx: number }
      | { kind: 'vector'; format: 'pdf' }
  colorSpace: 'sRGB' | 'CMYK'
  fileName: string                                // filnamnets stam av {n}, {cardRef}, {face}, {side}
  sides: Record<FaceId, string>                   // vår sida till partnerns ord för den
}
type StockRequirements = { kind: 'stock'; type: TypeRef; sku: string }   // en lagervara partnern packar (#1140)
```

Ett raster ritas i exakt `widthPx` × `heightPx`, som är snittet plus utfallet på varje kant vid `dpi`; kontraktssviten håller det inom en pixel.
En vektorfil är en PDF vars sida är samma ruta i millimeter.
`{n}` i filnamnet är filens nummer bland filerna med samma sida, från 1, och `{cardRef}` är kortets id vikt som exporten viker det (#527); filändelsen följer av formatet.
En lagervara som partnern inte packar har inga krav: `supports()` säger nej, och tärningarna försvinner därmed ur QPMN-formen.

### 4.2 Manifestet och det förberedda paketet

Plattformen lämnar spelet som fysiska ting innan något är ritat.

```ts
type PrintManifest = {
  cards: { cardRef: string; type: TypeRef; faces: Record<FaceId, string> }[]   // en post per fysiskt kort
  hardware: { type: TypeRef; count: number }[]
}
```

Två exemplar är två poster, som setupen och `printExportOf` listar dem.
`faces` namnger varje sida med en innehållsnyckel som anroparen väljer, till exempel en hash av den kompilerade sidan; samma nyckel betyder samma bild.
En framsida och dess baksida står i samma post och paras aldrig någon annanstans (L3, L7).

`prepare` ger det som skulle skickas, och samma sak visas för designern som tryckpaketet (F1, #1208).

```ts
type PreparedOrder = {
  provider: ProviderId
  files: PreparedFile[]          // en fil per bild, i den ordning manifestet först nämner dem
  cards: PreparedCard[]          // en per kort i manifestet, i samma ordning
  hardware: { type: TypeRef; sku: string; count: number }[]                // det partnern packar
  omitted: { type: TypeRef; count: number; reason: 'not-packed' }[]        // det som lämnades, och varför
  steps: { action: string; payload: Json }[]                              // partnerns anrop, i partnerns ord
}
type PreparedFile = {
  name: string                   // med filändelse, unikt i ordern
  type: TypeRef
  cardRef: string                // det första kortet som visar bilden: det som bilden kompileras ur
  face: FaceId
  side: string                   // partnerns ord för sidan
  content: string                // manifestets innehållsnyckel
  trim; bleedMm; safeMm; file; colorSpace   // kopierat ur requirements(type)
}
type PreparedCard = { cardRef: string; type: TypeRef; sku: string; files: Record<FaceId, string> }   // sida till filnamn
```

En bild är en fil hur många kort som än visar den: basens baksida på femtio kort ritas en gång, och en grupps baksida är en annan fil (L7).
Att rita en fil är den enda renderarens jobb via render-kön (E2, #1207): kompilera `cardRef`:s sida `face` med `bleedMm` utfall och rita den som `file` säger.
I `steps` står en fil som `{ "file": namn }`, och `submit` sätter uppladdningen eller URL:en där; varje förberedd fil nämns i stegen, och inga andra.
TGC-formen är en uppladdning per fil, ett spel, en lek per baksida med baksidan som `back_id`, korten i omgångar om högst hundra, lagerdelarna och en vagn.
QPMN-formen är en enda order med en `designData` per produkt, där varje kort är ett index med sin bild per sida.

`planFiles(provider, manifest)` i paketet gör den del av `prepare` som är gemensam för alla adaptrar: filerna, korten, lagervarorna och det som lämnades.
En adapter lägger bara till sina egna steg.

### 4.3 Regiondirigeringen

`routeOrder(providers, manifest, dest)` är en ren funktion som väljer provider för en destination, i plattformens prioritetsordning.
En EU-destination går bara till en provider vars alla fabriker ligger i EU, och finns ingen sådan som trycker spelet blir svaret `{ kind: 'none', reason: 'no-eu-print' }`, aldrig en tyst reserv utanför EU (F2).
Utanför EU går en provider som tillverkar i destinationens land först, och annars den första som trycker spelet; finns ingen blir svaret `'no-provider'`.
En provider trycker spelet om den trycker varje kort; lagervaror som den inte packar lämnas och avgör inte.

### 4.4 Fake-providern och kontraktssviten

`createFakeProvider(config)` står i en riktig partners ställe och pratar inte med någon.
Den har två förinställningar ur #1199: `MULTI_STEP_INCHES` i TGC:s form (USA, 63,5 × 88,9 mm, 1/8 tum utfall, PNG i 825 × 1125 px, tärningar som lagervara, spårning som rapporteras) och `SINGLE_ORDER_MM` i QPMN:s form (Kina och Vietnam, 63 × 88 mm, 1/8 tum utfall, PDF, inga tärningar, okänd spårning).
Med `manufacturesIn` satt till ett EU-land går dirigeringen att pröva.
Priset den svarar med är påhittat och märkt `basis: 'fictional'`.

`printProviderContract(namn, { provider })` ur `@byd/print/contract` är sviten som varje adapter ska klara, och fake-providern klarar den i båda formerna.
En riktig adapter kopplas in med en rad i en testfil, mot samma manifest (`CONTRACT_MANIFEST`) med baksidor per grupp, exemplar, kort-id som viks till samma filnamn och tärningar.

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
  ├── IconSet                (namn → asset, L2)
  └── GameVersion            (oföränderlig, B4; pinnar ComponentTypeDef-versioner, B3)
        ├── ComponentSet     (korttabellens rader; systemkolumn `antal`, L4)
        ├── Template         (elementträd per sida, bas + varianter, L1/L3/L7; kompileras till HTML/CSS, E2)
        └── Setup            (zoner med geometri, floor, startuppställning, B5/K2)

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
