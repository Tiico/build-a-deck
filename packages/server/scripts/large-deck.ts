// A large game (#1007): the seed game scaled to what a designer with a finished game holds, since
// the 77-card sample hides density (every surface, and every budget, looks fine at its size).
//
// 308 cards — the seed deck four times over, each copy with its own ids and titles — with 15
// columns each: the sheet's title, type, rarity, text and count, and ten more a real card game
// carries (a cost, a reward, a phase, a faction, strength and defence, keywords, a line of flavour,
// a picture and whether the card is unique). A rulebook of a real game's length, icons, colour roles,
// two typefaces, and a template whose front draws the new columns and has a variant per type.
//
// Deterministic to the byte: every value is worked out of the card's place in the deck, never
// drawn at random, so the context built from it is the same every time it is built.
import type { Element } from '@byd/template'
import type { ProjectDoc } from '../src/projects.js'
import { spelkortDoc } from './spelkort.js'

const COPIES = ['', ' II', ' III', ' IV']
const FACTIONS = ['Saloonen', 'Sheriffen', 'Banditerna', 'Guldgrävarna', 'Prärien', 'Järnvägen']
const KEYWORDS = ['Snabb', 'Listig', 'Seg', 'Girig', 'Modig', 'Lömsk', 'Lojal', 'Vild']
const FLAVOUR = [
  '”Ingen lämnar saloonen förrän notan är betald.” — Sal',
  'Dammet lägger sig aldrig riktigt på Main Street.',
  'Guld gör folk modiga, och modiga folk gör dumheter.',
  '”Jag har sett snabbare kulor, men aldrig en snabbare tunga.”',
  'Tåget kommer klockan tolv, och det väntar inte på någon.',
  'På prärien är natten lång och elden liten.',
  '”Sheriffen? Han sover. Han sover alltid när det gäller.”',
  'Varje stjärna på himlen är en skuld som någon glömt.',
  'Den som delar sitt vatten delar också sina hemligheter.',
  'Ett spelkort i ärmen väger mer än ett i handen.',
  '”Rälsen tar oss västerut, och pengarna tar oss resten av vägen.”',
  'Kaktusen blommar en gång om året, och då ska du vara där.',
]

// The value at a place in a list, counted round it.
const at = <T>(list: readonly T[], i: number): T => list[i % list.length] as T

const hash = (n: number) => (n.toString(16).padStart(8, '0') + 'c0ffee'.repeat(10)).slice(0, 64)

