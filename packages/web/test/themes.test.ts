// De färdiga temana (L57, #632): vad de är, att de håller E5:s egna mått, och vad ett spel som
// valt ett av dem avviker med.
import { describe, expect, it } from 'vitest'
import { applyEdit } from '@byd/server/doc'
import { translate } from '../src/i18n/index.js'
import { THEMES, departures, sayDeparture, themeIntent, themeOf, type Theme } from '../src/editor/themes.js'
import { ROLE_MIN_CONTRAST, paletteIssues } from '../src/editor/palette.js'
import { INKS } from '../src/editor/ThemePanel.js'
import { parseCatalog } from '../src/editor/font-catalog.js'
import { deckIssues } from '../src/editor/checks.js'
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
const said = (doc: ProjectDoc): string[] => departures(doc).map((d) => sayDeparture(d, 'sv'))
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

describe('choosing a theme', () => {
  it('sets the prose in the body family and the rest in the heading family', () => {
    const doc = chosen(projectDoc(), byId('skogssaga'))
    const fonts = doc.template.faces['front']?.base.flatMap((el) => (el.kind === 'text' ? [[el.id, el.font.family]] : []))
    expect(Object.fromEntries(fonts ?? [])).toMatchObject({ title: 'Cinzel', body: 'EB Garamond' })
    expect(themeOf(doc)?.id).toBe('skogssaga')
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

describe('what departs from the chosen theme', () => {
  it('is nothing for a game that has just chosen it', () => {
    expect(said(chosen(projectDoc(), byId('skogssaga')))).toEqual([])
  })

  it('is nothing to say for a game that has chosen no theme', () => {
    expect(said(projectDoc())).toEqual([])
  })

  it('names a heading set in another family, and a meaning painted in another colour', () => {
    const doc = chosen(projectDoc(), byId('skogssaga'))
    const front = doc.template.faces['front']
    const moved: ProjectDoc = {
      ...doc,
      palette: { ...doc.palette, vinst: '#155e75' },
      template: { faces: { ...doc.template.faces, front: { ...front!, base: front!.base.map((el) => (el.kind === 'text' && el.id === 'title' ? { ...el, font: { ...el.font, family: 'Lora' } } : el)) } } },
    }
    expect(said(moved)).toEqual(['rubrik Lora', 'vinsts färg'])
  })

  it('names a meaning of the theme that the game no longer has', () => {
    const doc = chosen(projectDoc(), byId('ren'))
    const { anfall: _gone, ...palette } = doc.palette ?? {}
    expect(said({ ...doc, palette })).toEqual(['utan anfall'])
  })

  it('is nothing again once the theme is chosen anew — which is what Återställ does', () => {
    const doc = chosen(projectDoc(), byId('krönika'))
    const moved = { ...doc, palette: { ...doc.palette, kostnad: '#1c1c1c' } }
    expect(said(moved)).toHaveLength(1)
    expect(said(chosen(moved, byId('krönika')))).toEqual([])
  })
})
