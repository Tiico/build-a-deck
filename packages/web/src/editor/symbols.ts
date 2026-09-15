import { translate, type Key, type T } from '../i18n/index.js'

// The symbol library (E4): a curated set of freely licensed symbols, placeholder frames and
// colour blocks, drawn for this project and dedicated to the public domain. Taking one into a
// game puts it in the project's icon set, which `{namn}` in card text and the icon row look up
// (L2); its licence is recorded beside it, because licence metadata has to reach the print
// hand-off. A symbol is drawn dark and shown on a light chip: it reaches the card as an image,
// so it cannot take the colour of the text around it.
export type GameSymbol = {
  id: string
  // The name the project's icon set gets, and what is written between braces in card text. The
  // library is the tool's own, so its words are the tool's words: they are catalogue keys, and a
  // symbol taken into a game is named in the language the designer is building it in (A4).
  name: Key
  category: (typeof CATEGORIES)[number]
  // What else the symbol is called, for the search field: one message, comma-separated, because
  // a translator writes a list better than a list of translations.
  keywords: Key
  licence: string
  by: string
  svg: string
}

export const CATEGORIES = ['symbols.cat.resource', 'symbols.cat.action', 'symbols.cat.state', 'symbols.cat.placeholder'] as const satisfies readonly Key[]

const swedish: T = (key, params) => translate('sv', key, params)

// The one ink every symbol is drawn in. It is the colour a symbol has when a card asks for no
// meaning; a card that names one paints the same shape in the meaning's colour instead.
export const INK = '#1c1c1c'
const svg = (body: string, fill: string = INK): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}">${body}</svg>`

const CC0 = { licence: 'CC0-1.0', by: 'build-your-deck' }

export const LIBRARY: GameSymbol[] = [
  { id: 'svard', name: 'symbols.name.svard', category: 'symbols.cat.resource', keywords: 'symbols.words.svard', ...CC0, svg: svg('<path d="M4 20l3-1 10-10 2-6-6 2L3 15l-1 3z"/>') },
  { id: 'skold', name: 'symbols.name.skold', category: 'symbols.cat.resource', keywords: 'symbols.words.skold', ...CC0, svg: svg('<path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z"/>') },
  { id: 'hjarta', name: 'symbols.name.hjarta', category: 'symbols.cat.resource', keywords: 'symbols.words.hjarta', ...CC0, svg: svg('<path d="M12 21C6 16.5 3 13.5 3 9.5 3 6.5 5.2 4.5 8 4.5c1.7 0 3.2.9 4 2.2.8-1.3 2.3-2.2 4-2.2 2.8 0 5 2 5 5 0 4-3 7-9 11.5z"/>') },
  { id: 'mynt', name: 'symbols.name.mynt', category: 'symbols.cat.resource', keywords: 'symbols.words.mynt', ...CC0, svg: svg('<path fill-rule="evenodd" d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4a5 5 0 110 10 5 5 0 010-10z"/>') },
  { id: 'kristall', name: 'symbols.name.kristall', category: 'symbols.cat.resource', keywords: 'symbols.words.kristall', ...CC0, svg: svg('<path d="M12 2l7 7-7 13-7-13z"/>') },
  { id: 'ax', name: 'symbols.name.ax', category: 'symbols.cat.resource', keywords: 'symbols.words.ax', ...CC0, svg: svg('<path d="M11 22V9.8C7.7 9.3 5.6 7 5 3c4 .6 6.3 2.8 6.8 6.1V7.8C8.5 7.3 6.4 5 5.8 1c4 .6 6.3 2.8 6.8 6.1C13.1 3.8 15.4 1.6 19.4 1c-.6 4-2.7 6.3-6 6.8v1.3C14 5.8 16.3 3.6 20.3 3c-.6 4-2.7 6.3-6 6.8V22z"/>') },
  { id: 'pil-upp', name: 'symbols.name.pil-upp', category: 'symbols.cat.action', keywords: 'symbols.words.pil-upp', ...CC0, svg: svg('<path d="M12 3l8 9h-5v9h-6v-9H4z"/>') },
  { id: 'pil-ner', name: 'symbols.name.pil-ner', category: 'symbols.cat.action', keywords: 'symbols.words.pil-ner', ...CC0, svg: svg('<path d="M12 21l-8-9h5V3h6v9h5z"/>') },
  { id: 'dra', name: 'symbols.name.dra', category: 'symbols.cat.action', keywords: 'symbols.words.dra', ...CC0, svg: svg('<path fill-rule="evenodd" d="M5 5h6v2H5a1 1 0 00-1 1v10a1 1 0 001 1h6a1 1 0 001-1v-2h2v2a3 3 0 01-3 3H5a3 3 0 01-3-3V8a3 3 0 013-3zm9-3h5a3 3 0 013 3v9a3 3 0 01-3 3h-5a3 3 0 01-3-3V5a3 3 0 013-3zm0 2a1 1 0 00-1 1v9a1 1 0 001 1h5a1 1 0 001-1V5a1 1 0 00-1-1z"/>') },
  { id: 'kasta', name: 'symbols.name.kasta', category: 'symbols.cat.action', keywords: 'symbols.words.kasta', ...CC0, svg: svg('<path d="M5 7h14l-1.5 14h-11z"/><path d="M9 4h6v3H9z"/>') },
  { id: 'tarning', name: 'symbols.name.tarning', category: 'symbols.cat.action', keywords: 'symbols.words.tarning', ...CC0, svg: svg('<path fill-rule="evenodd" d="M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4zm1 3a2 2 0 100 4 2 2 0 000-4zm4 4a2 2 0 100 4 2 2 0 000-4zm4 4a2 2 0 100 4 2 2 0 000-4z"/>') },
  { id: 'vand', name: 'symbols.name.vand', category: 'symbols.cat.action', keywords: 'symbols.words.vand', ...CC0, svg: svg('<path d="M12 4a8 8 0 108 8h-3l4-6 4 6h-3A10 10 0 1112 2z"/>') },
  { id: 'sol', name: 'symbols.name.sol', category: 'symbols.cat.state', keywords: 'symbols.words.sol', ...CC0, svg: svg('<path d="M12 7a5 5 0 110 10 5 5 0 010-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM3.3 4.7l1.4-1.4 2.1 2.1-1.4 1.4zm14 14l1.4-1.4 2.1 2.1-1.4 1.4zm2.1-15.4l1.4 1.4-2.1 2.1-1.4-1.4zM5.4 17.2l1.4 1.4-2.1 2.1-1.4-1.4z"/>') },
  { id: 'mane', name: 'symbols.name.mane', category: 'symbols.cat.state', keywords: 'symbols.words.mane', ...CC0, svg: svg('<path d="M20 14A9 9 0 019 3a9 9 0 1011 11z"/>') },
  { id: 'lås', name: 'symbols.name.lås', category: 'symbols.cat.state', keywords: 'symbols.words.lås', ...CC0, svg: svg('<path d="M12 1a5 5 0 015 5v3h-2V6a3 3 0 00-6 0v3H7V6a5 5 0 015-5zM5 9h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z"/>') },
  { id: 'gift', name: 'symbols.name.gift', category: 'symbols.cat.state', keywords: 'symbols.words.gift', ...CC0, svg: svg('<circle cx="12" cy="9" r="6"/><path d="M6 20c2-3 10-3 12 0z"/>') },
  { id: 'ram-tunn', name: 'symbols.name.ram-tunn', category: 'symbols.cat.placeholder', keywords: 'symbols.words.ram-tunn', ...CC0, svg: svg('<path fill-rule="evenodd" d="M2 2h20v20H2zm1.5 1.5v17h17v-17z"/>') },
  { id: 'ram-dubbel', name: 'symbols.name.ram-dubbel', category: 'symbols.cat.placeholder', keywords: 'symbols.words.ram-dubbel', ...CC0, svg: svg('<path fill-rule="evenodd" d="M1 1h22v22H1zm1.5 1.5v19h19v-19zM4 4h16v16H4zm1 1v14h14V5z"/>') },
  { id: 'block-varm', name: 'symbols.name.block-varm', category: 'symbols.cat.placeholder', keywords: 'symbols.words.block-varm', ...CC0, svg: svg('<rect width="24" height="24" fill="#b4653f"/>') },
  { id: 'block-kall', name: 'symbols.name.block-kall', category: 'symbols.cat.placeholder', keywords: 'symbols.words.block-kall', ...CC0, svg: svg('<rect width="24" height="24" fill="#3f6cb4"/>') },
]


