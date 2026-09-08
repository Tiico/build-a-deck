// The symbol library (E4): a curated set of freely licensed symbols, placeholder frames and
// colour blocks, drawn for this project and dedicated to the public domain. Taking one into a
// game puts it in the project's icon set, which `{namn}` in card text and the icon row look up
// (L2); its licence is recorded beside it, because licence metadata has to reach the print
// hand-off. A symbol is drawn dark and shown on a light chip: it reaches the card as an image,
// so it cannot take the colour of the text around it.
export type GameSymbol = {
  id: string
  // The name the project's icon set gets, and what is written between braces in card text.
  name: string
  category: (typeof CATEGORIES)[number]
  keywords: string[]
  licence: string
  by: string
  svg: string
}

export const CATEGORIES = ['Resurser', 'Handlingar', 'Tillstånd', 'Platshållare'] as const

const svg = (body: string, fill = '#1c1c1c'): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}">${body}</svg>`

const CC0 = { licence: 'CC0-1.0', by: 'build-your-deck' }

export const LIBRARY: GameSymbol[] = [
  { id: 'svard', name: 'svärd', category: 'Resurser', keywords: ['attack', 'strid', 'vapen'], ...CC0, svg: svg('<path d="M4 20l3-1 10-10 2-6-6 2L3 15l-1 3z"/>') },
  { id: 'skold', name: 'sköld', category: 'Resurser', keywords: ['försvar', 'block'], ...CC0, svg: svg('<path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z"/>') },
  { id: 'hjarta', name: 'hjärta', category: 'Resurser', keywords: ['liv', 'hälsa'], ...CC0, svg: svg('<path d="M12 21C6 16.5 3 13.5 3 9.5 3 6.5 5.2 4.5 8 4.5c1.7 0 3.2.9 4 2.2.8-1.3 2.3-2.2 4-2.2 2.8 0 5 2 5 5 0 4-3 7-9 11.5z"/>') },
  { id: 'mynt', name: 'mynt', category: 'Resurser', keywords: ['guld', 'pengar', 'kostnad'], ...CC0, svg: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" fill="#fff"/>') },
  { id: 'kristall', name: 'kristall', category: 'Resurser', keywords: ['magi', 'mana'], ...CC0, svg: svg('<path d="M12 2l7 7-7 13-7-13z"/>') },
  { id: 'ax', name: 'ax', category: 'Resurser', keywords: ['mat', 'skörd', 'sädesax'], ...CC0, svg: svg('<path d="M12 22V8m0 0c0-3 2-5 5-6 0 4-2 6-5 6zm0 3c0-3-2-5-5-6 0 4 2 6 5 6z"/>') },
  { id: 'pil-upp', name: 'pil-upp', category: 'Handlingar', keywords: ['öka', 'höj'], ...CC0, svg: svg('<path d="M12 3l8 9h-5v9h-6v-9H4z"/>') },
  { id: 'pil-ner', name: 'pil-ner', category: 'Handlingar', keywords: ['minska', 'sänk'], ...CC0, svg: svg('<path d="M12 21l-8-9h5V3h6v9h5z"/>') },
  { id: 'dra', name: 'dra', category: 'Handlingar', keywords: ['kort', 'draghög'], ...CC0, svg: svg('<rect x="3" y="5" width="11" height="15" rx="2"/><rect x="12" y="2" width="9" height="13" rx="2" fill="#fff" stroke="#1c1c1c" stroke-width="2"/>') },
  { id: 'kasta', name: 'kasta', category: 'Handlingar', keywords: ['kasthög', 'släng'], ...CC0, svg: svg('<path d="M5 7h14l-1.5 14h-11z"/><path d="M9 4h6v3H9z"/>') },
  { id: 'tarning', name: 'tärning', category: 'Handlingar', keywords: ['slå', 'slump'], ...CC0, svg: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="2" fill="#fff"/><circle cx="16" cy="16" r="2" fill="#fff"/><circle cx="12" cy="12" r="2" fill="#fff"/>') },
  { id: 'vand', name: 'vänd', category: 'Handlingar', keywords: ['tappa', 'rotera'], ...CC0, svg: svg('<path d="M12 4a8 8 0 108 8h-3l4-6 4 6h-3A10 10 0 1112 2z"/>') },
  { id: 'sol', name: 'sol', category: 'Tillstånd', keywords: ['dag', 'ljus'], ...CC0, svg: svg('<circle cx="12" cy="12" r="5"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12l2 2M20 4l-2 2M6 18l-2 2" stroke="#1c1c1c" stroke-width="2"/>') },
  { id: 'mane', name: 'måne', category: 'Tillstånd', keywords: ['natt', 'skymning'], ...CC0, svg: svg('<path d="M20 14A9 9 0 019 3a9 9 0 1011 11z"/>') },
  { id: 'lås', name: 'lås', category: 'Tillstånd', keywords: ['spärrad', 'stängd'], ...CC0, svg: svg('<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="#1c1c1c" stroke-width="2"/>') },
  { id: 'gift', name: 'gift', category: 'Tillstånd', keywords: ['skada', 'förfall'], ...CC0, svg: svg('<circle cx="12" cy="9" r="6"/><path d="M6 20c2-3 10-3 12 0z"/>') },
  { id: 'ram-tunn', name: 'ram-tunn', category: 'Platshållare', keywords: ['illustration', 'yta'], ...CC0, svg: svg('<rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="#1c1c1c" stroke-width="1.5"/>') },
  { id: 'ram-dubbel', name: 'ram-dubbel', category: 'Platshållare', keywords: ['illustration', 'yta'], ...CC0, svg: svg('<rect x="1" y="1" width="22" height="22" rx="2" fill="none" stroke="#1c1c1c" stroke-width="1.5"/><rect x="4" y="4" width="16" height="16" fill="none" stroke="#1c1c1c" stroke-width="1"/>') },
  { id: 'block-varm', name: 'block-varm', category: 'Platshållare', keywords: ['färgblock', 'yta'], ...CC0, svg: svg('<rect width="24" height="24" fill="#b4653f"/>') },
  { id: 'block-kall', name: 'block-kall', category: 'Platshållare', keywords: ['färgblock', 'yta'], ...CC0, svg: svg('<rect width="24" height="24" fill="#3f6cb4"/>') },
]


// What the search field finds: name, keywords or category, whichever the designer typed.
export function searchSymbols(query: string, category: string | null): GameSymbol[] {
  const q = query.trim().toLowerCase()
  return LIBRARY.filter((s) => (category ? s.category === category : true)).filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.keywords.some((k) => k.includes(q)) || s.category.toLowerCase().includes(q),
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
