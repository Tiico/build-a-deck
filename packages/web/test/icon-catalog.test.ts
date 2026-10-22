import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { svgRefusal } from '@byd/protocol'
import { createRequire } from 'node:module'
import { ICON_SOURCES_COMMAND, loadIconCatalog, searchIcons, staleIconSourcesMessage } from '../src/editor/icon-catalog.js'

// The icon libraries as the editor knows them (#1087, L71): Deckster's own symbols, game-icons.net
// and Lucide, one catalog searched like the typefaces are (L27). Every entry knows its licence and
// who drew it, because that is what a catalog entry is for and what the print hand-off needs (E4).
describe('the icon catalog (#1087)', () => {
  it('offers a game icon with the person who drew it and the licence they publish under', async () => {
    const catalog = await loadIconCatalog('sv')
    const swords = catalog.find((i) => i.id === 'game-icons:crossed-swords')

    expect(swords).toMatchObject({ name: 'crossed-swords', source: 'game-icons', licence: 'CC-BY-3.0', by: 'Lorc' })
    // A file a card can draw on its own: its own box, and the tool's ink for the package's
    // `currentColor`, so the icon is dark as an image and a clean shape as a mask.
    expect(swords?.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512" color="#1c1c1c">/)
  })

  it('offers the symbols drawn for the project beside them, in the reader’s own words (E4, A4)', async () => {
    expect((await loadIconCatalog('sv')).find((i) => i.id === 'deckster:mynt')).toMatchObject({ name: 'mynt', source: 'deckster', licence: 'CC0-1.0', by: 'Deckster' })
    expect(searchIcons(await loadIconCatalog('en'), { query: 'coin', source: 'deckster' }, 'en').map((i) => i.id)).toEqual(['deckster:mynt'])
  })
})

// The libraries are named in English and the designer may be building in Swedish (A4), so a short
// list of a game's words is translated before the search: «svärd» finds what «sword» finds.
describe('searching the icon catalog (#1087)', () => {
  const ids = async (query: string, lang: 'sv' | 'en' = 'sv', source: 'alla' | 'deckster' | 'game-icons' | 'lucide' = 'alla') => searchIcons(await loadIconCatalog(lang), { query, source }, lang).map((i) => i.id)

  it('finds an icon by any part of its name, in the reader’s own words as well as the library’s', async () => {
    expect(await ids('sword', 'en')).toContain('game-icons:broadsword')
    expect(await ids('svärd')).toContain('game-icons:crossed-swords')
    expect(await ids('sköld')).toContain('lucide:shield')
  })

  it('reads a keyword from its start, so a word inside another is not a hit', async () => {
    // Lucide files its key under «password»; a designer looking for a sword is not.
    expect(await ids('sword', 'en')).not.toContain('lucide:key')
    expect(await ids('love', 'en')).toContain('lucide:heart')
  })

  // Deckster's own symbols are searched as they always were (E4, A4): by name and by what they are
  // for, in any case, in the reader's own words — and not in another language's.
  it('finds the symbols drawn for the project by name and by what they are for, in the reader’s words', async () => {
    expect(await ids('sköld', 'sv', 'deckster')).toEqual(['deckster:skold'])
    expect(await ids('försvar', 'sv', 'deckster')).toEqual(['deckster:skold'])
    expect(await ids('SKÖL', 'sv', 'deckster')).toEqual(['deckster:skold'])
    expect(await ids('shield', 'en', 'deckster')).toEqual(['deckster:skold'])
    expect(await ids('defence', 'en', 'deckster')).toEqual(['deckster:skold'])
    expect(await ids('sköld', 'en', 'deckster')).toEqual([])
    expect(await ids('ingenting alls', 'sv')).toEqual([])
  })

  it('narrows to one library when one is chosen, and asks every word to match', async () => {
    expect((await ids('heart', 'en', 'lucide')).every((id) => id.startsWith('lucide:'))).toBe(true)
    expect(await ids('crossed swords', 'en')).toContain('game-icons:crossed-swords')
    expect(await ids('crossed hammer', 'en')).not.toContain('game-icons:crossed-swords')
  })
})

// The sources travel with the build, so they age, as the font list does (#370, L27): six months,
// then red, with the command that fixes it. And they are read against pinned packages, so a package
// moved on without the script being run again leaves icons without an author — which is a gate too,
// because the library would quietly offer fewer icons than it has.
describe('the age and reach of the icon sources (#1087)', () => {
  it('names the command that fixes it, and what the stamp says, once six months have passed', () => {
    expect(staleIconSourcesMessage('2026-04-22', new Date('2026-10-21T00:00:00Z'))).toBeNull()
    const message = staleIconSourcesMessage('2026-01-01', new Date('2026-10-21T00:00:00Z'))
    expect(message).toContain('2026-01-01')
    expect(message).toContain(ICON_SOURCES_COMMAND)
    expect(() => staleIconSourcesMessage('2026-02-31', new Date())).toThrow()
  })

  // The gate itself, which reads the wall clock on purpose.
  it('is not itself older than six months, as of whenever this run happens', async () => {
    const { ICON_SOURCES_GENERATED } = await import('../src/editor/icon-sources.js')
    expect(staleIconSourcesMessage(ICON_SOURCES_GENERATED, new Date())).toBeNull()
  })

  it('credits nearly every icon the pinned package holds, so a moved package is caught', async () => {
    const pinned = Object.keys((JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@iconify-json/game-icons/icons.json'), 'utf8')) as { icons: object }).icons)
    const offered = (await loadIconCatalog('sv')).filter((i) => i.source === 'game-icons').length
    // 66 of 4 134 have no single author that can be stated when this was written (#1087).
    expect(offered / pinned.length, `re-run \`${ICON_SOURCES_COMMAND}\``).toBeGreaterThan(0.97)
  })
})

// Every icon the catalog offers is uploaded as the game's own asset, and `POST /assets` holds every
// SVG to the allowlist (#1087). So the whole catalog has to pass it unchanged, or taking an icon in
// would be refused by the service the moment its bytes arrived.
describe('the catalog and the gate (#1087)', () => {
  it('offers nothing the service would refuse to store', async () => {
    const refused = (await loadIconCatalog('sv')).flatMap((icon) => {
      const why = svgRefusal(icon.svg)
      return why ? [`${icon.id}: ${why}`] : []
    })
    expect(refused).toEqual([])
  })
})