// What the search field finds: name, keywords or category, whichever the designer typed.
// The words a symbol is read and searched under, in the reader's own language (A4).
export const symbolName = (symbol: GameSymbol, t: T = swedish): string => t(symbol.name)
export const symbolWords = (symbol: GameSymbol, t: T = swedish): string[] => t(symbol.keywords).split(',').map((w) => w.trim().toLowerCase())

export function searchSymbols(query: string, category: string | null, t: T = swedish): GameSymbol[] {
  const q = query.trim().toLowerCase()
  return LIBRARY.filter((s) => (category ? s.category === category : true)).filter(
    (s) => !q || symbolName(s, t).toLowerCase().includes(q) || symbolWords(s, t).some((k) => k.includes(q)) || t(s.category).toLowerCase().includes(q),
  )
}

// A name the project's icon set does not already use.
export function freeIconName(wanted: string, taken: Record<string, string>): string {
  if (!taken[wanted]) return wanted
  for (let n = 2; ; n++) if (!taken[`${wanted}-${n}`]) return `${wanted}-${n}`
}

// The symbol as a file, for the upload that makes it one of the project's assets (E1): once it
// is the project's own, what the cards look like no longer depends on the library standing still.
export function svgBytes(symbol: GameSymbol): { type: string; bytes: Uint8Array<ArrayBuffer> } {
  const encoded = new TextEncoder().encode(symbol.svg)
  const bytes = new Uint8Array(encoded.length)
  bytes.set(encoded)
  return { type: 'image/svg+xml', bytes }
}

// A symbol shown in the editor before it belongs to the project.
export const symbolPreview = (s: GameSymbol): string => `data:image/svg+xml;utf8,${encodeURIComponent(s.svg)}`
