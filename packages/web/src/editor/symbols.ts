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

const svg = (body: string, fill = '#1c1c1c'): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}">${body}</svg>`

const CC0 = { licence: 'CC0-1.0', by: 'build-your-deck' }

export const LIBRARY: GameSymbol[] = [
  { id: 'svard', name: 'symbols.name.svard', category: 'symbols.cat.resource', keywords: 'symbols.words.svard', ...CC0, svg: svg('<path d="M4 20l3-1 10-10 2-6-6 2L3 15l-1 3z"/>') },
  { id: 'skold', name: 'symbols.name.skold', category: 'symbols.cat.resource', keywords: 'symbols.words.skold', ...CC0, svg: svg('<path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z"/>') },
  { id: 'hjarta', name: 'symbols.name.hjarta', category: 'symbols.cat.resource', keywords: 'symbols.words.hjarta', ...CC0, svg: svg('<path d="M12 21C6 16.5 3 13.5 3 9.5 3 6.5 5.2 4.5 8 4.5c1.7 0 3.2.9 4 2.2.8-1.3 2.3-2.2 4-2.2 2.8 0 5 2 5 5 0 4-3 7-9 11.5z"/>') },
  { id: 'mynt', name: 'symbols.name.mynt', category: 'symbols.cat.resource', keywords: 'symbols.words.mynt', ...CC0, svg: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" fill="#fff"/>') },
  { id: 'kristall', name: 'symbols.name.kristall', category: 'symbols.cat.resource', keywords: 'symbols.words.kristall', ...CC0, svg: svg('<path d="M12 2l7 7-7 13-7-13z"/>') },
  { id: 'ax', name: 'symbols.name.ax', category: 'symbols.cat.resource', keywords: 'symbols.words.ax', ...CC0, svg: svg('<path d="M12 22V8m0 0c0-3 2-5 5-6 0 4-2 6-5 6zm0 3c0-3-2-5-5-6 0 4 2 6 5 6z"/>') },
  { id: 'pil-upp', name: 'symbols.name.pil-upp', category: 'symbols.cat.action', keywords: 'symbols.words.pil-upp', ...CC0, svg: svg('<path d="M12 3l8 9h-5v9h-6v-9H4z"/>') },
  { id: 'pil-ner', name: 'symbols.name.pil-ner', category: 'symbols.cat.action', keywords: 'symbols.words.pil-ner', ...CC0, svg: svg('<path d="M12 21l-8-9h5V3h6v9h5z"/>') },
  { id: 'dra', name: 'symbols.name.dra', category: 'symbols.cat.action', keywords: 'symbols.words.dra', ...CC0, svg: svg('<rect x="3" y="5" width="11" height="15" rx="2"/><rect x="12" y="2" width="9" height="13" rx="2" fill="#fff" stroke="#1c1c1c" stroke-width="2"/>') },
  { id: 'kasta', name: 'symbols.name.kasta', category: 'symbols.cat.action', keywords: 'symbols.words.kasta', ...CC0, svg: svg('<path d="M5 7h14l-1.5 14h-11z"/><path d="M9 4h6v3H9z"/>') },
  { id: 'tarning', name: 'symbols.name.tarning', category: 'symbols.cat.action', keywords: 'symbols.words.tarning', ...CC0, svg: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="2" fill="#fff"/><circle cx="16" cy="16" r="2" fill="#fff"/><circle cx="12" cy="12" r="2" fill="#fff"/>') },
  { id: 'vand', name: 'symbols.name.vand', category: 'symbols.cat.action', keywords: 'symbols.words.vand', ...CC0, svg: svg('<path d="M12 4a8 8 0 108 8h-3l4-6 4 6h-3A10 10 0 1112 2z"/>') },
  { id: 'sol', name: 'symbols.name.sol', category: 'symbols.cat.state', keywords: 'symbols.words.sol', ...CC0, svg: svg('<circle cx="12" cy="12" r="5"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12l2 2M20 4l-2 2M6 18l-2 2" stroke="#1c1c1c" stroke-width="2"/>') },
  { id: 'mane', name: 'symbols.name.mane', category: 'symbols.cat.state', keywords: 'symbols.words.mane', ...CC0, svg: svg('<path d="M20 14A9 9 0 019 3a9 9 0 1011 11z"/>') },
  { id: 'lås', name: 'symbols.name.lås', category: 'symbols.cat.state', keywords: 'symbols.words.lås', ...CC0, svg: svg('<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="#1c1c1c" stroke-width="2"/>') },
  { id: 'gift', name: 'symbols.name.gift', category: 'symbols.cat.state', keywords: 'symbols.words.gift', ...CC0, svg: svg('<circle cx="12" cy="9" r="6"/><path d="M6 20c2-3 10-3 12 0z"/>') },
  { id: 'ram-tunn', name: 'symbols.name.ram-tunn', category: 'symbols.cat.placeholder', keywords: 'symbols.words.ram-tunn', ...CC0, svg: svg('<rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="#1c1c1c" stroke-width="1.5"/>') },
  { id: 'ram-dubbel', name: 'symbols.name.ram-dubbel', category: 'symbols.cat.placeholder', keywords: 'symbols.words.ram-dubbel', ...CC0, svg: svg('<rect x="1" y="1" width="22" height="22" rx="2" fill="none" stroke="#1c1c1c" stroke-width="1.5"/><rect x="4" y="4" width="16" height="16" fill="none" stroke="#1c1c1c" stroke-width="1"/>') },
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
