import type { EditIntent, ProjectCredit, ProjectDoc, ProjectFont } from '@byd/server'
import type { CatalogFamily } from './font-catalog.js'
import { LANGS, translate, type Key, type T } from '../i18n/index.js'
import { proseFieldsOf } from './body.js'
import { LIBRARY, freeIconName, svgBytes, symbolName, type GameSymbol } from './symbols.js'
import { assetRefOf } from './assets.js'

// The ready-made themes (L57, #632): how the card *feels* — a family for the headings and one for
// the text, the meanings and what they are painted in, and a set of icons to start from. Where
// things stand is the frame's, and a theme never moves anything (L57).
//
// Since L84 (#1287) they are examples to start from and not themes a game has: Speltema is the
// game's own theme, and the examples stand in a sheet behind «Titta i exemplen». Copying one
// writes its parts into the document as one edit (`setTheme`), and the copy is the game's own —
// the document does not remember the example it came from. The guided start takes one the same
// way.
//
// What a theme does *not* carry is the card's paper. The ground a card is printed on lives in the
// template, as the shape that covers the card, and a dark frame writes light text on it: laying a
// theme's pale paper over that would leave white words on cream. `paper` here is the ground the
// theme's colours were chosen against, and what they are measured against (E5) — the colour
// section measures them against the card's real ground, as it always has.
export type Theme = {
  id: string
  name: Key
  about: Key
  heading: CatalogFamily
  body: CatalogFamily
  paper: string
  meanings: readonly { id: MeaningId; colour: string }[]
  // Library symbols, by id: the set a game with no icons yet is given.
  icons: readonly string[]
}

// The meanings a theme paints. The id is the tool's own; the name the game gets is written in the
// designer's language and is hers from then on (A4), so a meaning is matched under every language's
// word for it and never added twice.
export type MeaningId = 'cost' | 'gain' | 'defence' | 'attack'
const MEANING: Record<MeaningId, Key> = { cost: 'theme.meaning.cost', gain: 'theme.meaning.gain', defence: 'theme.meaning.defence', attack: 'theme.meaning.attack' }

// The colours are the prototype's where E5 lets them be. Three of its sixteen did not survive the
// check it was approved under: Ren's and Krönika's night blue and grove green become one colour to
// a tritanope, and Retro's ember and gold to a protanope (`themes.test.ts`). Each was moved to the
// nearest ink that parts company for every reader — deep blue for the defence, rust for Retro's
// cost — and Ren's attack to plum, so Ren is not Skogssaga painted again.

// The catalog's own lines, verbatim (`google-fonts.ts`); `themes.test.ts` reads that they still are.
const CINZEL: CatalogFamily = { family: 'Cinzel', category: 'serif', licence: 'OFL 1.1', by: 'Natanael Gama', weights: '400..900' }
const EB_GARAMOND: CatalogFamily = { family: 'EB Garamond', category: 'serif', licence: 'OFL 1.1', by: 'Georg Duffner, Octavio Pardo', weights: '400..800' }
const INTER: CatalogFamily = { family: 'Inter', category: 'sans', licence: 'OFL 1.1', by: 'Rasmus Andersson', weights: '100..900' }
const OSWALD: CatalogFamily = { family: 'Oswald', category: 'sans', licence: 'OFL 1.1', by: 'Vernon Adams, Kalapi Gajjar, Cyreal', weights: '200..700' }
const ROBOTO_CONDENSED: CatalogFamily = { family: 'Roboto Condensed', category: 'sans', licence: 'OFL 1.1', by: 'Christian Robertson', weights: '100..900' }
const LORA: CatalogFamily = { family: 'Lora', category: 'serif', licence: 'OFL 1.1', by: 'Cyreal', weights: '400..700' }
const MERRIWEATHER: CatalogFamily = { family: 'Merriweather', category: 'serif', licence: 'OFL 1.1', by: 'Sorkin Type', weights: '300..900' }