export function largeDoc(): ProjectDoc {
  const doc = spelkortDoc()
  const seed = doc.rows
  const rows = COPIES.flatMap((suffix, k) =>
    seed.map((row, i) => {
      const n = k * seed.length + i
      return {
        id: k === 0 ? row.id : `${row.id}-${k + 1}`,
        fields: {
          ...row.fields,
          title: `${String(row.fields['title'] ?? '')}${suffix}`,
          kostnad: (i * 7 + k * 3) % 9,
          vinst: (i * 5 + k) % 7,
          fas: 1 + ((i + k) % 3),
          fraktion: at(FACTIONS, i + 2 * k),
          kraft: (i * 3 + k) % 10,
          försvar: (i * 2 + 5 * k) % 8,
          nyckelord: n % 3 === 0 ? '' : [at(KEYWORDS, n), ...(n % 5 === 0 ? [at(KEYWORDS, n + 3)] : [])].join(', '),
          citat: at(FLAVOUR, i + k * 5),
          bild: `asset:${hash(n)}`,
          unik: n % 4 === 0,
        },
      }
    }),
  )
  const front = doc.template.faces['front']
  if (!front) throw new Error('the seed game has a front')
  const more: Element[] = [
    { kind: 'image', id: 'bild', x: 5, y: 17, w: 53, h: 26, bind: { field: 'bild' }, fit: 'cover' } as Element,
    { kind: 'shape', id: 'mynt', x: 49, y: 4, w: 10, h: 10, shape: 'circle', fill: '#c9a227', stroke: '#3b2a1a', strokeMm: 0.4 } as Element,
    { kind: 'text', id: 'kostnad', x: 49, y: 6, w: 10, h: 6, bind: { field: 'kostnad' }, font: { family: 'Georgia, serif', sizePt: 11, weight: 800, align: 'center' }, color: '#1c1c1c', fit: 'fixed' } as Element,
    { kind: 'text', id: 'kraft', x: 5, y: 76, w: 12, h: 6, bind: { field: 'kraft' }, font: { family: 'Georgia, serif', sizePt: 10, weight: 700 }, color: '#b3261e', fit: 'fixed' } as Element,
    { kind: 'text', id: 'försvar', x: 46, y: 76, w: 12, h: 6, bind: { field: 'försvar' }, font: { family: 'Georgia, serif', sizePt: 10, weight: 700, align: 'right' }, color: '#1f4e79', fit: 'fixed' } as Element,
    { kind: 'text', id: 'fraktion', x: 18, y: 76, w: 27, h: 4, bind: { field: 'fraktion' }, font: { family: 'system-ui, sans-serif', sizePt: 7, align: 'center' }, color: '#3b2a1a', fit: 'shrink' } as Element,
    { kind: 'text', id: 'citat', x: 5, y: 66, w: 53, h: 9, bind: { field: 'citat' }, font: { family: 'Georgia, serif', sizePt: 7, lineHeight: 1.2 }, color: '#5a4a3a', fit: 'shrink' } as Element,
    {
      kind: 'if',
      id: 'om-nyckelord',
      when: { field: 'nyckelord', nonEmpty: true },
      children: [{ kind: 'text', id: 'nyckelord', x: 18, y: 80, w: 27, h: 3, bind: { field: 'nyckelord' }, font: { family: 'system-ui, sans-serif', sizePt: 6, weight: 700, align: 'center' }, color: '#3b2a1a', fit: 'shrink' }],
    } as Element,
  ]
  const template = { faces: { ...doc.template.faces, front: { ...front, base: [...front.base.map((el) => (el.id === 'body' ? ({ ...el, y: 44, h: 21 } as Element) : el)), ...more] } } }
  const icons = Object.fromEntries(['mynt', 'svärd', 'sköld', 'hjärta', 'stjärna', 'tärning', 'häst', 'dynamit'].map((name, i) => [name, `asset:${hash(1000 + i)}`]))
  const palette = { kostnad: '#c9a227', kraft: '#b3261e', försvar: '#1f4e79', vinst: '#2e7d32', fara: '#8e24aa', guld: '#b8860b' }
  const fonts = {
    Rubrik: { stack: '"Rubrik", Georgia, serif', asset: `asset:${hash(2000)}` },
    Brödtext: { stack: '"Brödtext", Arial, sans-serif', asset: `asset:${hash(2001)}` },
  }
  return { ...doc, template, rows, icons, palette, fonts, rules: rulebook(at(rows, 0).id, at(rows, 1).id) }
}

