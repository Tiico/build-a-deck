// PROTOTYP — syntetisk lek i samma storleksordning som `spelkortDoc`: 77 kort, tretton filter,
// elva grupper. Talen är det som gör mätningarna ärliga; innehållet är påhittat.

const TYPER = ['Playcard', 'Location', 'Event', 'Item', 'Character', 'Rule'] as const
const NAMN = [
  "Sal's Safehouse", 'Takvåningens hiss', 'Nattportieren', 'Rökridå', 'Larmet i lobbyn', 'Falsk nyckelbricka',
  'Bakdörren mot gränden', 'Kassaskåpets kod', 'Städvagnen', 'Vaktens rond', 'Reservgeneratorn', 'Dimma över taket',
  'Chaufförens gest', 'Hisschaktet', 'Kameran i trapphuset', 'Servicekorridoren', 'Tjuvlarmet', 'Gästboken',
]
export const KORT = Array.from({ length: 77 }, (_, i) => ({
  id: `kort-${String(i + 1).padStart(2, '0')}`,
  typ: TYPER[i % TYPER.length]!,
  titel: NAMN[i % NAMN.length]!,
  text: 'Dra ett kort ur kasthögen och lägg det överst i leken. Om ingen vakt står i zonen får du dessutom flytta en bricka.',
  grupp: `typ = ${TYPER[i % TYPER.length]}`,
  kostnad: (i % 7) + 1,
  varning: i % 13 === 0,
}))

export const FILTER = [
  'Playcard', 'Location', 'Event', 'Item', 'Character', 'Rule',
  'sällsynt', 'vanlig', 'har bild', 'saknar bild', 'varning', 'ändrat', 'osparat',
]

export const GRUPPER = [
  { namn: 'Bas', antal: 77 },
  { namn: 'typ = Playcard', antal: 13 },
  { namn: 'typ = Location', antal: 13 },
  { namn: 'typ = Event', antal: 13 },
  { namn: 'typ = Item', antal: 13 },
  { namn: 'typ = Character', antal: 13 },
  { namn: 'sällsynthet = sällsynt', antal: 9 },
  { namn: 'sida = baksida', antal: 77 },
  { namn: 'kostnad ≥ 5', antal: 21 },
  { namn: 'typ = Rule', antal: 12 },
  { namn: 'typ = Ersättning', antal: 4 },
]

export const SYMBOLER = [
  'mynt', 'svärd', 'sköld', 'hjärta', 'blixt', 'droppe', 'låga', 'löv', 'kugghjul', 'nyckel',
  'öga', 'måne', 'sol', 'stjärna', 'krona', 'hand', 'fot', 'klocka', 'lås', 'karta',
  'kompass', 'tärning', 'bok', 'fjäder', 'ben', 'skalle', 'ringar', 'pil',
]

export const LAGER = [
  { namn: 'titel', vad: 'title', last: false },
  { namn: 'kostnad', vad: 'cost', last: true },
  { namn: 'illustration', vad: 'bild', last: false },
  { namn: 'regeltext', vad: 'body', last: false },
  { namn: 'typband', vad: 'typ', last: false },
  { namn: 'ram', vad: 'form', last: true },
  { namn: 'symbolrad', vad: 'symbols', last: false },
  { namn: 'sällsynthet', vad: 'rarity', last: false },
  { namn: 'bakgrund', vad: 'form', last: true },
  { namn: 'hörnmärke', vad: 'form', last: false },
  { namn: 'id-stämpel', vad: 'id', last: false },
  { namn: 'utfallsram', vad: 'form', last: true },
]

export const KONTROLLER = [
  { grad: 'error' as const, rubrik: '3 kort', text: 'Bakgrunden når utfallet i stället för snittet.' },
  { grad: 'warning' as const, rubrik: '12 kort', text: 'Regeltexten krymps till 5,4 pt — under minsta läsbara storlek.' },
  { grad: 'warning' as const, rubrik: '9 kort', text: 'Rött mot grönt blir en färg vid deuteranopi.' },
  { grad: 'warning' as const, rubrik: '1 mall', text: 'Ramen ligger 1 mm från kniven.' },
]