const STARTER = ['mynt', 'skold', 'svard', 'hjarta', 'kristall', 'dra'] as const

export const THEMES: readonly Theme[] = [
  {
    id: 'skogssaga',
    name: 'theme.gallery.skogssaga',
    about: 'theme.gallery.skogssaga.about',
    heading: CINZEL,
    body: EB_GARAMOND,
    paper: '#f4efe4',
    meanings: [
      { id: 'cost', colour: '#8f2d20' },
      { id: 'gain', colour: '#2f6136' },
      { id: 'defence', colour: '#155e75' },
      { id: 'attack', colour: '#a8410c' },
    ],
    icons: STARTER,
  },
  {
    id: 'ren',
    name: 'theme.gallery.ren',
    about: 'theme.gallery.ren.about',
    heading: INTER,
    body: INTER,
    paper: '#ffffff',
    meanings: [
      { id: 'cost', colour: '#8f2d20' },
      { id: 'gain', colour: '#2f6136' },
      { id: 'defence', colour: '#155e75' },
      { id: 'attack', colour: '#6b2d5c' },
    ],
    icons: STARTER,
  },
  {
    id: 'retro',
    name: 'theme.gallery.retro',
    about: 'theme.gallery.retro.about',
    heading: OSWALD,
    body: ROBOTO_CONDENSED,
    paper: '#fbf1d6',
    meanings: [
      { id: 'cost', colour: '#8f2d20' },
      { id: 'gain', colour: '#7a5c00' },
      { id: 'defence', colour: '#155e75' },
      { id: 'attack', colour: '#6b2d5c' },
    ],
    icons: STARTER,
  },
  {
    id: 'krönika',
    name: 'theme.gallery.kronika',
    about: 'theme.gallery.kronika.about',
    heading: LORA,
    body: MERRIWEATHER,
    paper: '#f7f2ea',
    meanings: [
      { id: 'cost', colour: '#6b2d5c' },
      { id: 'gain', colour: '#2f6136' },
      { id: 'defence', colour: '#155e75' },
      { id: 'attack', colour: '#8f2d20' },
    ],
    icons: STARTER,
  },
]

/** The families a theme sets text in, once each. */
export const themeFamilies = (theme: Theme): CatalogFamily[] => (theme.heading.family === theme.body.family ? [theme.heading] : [theme.heading, theme.body])

// The name a meaning goes by in this game: the one it already has, in whichever language it was
// written, or the designer's word for it.
function meaningIn(doc: Pick<ProjectDoc, 'palette'>, id: MeaningId): string | null {
  const names = LANGS.map((lang) => translate(lang, MEANING[id]))
  return names.find((name) => doc.palette?.[name] !== undefined) ?? null
}

/** The library symbols a theme gives this game, under the names the game will call them: none once it has icons of its own. */
export function starterIcons(doc: Pick<ProjectDoc, 'icons'>, theme: Theme, t: T): { name: string; symbol: GameSymbol }[] {
  if (Object.keys(doc.icons).length > 0) return []
  const taken: Record<string, string> = {}
  return theme.icons.flatMap((id) => {
    const symbol = LIBRARY.find((s) => s.id === id)
    if (!symbol) return []
    const name = freeIconName(symbolName(symbol, t), taken)
    taken[name] = id
    return [{ name, symbol }]
  })
}

// A theme's icons as the files the service will hold, each with the name its bytes will have there
// (E1). Hashing is a wait, so it is done before the document is read and never after (D3).
export type IconFile = { id: string; file: ReturnType<typeof svgBytes>; ref: string }
export function themeIconFiles(theme: Theme): Promise<IconFile[]> {
  return Promise.all(
    theme.icons.flatMap((id) => {
      const symbol = LIBRARY.find((s) => s.id === id)
      return symbol ? [(async () => ({ id, file: svgBytes(symbol), ref: await assetRefOf(svgBytes(symbol).bytes) }))()] : []
    }),
  )
}

