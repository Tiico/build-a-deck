// Exemplen (L57, #632, L84): vad de är, att de håller E5:s egna mått, och vad en kopia av ett
// byter ut i spelets tema.
import { describe, expect, it } from 'vitest'
import { applyEdit } from '@byd/server/doc'
import { translate } from '../src/i18n/index.js'
import { THEMES, copyChanges, themeIntent, type Theme } from '../src/editor/themes.js'
import { ROLE_MIN_CONTRAST, paletteIssues } from '../src/editor/palette.js'
import { INKS } from '../src/editor/ThemePanel.js'
import { parseCatalog } from '../src/editor/font-catalog.js'
import { deckIssues } from '../src/editor/checks.js'
import { familyChoices } from '../src/editor/fonts.js'
import { contrastRatio } from '@byd/template'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc, ProjectFont } from '@byd/server'

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('sv', key, params)
const en = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('en', key, params)

// Familjerna som om de redan hämtats ur katalogen: en fil per familj, med katalogens licens.
const carried = (theme: Theme): Record<string, ProjectFont> =>
  Object.fromEntries(
    [theme.heading, theme.body].map((f, i) => [f.family, { stack: `"${f.family}", serif`, asset: `asset:${String(i).repeat(64)}`, licence: { licence: f.licence, by: f.by }, source: 'catalog' as const }]),
  )
const chosen = (doc: ProjectDoc, theme: Theme, tr = t): ProjectDoc => applyEdit(doc, themeIntent(doc, theme, carried(theme), tr))
const byId = (id: string): Theme => THEMES.find((th) => th.id === id) as Theme

describe('the ready-made themes (L57, #632)', () => {
  it('are the four the prototype approved, in its order', () => {
    expect(THEMES.map((th) => t(th.name))).toEqual(['Skogssaga', 'Ren', 'Retro', 'Krönika'])
  })

  for (const theme of THEMES) {
    describe(theme.id, () => {
      const palette = Object.fromEntries(theme.meanings.map((m) => [m.id, m.colour]))

      it('paints every meaning so a symbol clears 3:1 on the theme’s paper (E5)', () => {
        for (const m of theme.meanings) expect(contrastRatio(m.colour, theme.paper), m.id).toBeGreaterThanOrEqual(ROLE_MIN_CONTRAST)
      })

      it('has no two meanings that become one under simulated colour blindness (E5)', () => {
        expect(paletteIssues(palette, theme.paper)).toEqual([])
      })

      it('paints only in the inks the colour section offers', () => {
        const inks = INKS.map((ink) => ink.hex)
        for (const m of theme.meanings) expect(inks).toContain(m.colour)
      })

      // Raderna är katalogens egna, ordagrant: en omgenerering som flyttar en vikt syns här.
      it('takes both families out of the catalog verbatim', async () => {
        const { GOOGLE_FONTS } = await import('../src/editor/google-fonts.js')
        const listed = parseCatalog(GOOGLE_FONTS)
        for (const family of [theme.heading, theme.body]) expect(listed).toContainEqual(family)
      })

      // #420: temats familjer följer med som filer, så den fysiska kontrollen har ingenting att
      // säga om typsnitten på något kort.
      it('leaves no family the physical check would call loose', () => {
        const doc = chosen(projectDoc(), theme)
        expect(deckIssues(doc).filter((issue) => issue.code === 'unpinned-font')).toEqual([])
      })
    })
  }
})

describe('copying an example', () => {
  it('sets the prose in the body family and the rest in the heading family', () => {
    const doc = chosen(projectDoc(), byId('skogssaga'))
    const fonts = doc.template.faces['front']?.base.flatMap((el) => (el.kind === 'text' ? [[el.id, el.font.family]] : []))
    expect(Object.fromEntries(fonts ?? [])).toMatchObject({ title: 'Cinzel', body: 'EB Garamond' })
  })

  it('names the theme’s meanings in the designer’s language', () => {
    expect(Object.keys(chosen(projectDoc(), byId('skogssaga')).palette ?? {})).toEqual(['kostnad', 'vinst', 'försvar', 'anfall'])
    expect(Object.keys(chosen(projectDoc(), byId('skogssaga'), en).palette ?? {})).toEqual(['cost', 'gain', 'defence', 'attack'])
  })

  // Ett spel byggt på svenska och öppnat på engelska är samma spel: betydelsen heter det den hette.
  it('repaints a meaning the game already has under either language’s name, rather than adding a second', () => {
    const doc = chosen(chosen(projectDoc(), byId('skogssaga')), byId('retro'), en)
    expect(doc.palette).toEqual({ kostnad: '#8f2d20', vinst: '#7a5c00', försvar: '#155e75', anfall: '#6b2d5c' })
  })
})

describe('copying an example into the game’s theme (L84, #1287)', () => {
  it('leaves the game without any memory of the example it came from', () => {
    const doc = projectDoc()
    expect(themeIntent(doc, byId('skogssaga'), carried(byId('skogssaga')), t)).not.toHaveProperty('theme')
    expect(chosen({ ...doc, theme: { from: 'ren' } }, byId('skogssaga'))).not.toHaveProperty('theme')
  })

  it('says beforehand what it replaces: the families, the meanings it repaints or adds, and the icons it brings', () => {
    const doc = { ...projectDoc(), palette: { kostnad: '#8f2d20', vinst: '#155e75' } }
    expect(copyChanges(doc, byId('skogssaga'), t)).toEqual([
      { kind: 'heading', from: 'sans-serif', to: 'Cinzel' },
      { kind: 'body', from: 'sans-serif', to: 'EB Garamond' },
      { kind: 'colour', meaning: 'vinst', colour: '#2f6136' },
      { kind: 'meaning', meaning: 'försvar', colour: '#155e75' },
      { kind: 'meaning', meaning: 'anfall', colour: '#a8410c' },
      { kind: 'icons', names: ['mynt', 'sköld', 'svärd', 'hjärta', 'kristall', 'dra'] },
    ])
  })

  it('is nothing to replace once the game’s theme is already the example', () => {
    const doc = chosen(projectDoc(), byId('krönika'))
    expect(copyChanges({ ...doc, icons: { mynt: 'asset:x' } }, byId('krönika'), t)).toEqual([])
  })

  it('brings no icons into a game that has a set of its own, as the edit does not', () => {
    expect(copyChanges({ ...projectDoc(), icons: { blad: 'asset:x' } }, byId('ren'), t).filter((c) => c.kind === 'icons')).toEqual([])
  })
})

// #634 left the order of Mall's family list to one function; since L84 the game remembers no
// theme, so the head of the list is read off the cards themselves.
describe('the family a text layer is offered first in Mall (#634, L84)', () => {
  it('is the family the game’s headings are set in, then its text’s, then the game’s other typefaces', () => {
    const doc = chosen(projectDoc(), byId('krönika'))
    // A family of the designer's own that the game had before the theme, listed ahead of it.
    const fonts = { Min: { stack: '"Min", serif', asset: `asset:${'c'.repeat(64)}` }, ...doc.fonts }
    expect(familyChoices({ ...doc, fonts }, 'Lora').game).toEqual(['Lora', 'Merriweather', 'Min', 'system-ui'])
  })

  it('names a family only once when headings and text are set in the same', () => {
    const doc = chosen(projectDoc(), byId('ren'))
    expect(familyChoices(doc, 'Inter').game.filter((f) => f === 'Inter')).toHaveLength(1)
  })

  it('is the game’s own order when the cards are set in nothing the game carries', () => {
    expect(familyChoices(projectDoc(), 'sans-serif').game).toEqual(['sans-serif', 'system-ui'])
  })
})
