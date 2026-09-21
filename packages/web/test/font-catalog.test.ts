import { describe, expect, it } from 'vitest'
import { fileInSheet, fileSheetHref, isVariable, parseCatalog, sampleSheetHref, searchCatalog } from '../src/editor/font-catalog.js'

// Google Fonts as the picker reads it (#329, L27). The list itself is data the build carries —
// nothing is asked of Google until the designer opens the picker — so what is worth a test is
// what the list is read as and what a search does to it.
const ROWS = ['Cinzel|display|OFL 1.1|Natanael Gama|400..900', 'EB Garamond|serif|OFL 1.1|Georg Duffner|400..800', 'Roboto|sans|Apache 2.0|Christian Robertson|400;700', 'Space Mono|mono|OFL 1.1|Colophon Foundry|400;700'].join('\n')

describe('the catalog the picker searches (L27)', () => {
  it('reads a family with its category, its licence, who drew it, and whether it is variable', () => {
    expect(parseCatalog(ROWS)[0]).toEqual({ family: 'Cinzel', category: 'display', licence: 'OFL 1.1', by: 'Natanael Gama', weights: '400..900' })
    expect(parseCatalog(ROWS)[2]).toEqual({ family: 'Roboto', category: 'sans', licence: 'Apache 2.0', by: 'Christian Robertson', weights: '400;700' })
  })

  it('finds a family by a piece of its name, whatever case it is written in', () => {
    expect(searchCatalog(parseCatalog(ROWS), { query: 'garamond', category: 'alla' }).map((f) => f.family)).toEqual(['EB Garamond'])
  })

  it('narrows to a category, and takes the whole catalog when none is chosen', () => {
    const all = parseCatalog(ROWS)
    expect(searchCatalog(all, { query: '', category: 'serif' }).map((f) => f.family)).toEqual(['EB Garamond'])
    expect(searchCatalog(all, { query: '', category: 'alla' })).toHaveLength(4)
  })
})

// The samples are the real faces and not an imitation, which is the whole of why the prototype
// was believed: the row the designer reads is drawn in the family she is about to take. One
// stylesheet for the page of hits, asked for when the picker opens and never before (L27).
describe('the sheet the samples are drawn with', () => {
  it('asks for every family shown, by the weights it has, in one request', () => {
    expect(sampleSheetHref(parseCatalog(ROWS))).toBe(
      'https://fonts.googleapis.com/css2?family=Cinzel:wght@400..900&family=EB+Garamond:wght@400..800&family=Roboto:wght@400;700&family=Space+Mono:wght@400;700&display=swap',
    )
  })

  it('asks for nothing at all when nothing is shown, rather than for an empty sheet', () => {
    expect(sampleSheetHref([])).toBeNull()
  })
})

// The file the project keeps. L27 is explicit: when the family has a weight axis the whole
// variable file comes down, not the weights this template happens to use — choosing a new weight
// a year from now must not need Google, and an archived project cannot reach it.
describe('the file a chosen family is copied from (L27)', () => {
  const css = (family: string, weight: string, name: string) => `/* latin-ext */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/x/${name}-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA;
}
/* latin */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/x/${name}.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
`

  it('asks for the whole weight axis of a variable family', () => {
    expect(fileSheetHref(parseCatalog(ROWS)[0]!)).toBe('https://fonts.googleapis.com/css2?family=Cinzel:wght@400..900&display=swap')
  })

  // A static family is several files and the project holds one asset, so asking for all of them
  // would be asking which one to throw away. It is the regular, exactly as an uploaded file is
  // whatever single file the designer dropped.
  it('asks for the regular of a family drawn in separate weights', () => {
    expect(fileSheetHref(parseCatalog(ROWS)[2]!)).toBe('https://fonts.googleapis.com/css2?family=Roboto:wght@400&display=swap')
  })

  it('takes the latin cut out of what Google answers, and not the first block it meets', () => {
    expect(fileInSheet(css('Cinzel', '400 900', 'cinzel'))).toBe('https://fonts.gstatic.com/s/x/cinzel.woff2')
  })

  it('says the catalog did not answer when the sheet holds no file at all', () => {
    expect(() => fileInSheet('/* nothing */')).toThrow()
  })
})

// The generated list itself. Not its contents — those are Google's and change — but the shape
// the picker depends on, so a botched regeneration is caught here and not by an empty picker.
describe('the list the build carries', () => {
  it('reads back as families with a licence, a name and weights to ask for', async () => {
    const { GOOGLE_FONTS } = await import('../src/editor/google-fonts.js')
    const all = parseCatalog(GOOGLE_FONTS)
    expect(all.length).toBeGreaterThan(1000)
    expect(all.filter((f) => f.licence === '' || f.by === '' || f.weights === '')).toEqual([])
    expect([...new Set(all.map((f) => f.category))].sort()).toEqual(['display', 'handskrift', 'mono', 'sans', 'serif'])
    // The one family the approved prototype set the card in, with the axis L27 is about.
    expect(all.find((f) => f.family === 'Cinzel')).toMatchObject({ category: 'serif', licence: 'OFL 1.1', by: 'Natanael Gama' })
    expect(isVariable(all.find((f) => f.family === 'Cinzel')!)).toBe(true)
  })
})
