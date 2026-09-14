// PROTOTYPE — throwaway.
//
// The library's symbols as they would have to be drawn to take a colour at all. Today's set uses
// white to punch a hole — the coin's middle, the die's pips, the card behind the card — and white
// is only a hole against a white chip. Coloured, or laid on a dark card, those holes turn up as
// white paint. So a colourable symbol is one shape in one colour with its holes cut by
// `fill-rule: evenodd`, and that is a redraw of the library, not a setting.
//
// Drawn this way a symbol can be a mask rather than a picture: the shape is the alpha channel and
// the colour is paint behind it. One asset, any colour, and the colour is CSS the compiler writes
// — which is what makes a colour per use possible without an asset per use.

export type ProtoSymbol = { id: string; name: string; path: string }

// Every hole below is a subpath wound the same way as its shell, so `evenodd` cuts it out. That
// is the whole trick, and it is why `mynt` and `tarning` are the two worth looking at.
export const SYMBOLS: ProtoSymbol[] = [
  { id: 'svard', name: 'svärd', path: 'M4 20l3-1 10-10 2-6-6 2L3 15l-1 3z' },
  { id: 'skold', name: 'sköld', path: 'M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z' },
  { id: 'hjarta', name: 'hjärta', path: 'M12 21C6 16.5 3 13.5 3 9.5 3 6.5 5.2 4.5 8 4.5c1.7 0 3.2.9 4 2.2.8-1.3 2.3-2.2 4-2.2 2.8 0 5 2 5 5 0 4-3 7-9 11.5z' },
  { id: 'mynt', name: 'mynt', path: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 4a5 5 0 110 10 5 5 0 010-10z' },
  { id: 'tarning', name: 'tärning', path: 'M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4zm1 3a2 2 0 100 4 2 2 0 000-4zm8 8a2 2 0 100 4 2 2 0 000-4zm-4-4a2 2 0 100 4 2 2 0 000-4z' },
  { id: 'droppe', name: 'droppe', path: 'M12 2c4 5.5 6 8.8 6 11.4A6 6 0 116 13.4C6 10.8 8 7.5 12 2z' },
]

export const byId = (id: string): ProtoSymbol | undefined => SYMBOLS.find((s) => s.id === id)

// The symbol as an alpha shape — no colour in it at all. This is the asset; the colour is put
// behind it, so the same upload serves every colour the deck ever writes.
export const maskUrl = (s: ProtoSymbol): string =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill-rule="evenodd" d="${s.path}"/></svg>`)}")`

// The deck's card ground, so a colour can be judged against what it will actually sit on (E5).
export const CARD_BG = '#f4ead8'

// Contrast of two hexes, as the checks compute it. A coloured symbol is a graphic and wants 3:1
// against its ground; the number is here because a colour picker that does not say this is a
// colour picker that ships unreadable cards.
const lum = (hex: string): number => {
  const n = hex.replace('#', '')
  const full = n.length === 3 ? [...n].map((c) => c + c).join('') : n
  const ch = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0)
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05)
}

// A palette that is a palette and not a colour wheel: eight inks that all clear 3:1 on the card's
// ground, because an unreadable symbol is the failure this feature invites.
export const INKS: { hex: string; name: string }[] = [
  { hex: '#1c1c1c', name: 'bläck' },
  { hex: '#8f2d20', name: 'rost' },
  { hex: '#a8410c', name: 'glöd' },
  { hex: '#7a5c00', name: 'guld' },
  { hex: '#2f6136', name: 'lund' },
  { hex: '#155e75', name: 'djup' },
  { hex: '#3b3a86', name: 'natt' },
  { hex: '#6b2d5c', name: 'plommon' },
]