// A rulebook of the length a finished card game prints, some twenty pages of text: how the game is
// set up and played, each phase, each faction, each keyword, the end, and the questions players ask.
// Its rules name zones, cards and the counter by reference, as a designer's book does (B7).
function rulebook(first: string, second: string): NonNullable<ProjectDoc['rules']> {
  const blocks: NonNullable<ProjectDoc['rules']>['blocks'] = []
  let id = 0
  const heading = (text: string, level: 1 | 2 = 1) => blocks.push({ kind: 'heading', id: `b${++id}`, level, text })
  const text = (t: string) => blocks.push({ kind: 'text', id: `b${++id}`, text: t })
  const list = (items: string[], ordered = false) => blocks.push({ kind: 'list', id: `b${++id}`, items, ordered })

  heading('Välkommen till saloonen')
  text('Sal’s Saloon är ett kortspel för två till fyra spelare som tävlar om att bli den rikaste i staden. Ni köper kort i saloonen, spelar ut dem framför er, lägger fällor för varandra och samlar [[räknare:Guld]]. Ett parti tar ungefär fyrtio minuter, och den som har mest guld när leken tar slut för tredje gången vinner.')
  text('Spelet är byggt kring tre faser som återkommer varje runda. I den första drar ni och handlar, i den andra spelar ni ut kort och slåss, och i den tredje räknar ni vinsten. Varje fas har egna regler, och varje kort säger på sin framsida i vilken fas det hör hemma.')
  heading('Spelets delar', 2)
  list(['308 spelkort i sex fraktioner', 'en kortlek att dra från, [[zon:draw]]', 'en kasthög för spelade och kastade kort, [[zon:discard]]', 'saloonen, där korten som går att köpa ligger, [[zon:market]]', 'en plats framför varje spelare för fällor och karaktärer', 'guldmarkörer, en räknare per spelare'])
  heading('Förberedelser')
  blocks.push({ kind: 'setup', id: `b${++id}`, caption: 'Så här ser bordet ut när spelet börjar' })
  list(['Blanda alla kort och lägg dem som en dold hög, [[zon:draw]].', 'Vänd upp fem kort och lägg dem i [[zon:market]].', 'Varje spelare drar fem kort till sin hand och börjar med tre [[räknare:Guld]].', 'Den spelare som senast var på en saloon börjar. Spelet går medsols.'], true)
  text('Lägg [[kort:' + first + ']] åt sidan innan ni blandar: det kommer in i leken först när den har tagit slut en gång, och det gör det andra varvet hårdare än det första.')

  const phases: [string, string][] = [
    ['Fas 1: Dra och handla', 'Dra två kort från [[zon:draw]]. Du får sedan köpa högst ett kort ur saloonen genom att betala dess kostnad i guld. Ett köpt kort går till din hand, och saloonen fylls genast på från leken. Kan du inte betala får du i stället byta ett kort ur handen mot ett ur saloonen genom att lägga det i [[zon:discard]].'],
    ['Fas 2: Spela och slåss', 'Spela så många kort du vill och har råd med. En karaktär läggs framför dig och stannar där tills den besegras. En händelse verkar genast och läggs sedan i [[zon:discard]]. En fälla läggs dold framför dig och vänds upp när villkoret på den uppfylls. När du har spelat färdigt får du anfalla en annan spelares karaktär med en av dina.'],
    ['Fas 3: Räkna vinsten', 'Varje karaktär framför dig ger sin vinst i guld. Platser ger sin vinst bara om du har minst en karaktär av samma fraktion framför dig. Har du fler än sju kort på handen kastar du ner till sju. Sedan går turen vidare till spelaren till vänster.'],
  ]
  for (const [title, body] of phases) {
    heading(title, 2)
    text(body)
    text('Ett kort som säger att det spelas i den här fasen får inte spelas i någon annan, om inte ett annat kort uttryckligen tillåter det. Ett kort utan fas spelas när som helst under din egen tur, men aldrig under en annan spelares.')
    list(['Allt som händer i fasen sker i den ordning korten spelas.', 'Två effekter som sker samtidigt avgörs av den spelare vars tur det är.', 'En effekt som inte går att utföra helt utförs så långt det går.'])
  }

  heading('Strid')
  text('En anfallande karaktär jämför sin kraft med försvararens försvar. Är kraften högre besegras försvararen och läggs i [[zon:discard]], och anfallaren får en [[räknare:Guld]] från försvararens ägare. Är kraften lika stor eller lägre händer ingenting, men anfallaren är trött och får inte anfalla igen förrän nästa tur.')
  text('Fällor vänds upp innan striden avgörs. En fälla som ändrar kraft eller försvar gäller bara den här striden. En fälla som besegrar en karaktär gör det innan någon kraft jämförs, och då blir det ingen strid alls.')
  list(['Bara karaktärer kan anfalla och anfallas.', 'En karaktär som spelades ut den här turen får inte anfalla, om den inte är Snabb.', 'Unika karaktärer kan inte besegras av händelser, bara i strid.'])

  heading('Fraktionerna')
  const factionText: Record<string, string> = {
    Saloonen: 'Saloonens folk lever på att andra spelar. Deras kort ger guld när någon annan köper i saloonen, och flera av dem gör saloonens kort billigare för den som äger dem.',
    Sheriffen: 'Sheriffens män håller ordning. De har högt försvar och straffar den som anfaller, och några av dem kan avväpna en fälla innan den vänds upp.',
    Banditerna: 'Banditerna tar det de vill ha. De har hög kraft och lågt försvar, och de flesta av dem stjäl guld när de besegrar en karaktär.',
    Guldgrävarna: 'Guldgrävarna är tålmodiga. Deras kort ger lite i början men mer för varje runda de ligger kvar, och de belönar den som inte anfaller.',
    Prärien: 'Präriens folk rör sig snabbt och lämnar inga spår. Många av dem är Snabba eller Listiga, och de kan flytta kort mellan saloonen och leken.',
    Järnvägen: 'Järnvägen bygger för framtiden. Dess platser är dyra men ger vinst varje runda, och den som har flera av dem kan dra extra kort.',
  }
  for (const faction of FACTIONS) {
    heading(faction, 2)
    text(factionText[faction] ?? '')
    text(`Ett kort av fraktionen ${faction} räknas som samma fraktion som varje annat ${faction}-kort, oavsett typ. Effekter som säger «din fraktion» menar fraktionen på det kort som har effekten.`)
  }

  heading('Nyckelord')
  text('Nyckelord står på kortets framsida under bilden. De är förkortningar för regler som återkommer på många kort, och de gäller så länge kortet ligger framför dig.')
  list([
    'Snabb: får anfalla samma tur som den spelas ut.',
    'Listig: kan inte bli mål för en fälla.',
    'Seg: besegras först när den förlorar två strider i samma runda.',
    'Girig: ger en extra {mynt} i fas 3, men kostar en mer att köpa.',
    'Modig: får anfalla även när den är trött.',
    'Lömsk: anfaller dold; försvararen vet inte vilken karaktär som anfaller förrän fällorna vänts upp.',
    'Lojal: kan inte tas från dig av en annan spelares effekt.',
    'Vild: anfaller en slumpvis vald karaktär i stället för den du väljer.',
  ])

  heading('Unika kort')
  text('Ett unikt kort är märkt med en stjärna. Du får bara ha ett exemplar av varje unikt kort framför dig. Spelar du ett till läggs det gamla i [[zon:discard]] utan att ge något. [[kort:' + second + ']] är det enda unika kort som får ligga i två exemplar, och då bara hos olika spelare.')

  heading('Guld')
  text('Guld räknas med [[räknare:Guld]]. Du kan aldrig ha mindre än noll. Guld som du ska betala men inte har betalar du inte, och effekten det skulle ha betalat för sker inte. Guld som du ska ta från en annan spelare som inte har något tar du inte.')

  heading('Slutet på spelet')
  text('När [[zon:draw]] är tom blandas [[zon:discard]] och blir en ny lek. Första gången det händer läggs [[kort:' + first + ']] in i den nya leken. När leken tar slut för tredje gången spelas rundan klart, och den som då har mest guld vinner. Vid lika vinner den som har flest karaktärer framför sig, och är det fortfarande lika delar ni segern.')

  heading('Vanliga frågor')
  const faq = [
    ['Får jag köpa ett kort jag inte har råd med om en annan spelare betalar?', 'Nej. Bara du kan betala för det du köper, även om ett kort ger en annan spelare guld att ge bort.'],
    ['Vad händer om saloonen är tom?', 'Då fylls den på från leken. Är leken också tom blandas kasthögen först, som vid slutet av ett varv.'],
    ['Räknas en fälla som en karaktär?', 'Nej. En fälla är aldrig en karaktär, inte ens när den har kraft eller försvar tryckt på sig.'],
    ['Kan jag anfalla med en karaktär som är både Snabb och trött?', 'Nej. Snabb låter den anfalla samma tur som den spelas ut, men en trött karaktär anfaller inte om den inte är Modig.'],
    ['Gäller en händelse som säger «alla spelare» mig själv?', 'Ja. «Alla spelare» betyder alla vid bordet, du själv inräknad, om inte kortet säger «varje annan spelare».'],
    ['Får jag titta i kasthögen?', 'Ja, kasthögen ligger med framsidan upp och alla får titta i den när som helst.'],
    ['Vad gör jag om två kort säger emot varandra?', 'Det kort som säger att något inte får hända vinner över det kort som säger att det får hända.'],
    ['Hur många kort får jag ha på handen?', 'Hur många du vill under turen, men högst sju när fas 3 är slut.'],
    ['Kan en plats anfallas?', 'Nej. Platser ligger kvar tills ett kort uttryckligen tar bort dem.'],
    ['Vad betyder en symbol i klamrar på ett kort?', 'Den står för en ikon: {mynt} är guld, {svärd} är kraft och {sköld} är försvar. En siffra i klamrar är ett antal prickar.'],
    ['Får jag ge bort guld?', 'Bara när ett kort säger det. Guld är ditt och stannar hos dig.'],
    ['Vad händer med fällor när leken blandas om?', 'Fällor framför spelarna ligger kvar. Bara kort i kasthögen blandas in i den nya leken.'],
  ]
  for (const [q, a] of faq) text(`**${q}** ${a}`)

  heading('Korttyperna')
  const types: [string, string][] = [
    ['Playcard', 'Ett vanligt spelkort. Det spelas från handen under din egen tur, gör det som står på det och läggs sedan i [[zon:discard]].'],
    ['Location', 'En plats. Den läggs framför dig och ligger kvar tills ett kort tar bort den. Den ger sin vinst i fas 3 om du har en karaktär av samma fraktion.'],
    ['Effect', 'En effekt som varar. Den läggs bredvid den karaktär den gäller och följer med den om karaktären flyttas.'],
    ['Event', 'En händelse som gäller alla vid bordet. Den spelas i början av en runda och verkar tills nästa händelse spelas.'],
    ['Trap+', 'En fälla som hjälper den som lade den. Den läggs dold och vänds upp när dess villkor uppfylls.'],
    ['Trap-', 'En fälla som skadar den som går i den. Den läggs dold framför en annan spelare och vänds upp när dess villkor uppfylls.'],
    ['Character', 'En karaktär. Den läggs framför dig, kan anfalla och anfallas, och ger sin vinst i fas 3.'],
    ['Shopcard', 'Ett kort ur saloonen. Det köps i fas 1 för sin kostnad och tas sedan till handen som vilket kort som helst.'],
  ]
  for (const [type, body] of types) {
    heading(type, 2)
    text(body)
    text(`Ett kort av typen ${type} har sin typ tryckt i bandet överst och på baksidan, så att högen går att sortera med korten vända nedåt. Kostnaden står i myntet uppe till höger, kraften nere till vänster och försvaret nere till höger; ett kort som saknar något av dem har inget värde där, inte noll.`)
  }

  heading('Exempel på en runda')
  const players = ['Anna', 'Bertil', 'Cecilia', 'David']
  for (const [i, player] of players.entries()) {
    const next = at(players, i + 1)
    text(`${player} börjar sin tur med att dra två kort från [[zon:draw]]. I saloonen ligger fem kort, och ${player} har fyra [[räknare:Guld]]. ${player} köper ett kort som kostar tre och har nu en guld kvar. Saloonen fylls på med översta kortet från leken, som råkar vara en händelse; den läggs i saloonen som vilket kort som helst och kan köpas av nästa spelare.`)
    text(`I fas 2 spelar ${player} ut en karaktär med kraft fyra och anfaller ${next}s karaktär, som har försvar tre. ${next} har en dold fälla framför sig och vänder upp den: den ger försvararen ett i försvar under striden. Kraften fyra mot försvaret fyra räcker inte, så ingenting händer, men ${player}s karaktär är nu trött.`)
    text(`I fas 3 räknar ${player} vinsten: två karaktärer ger tillsammans tre guld, och en plats av samma fraktion ger ett till. ${player} har sex kort på handen och behöver inte kasta något. Turen går vidare till ${next}.`)
  }
  text('När leken tar slut mitt i en spelares tur blandas kasthögen genast och blir en ny lek, och spelaren drar färdigt från den. Det räknas som ett varv även om bara ett kort drogs ur den gamla leken.')

  heading('Varianter')
  text('För ett kortare parti slutar spelet när leken tar slut för andra gången. För ett hårdare parti börjar varje spelare med ett guld i stället för tre, och saloonen har bara fyra kort.')
  text('Med två spelare tar ni bort Järnvägen och Prärien ur leken innan ni blandar, och saloonen har fyra kort. Varje spelare får då anfalla två gånger per tur, men aldrig samma karaktär två gånger.')
  return { title: 'Regler för Sal’s Saloon', blocks }
}
