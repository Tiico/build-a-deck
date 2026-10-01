import { describe, expect, it } from 'vitest'
import { applyEdit, type EditIntent } from '../src/edits.js'
import { ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// Ett färdigt tema väljs (L57, #632): rubrikens och brödtextens familj, betydelserna och deras
// färger, och en startuppsättning ikoner — skrivet in i dokumentet som *en* redigering, så att
// temabytet är en version och ett steg tillbaka (B4).
const garamond = { stack: '"EB Garamond", serif', asset: 'asset:aaa', licence: { licence: 'OFL 1.1', by: 'Georg Duffner, Octavio Pardo' }, source: 'catalog' as const }
const cinzel = { stack: '"Cinzel", serif', asset: 'asset:bbb', licence: { licence: 'OFL 1.1', by: 'Natanael Gama' }, source: 'catalog' as const }
const inter = { stack: '"Inter", sans-serif', asset: 'asset:ccc', licence: { licence: 'OFL 1.1', by: 'Rasmus Andersson' }, source: 'catalog' as const }

const base = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: {
      faces: {
        front: {
          base: [
            { kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#f4ead8' },
            { kind: 'text', id: 'title', x: 5, y: 42, w: 53, h: 9, bind: { field: 'title' }, font: { family: 'EB Garamond', sizePt: 13, weight: 800 }, color: '#1c1c1c' },
            { kind: 'if', id: 'om', when: { field: 'body', nonEmpty: true }, children: [
              { kind: 'text', id: 'body', x: 5, y: 53, w: 53, h: 30, bind: { field: 'body' }, font: { family: 'EB Garamond', sizePt: 8.5 }, color: '#333' },
            ] },
          ],
          variants: {
            dyr: { override: [{ kind: 'text', id: 'title', x: 5, y: 42, w: 53, h: 9, bind: { field: 'title' }, font: { family: 'EB Garamond', sizePt: 12 }, color: '#000' }] },
          },
        },
        back: {
          base: [{ kind: 'group', id: 'g', x: 0, y: 0, children: [
            { kind: 'text', id: 'namn', x: 5, y: 40, w: 53, h: 9, bind: { literal: 'Skogens herrar' }, font: { family: 'EB Garamond', sizePt: 14 }, color: '#fff' },
          ] }],
          variants: {},
        },
      },
    },
    rows: [{ id: 'vaktare', fields: { title: 'Väktaren', body: 'Betala {mynt|kostnad}.', antal: 1 } }],
    icons: {},
    fonts: { 'EB Garamond': garamond },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

const skogssaga = (over: Partial<Extract<EditIntent, { v: 'setTheme' }>> = {}): Extract<EditIntent, { v: 'setTheme' }> => ({
  v: 'setTheme',
  theme: { from: 'skogssaga' },
  heading: 'Cinzel',
  body: 'EB Garamond',
  prose: ['body'],
  fonts: { Cinzel: cinzel, 'EB Garamond': garamond },
  palette: { kostnad: '#8f2d20', vinst: '#2f6136' },
  ...over,
})

type Els = ProjectDoc['template']['faces'][string]['base']
function families(els: Els): Record<string, string> {
  const out: Record<string, string> = {}
  for (const el of els) {
    if (el.kind === 'text') out[el.id] = el.font.family
    if (el.kind === 'if' || el.kind === 'group') Object.assign(out, families(el.children))
  }
  return out
}

describe('ett temabyte är en redigering (L57, #632)', () => {
  it('sätter prosan i brödtextens familj och allt annat i rubrikens, på varje sida, i villkor, grupper och varianter', () => {
    const doc = applyEdit(base(), skogssaga())
    expect(families(doc.template.faces['front']!.base)).toEqual({ title: 'Cinzel', body: 'EB Garamond' })
    expect(families(doc.template.faces['front']!.variants['dyr']!.override ?? [])).toEqual({ title: 'Cinzel' })
    expect(families(doc.template.faces['back']!.base)).toEqual({ namn: 'Cinzel' })
  })

  it('rör bara familjen: grad, vikt och färg står kvar', () => {
    const doc = applyEdit(base(), skogssaga())
    const title = doc.template.faces['front']!.base.find((el) => el.id === 'title')
    expect(title).toMatchObject({ font: { family: 'Cinzel', sizePt: 13, weight: 800 }, color: '#1c1c1c' })
  })

  it('minns vilket tema spelet utgår från, och dokumentet läser tillbaka med det', () => {
    const doc = applyEdit(base(), skogssaga())
    expect(doc.theme).toEqual({ from: 'skogssaga' })
    expect(ProjectDoc.parse(doc).theme).toEqual({ from: 'skogssaga' })
  })

  it('bär temats familjer som spelets egna filer (#420)', () => {
    const doc = applyEdit(base(), skogssaga())
    expect(doc.fonts).toEqual({ Cinzel: cinzel, 'EB Garamond': garamond })
  })

  it('tar bort en familj bytet tog av korten, men låter en familj ingen text stod i stå kvar', () => {
    const egen = { stack: '"Min", serif', asset: 'asset:ddd' }
    const was = { ...base(), fonts: { 'EB Garamond': garamond, Min: egen } }
    const doc = applyEdit(was, skogssaga({ theme: { from: 'ren' }, heading: 'Inter', body: 'Inter', fonts: { Inter: inter } }))
    expect(doc.fonts).toEqual({ Inter: inter, Min: egen })
  })

  it('målar temats betydelser och låter spelets egna stå kvar', () => {
    const doc = applyEdit({ ...base(), palette: { kostnad: '#000000', magi: '#6b2d5c' } }, skogssaga())
    expect(doc.palette).toEqual({ kostnad: '#8f2d20', vinst: '#2f6136', magi: '#6b2d5c' })
  })

  it('tar in startikonerna med sina licenser', () => {
    const doc = applyEdit(base(), skogssaga({ icons: { mynt: { url: 'asset:eee', credit: { licence: 'CC0-1.0', by: 'build-your-deck', source: 'mynt' } } } }))
    expect(doc.icons).toEqual({ mynt: 'asset:eee' })
    expect(doc.credits).toEqual({ mynt: { licence: 'CC0-1.0', by: 'build-your-deck', source: 'mynt' } })
  })

  it('vägrar en familj som varken följer med bytet eller redan finns i spelet', () => {
    expect(() => applyEdit(base(), skogssaga({ fonts: { 'EB Garamond': garamond } }))).toThrow(/Cinzel/)
  })

  it('vägrar en betydelse kortet inte kan skriva', () => {
    expect(() => applyEdit(base(), skogssaga({ palette: { 'två ord': '#8f2d20' } }))).toThrow()
  })
})