/** The starter set this game is given, each icon with the file it will be: none once the game has icons of its own. */
export function starterSet(doc: Pick<ProjectDoc, 'icons'>, theme: Theme, t: T, files: readonly IconFile[]): ({ name: string; symbol: GameSymbol } & IconFile)[] {
  return starterIcons(doc, theme, t).flatMap(({ name, symbol }) => {
    const hashed = files.find((f) => f.id === symbol.id)
    return hashed ? [{ name, symbol, ...hashed }] : []
  })
}

/** The starter set as `setTheme` writes it: the game's name for each icon, its file, and the licence it came with (E4). */
export const iconsOf = (set: readonly ({ name: string; symbol: GameSymbol } & IconFile)[]): Record<string, { url: string; credit: ProjectCredit }> =>
  Object.fromEntries(set.map(({ name, symbol, ref }) => [name, { url: ref, credit: { licence: symbol.licence, by: symbol.by, source: symbol.id } }]))

/**
 * The one edit that lays a theme over the game (L57, #632). `fonts` are the theme's families as the
 * game will carry them — each with its file (#420) — and `icons` the starter set, its bytes already
 * named by their hash; the caller has both, because both cost a fetch or a hash this function does
 * not wait for.
 */
export function themeIntent(doc: ProjectDoc, theme: Theme, fonts: Record<string, ProjectFont>, t: T, icons: Record<string, { url: string; credit?: ProjectCredit }> = {}): EditIntent {
  return {
    v: 'setTheme',
    heading: theme.heading.family,
    body: theme.body.family,
    prose: proseFieldsOf(doc),
    fonts,
    palette: Object.fromEntries(theme.meanings.map((m) => [meaningIn(doc, m.id) ?? t(MEANING[m.id]), m.colour])),
    ...(Object.keys(icons).length > 0 ? { icons } : {}),
  }
}

// What copying an example would replace in the game's theme, said before it is done (L84): the
// families the cards are set in, the meanings it repaints or adds, and the icons it brings. Read
// off the same parts the edit writes, so the list cannot promise what the copy does not do.
export type CopyChange =
  | { kind: 'heading' | 'body'; from: string; to: string }
  | { kind: 'colour' | 'meaning'; meaning: string; colour: string }
  | { kind: 'icons'; names: string[] }

export function copyChanges(doc: ProjectDoc, theme: Theme, t: T): CopyChange[] {
  const out: CopyChange[] = []
  const { heading, body } = cardFamilies(doc)
  const offHeading = heading.find((family) => family !== theme.heading.family)
  if (offHeading !== undefined) out.push({ kind: 'heading', from: offHeading, to: theme.heading.family })
  const offBody = body.find((family) => family !== theme.body.family)
  if (offBody !== undefined) out.push({ kind: 'body', from: offBody, to: theme.body.family })
  for (const m of theme.meanings) {
    const name = meaningIn(doc, m.id)
    if (name === null) out.push({ kind: 'meaning', meaning: t(MEANING[m.id]), colour: m.colour })
    else if (doc.palette?.[name]?.toLowerCase() !== m.colour.toLowerCase()) out.push({ kind: 'colour', meaning: name, colour: m.colour })
  }
  const icons = starterIcons(doc, theme, t)
  if (icons.length > 0) out.push({ kind: 'icons', names: icons.map((i) => i.name) })
  return out
}

/** The families the card's headings and its text are set in, each in the order the faces are read. */
export function cardFamilies(doc: ProjectDoc): { heading: string[]; body: string[] } {
  const prose = new Set(proseFieldsOf(doc))
  const heading: string[] = []
  const body: string[] = []
  const walk = (els: ProjectDoc['template']['faces'][string]['base']) => {
    for (const el of els) {
      if (el.kind === 'text') {
        const into = 'field' in el.bind && prose.has(el.bind.field) ? body : heading
        if (!into.includes(el.font.family)) into.push(el.font.family)
      }
      if (el.kind === 'if' || el.kind === 'group') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  return { heading, body }
}
