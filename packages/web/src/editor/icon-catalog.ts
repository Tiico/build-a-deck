import type { ProjectCredit } from '@byd/server'
import { translate, type Lang } from '../i18n/index.js'
import { INK, LIBRARY } from './symbols.js'
import { ICON_WORDS } from './icon-words.js'
import { CATALOG_MAX_AGE_MONTHS, pastAge } from './font-catalog.js'

// The icon libraries as the editor's picker knows them (#1087, L71): game-icons.net and Lucide
// beside the symbols drawn for the project (E4), searched the way the typeface catalog is (L27).
//
// The icons themselves are two pinned packages, `@iconify-json/game-icons` and
// `@iconify-json/lucide`, and what they do not say about themselves — who drew a game icon, what
// Lucide files its icons under — is `icon-sources.ts`, written by `scripts/icon-sources.ts`. All
// three are behind the dynamic import here, which the opening of the library is the only caller
// of, so none of it is on the editor's first paint. Nothing is fetched from anyone: an icon is a
// few hundred bytes, unlike a font file, so the whole catalog can travel with the build and a
// project never depends on a third party being up to take one in.
export type IconSource = 'deckster' | 'game-icons' | 'lucide'

export type CatalogIcon = {
  // `source:name`, unique across the libraries, and what a credit records as where the icon came from.
  id: string
  // The name the library gives it, which is also the name the game's set gets unless taken.
  name: string
  source: IconSource
  // What else it is called, for the search field: the library's own keywords, lower case.
  words: readonly string[]
  licence: string
  by: string
  svg: string
}

// What the game's set records beside the icon once it is taken in (E4). A Deckster symbol keeps
// the credit it has always had, the bare symbol id, so one taken in through the catalog is the same
// entry as one taken in before there was a catalog; the libraries record `source:name`.
export const creditOf = (icon: CatalogIcon): ProjectCredit => ({ licence: icon.licence, by: icon.by, source: icon.source === 'deckster' ? icon.id.slice('deckster:'.length) : icon.id })

type IconSet = { icons: Record<string, { body: string }>; width?: number; height?: number }

const file = (body: string, size: number): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" color="${INK}">${body}</svg>`

const lines = (text: string): [string, string][] =>
  text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const bar = line.indexOf('|')
      return [line.slice(0, bar), line.slice(bar + 1)]
    })

let loaded: Promise<CatalogIcon[]> | null = null

// The symbols drawn for the project (E4), in the reader's own words: the library is the tool's,
// so its names are the tool's catalogue keys, and a symbol is named in the language the designer
// builds in (A4). The two other libraries are named in English whatever the reader's language.
export const decksterIcons = (lang: Lang): CatalogIcon[] =>
  LIBRARY.map((s) => ({
    id: `deckster:${s.id}`,
    name: translate(lang, s.name),
    source: 'deckster',
    words: translate(lang, s.keywords).split(',').map((w) => w.trim().toLowerCase()),
    licence: s.licence,
    by: s.by,
    svg: s.svg,
  }))

// The catalog: Deckster's symbols first, then the two libraries, which are loaded once per page.
export async function loadIconCatalog(lang: Lang): Promise<CatalogIcon[]> {
  return [...decksterIcons(lang), ...(await libraries())]
}

function libraries(): Promise<CatalogIcon[]> {
  loaded ??= (async () => {
    const [{ default: game }, { default: lucide }, sources] = await Promise.all([
      import('@iconify-json/game-icons/icons.json') as Promise<{ default: IconSet }>,
      import('@iconify-json/lucide/icons.json') as Promise<{ default: IconSet }>,
      import('./icon-sources.js'),
    ])
    const out: CatalogIcon[] = []
    // Only the game icons whose author could be stated: one without is one the library does not
    // offer, because a credit that guesses is worse than no entry (L27).
    for (const [name, index] of lines(sources.GAME_ICONS_BY)) {
      const icon = game.icons[name]
      const author = sources.GAME_ICON_AUTHORS[Number(index)]
      if (!icon || !author) continue
      out.push({ id: `game-icons:${name}`, name, source: 'game-icons', words: [], licence: author.licence, by: author.by, svg: file(icon.body, game.width ?? 512) })
    }
    const words = new Map(lines(sources.LUCIDE_WORDS).map(([name, w]) => [name, w.split(',')]))
    for (const [name, icon] of Object.entries(lucide.icons)) {
      out.push({ id: `lucide:${name}`, name, source: 'lucide', words: words.get(name) ?? [], licence: 'ISC', by: 'Lucide Contributors', svg: file(icon.body, lucide.width ?? 24) })
    }
    return out
  })()
  return loaded
}

export type IconQuery = { query: string; source: IconSource | 'alla' }

// What a word the designer typed may mean: itself, and — in a language the libraries are not named
// in — the library words a game's word of that beginning stands for.
function meanings(word: string, lang: Lang): string[] {
  const words = ICON_WORDS[lang] ?? {}
  return [word, ...Object.entries(words).flatMap(([own, theirs]) => (own.startsWith(word) ? theirs : []))]
}

// Every word typed has to match. A word matches anywhere in the name, because the libraries run
// words together — «broadsword» is a sword — but only from the start of a keyword, because Lucide
// files its key under «password», and a designer looking for a sword is not looking for that.
export function searchIcons(icons: readonly CatalogIcon[], { query, source }: IconQuery, lang: Lang): CatalogIcon[] {
  const typed = query.trim().toLowerCase().split(/[\s,]+/).filter((w) => w !== '').map((w) => meanings(w, lang))
  const hits = icons.filter(
    (icon) => (source === 'alla' || icon.source === source) && typed.every((alts) => alts.some((w) => icon.name.includes(w) || icon.words.some((k) => k.startsWith(w)))),
  )
  // A name that is a whole word of the query comes before one that merely holds it, and a shorter
  // name before a longer: «sword» before «sword-in-stone».
  // Nothing typed is the catalog as it stands: Deckster's own first, then the two libraries.
  if (typed.length === 0) return hits
  const first = typed[0] ?? []
  const whole = (icon: CatalogIcon) => (icon.name.split('-').some((part) => first.some((w) => part === w || part === `${w}s`)) ? 0 : 1)
  return hits.sort((a, b) => whole(a) - whole(b) || a.name.length - b.name.length || a.name.localeCompare(b.name, 'en'))
}

// The sources are stamped and gated as the font list is (#370, L27): six months, and then the
// command that fixes it.
export const ICON_SOURCES_COMMAND = 'pnpm --filter @byd/web exec tsx scripts/icon-sources.ts'

export function staleIconSourcesMessage(stamp: string, now: Date): string | null {
  if (!pastAge(stamp, now, ICON_SOURCES_COMMAND)) return null
  return `The icon sources in \`icon-sources.ts\` were generated ${stamp} and are older than ${CATALOG_MAX_AGE_MONTHS} months (today is ${now.toISOString().slice(0, 10)}). Re-run \`${ICON_SOURCES_COMMAND}\` and commit the result (#1087, L71).`
}
