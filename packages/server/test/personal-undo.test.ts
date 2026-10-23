import { describe, expect, it } from 'vitest'
import { applyEdit, columnsOf, decideEdit, type EditIntent } from '../src/edits.js'
import { stamp, type ProjectDoc } from '../src/projects.js'
import { openingSetup } from '../src/recipe.js'
import { changeOf, joined, revertOf, type Change } from '../src/undo.js'
import type { Element } from '@byd/template'

// Personlig ångra i editorn (#1056, L14, D3). Ett steg tillbaka tar bara tillbaka det redigeringen
// själv ändrade, som en `revert` av just de delarna, och lämnar det en medredigerare ändrat sedan
// dess. Har någon annan ändrat just det som ska tas tillbaka vägras ångrandet i stället för att
// skriva över.
const game = (): ProjectDoc => ({
  name: 'Skogens herrar',
  template: {
    faces: {
      front: {
        base: [
          { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8' },
          { kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14 }, color: '#111' },
          { kind: 'text', id: 'body', x: 5, y: 30, w: 53, h: 40, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#222' },
        ],
        variants: {},
      },
    },
  },
  rows: [
    { id: 'kort-1', fields: { title: 'Björn', body: 'Rad 1.', antal: 1 } },
    { id: 'kort-2', fields: { title: 'Varg', body: 'Rad 2.', antal: 1 } },
    { id: 'kort-3', fields: { title: 'Räv', body: 'Rad 3.', antal: 1 } },
  ],
  icons: {},
  rules: {
    title: 'Skogens herrar',
    blocks: [
      { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
      { kind: 'text', id: 't1', text: 'Första stycket.' },
      { kind: 'text', id: 't2', text: 'Andra stycket.' },
    ],
  },
  setup: openingSetup({ players: 2, counters: [{ name: 'Liv', start: 20 }] }),
})

// Ada gör `mine` på `doc`, Bo gör sedan `theirs`, och Ada ångrar. Svaret är dokumentet efter
// ångrandet, eller vad som vägrades.
function undone(doc: ProjectDoc, mine: EditIntent, theirs: EditIntent[]): { doc: ProjectDoc; change: Change } | { refused: string[][] } {
  const after = applyEdit(doc, mine)
  const change = changeOf(doc, after)
  const now = theirs.reduce(applyEdit, after)
  const back = revertOf(change, now)
  if (!back.ok) return { refused: back.conflicts }
  return { doc: back.edit ? applyEdit(now, back.edit) : now, change }
}
const docOf = (r: ReturnType<typeof undone>): ProjectDoc => {
  if (!('doc' in r)) throw new Error(`refused: ${JSON.stringify(r.refused)}`)
  return r.doc
}
const bo = (text: string): EditIntent => ({ v: 'spliceRules', replace: ['t2'], after: null, blocks: [{ kind: 'text', id: 't2', text }] })

describe('ångra tar bara tillbaka det egna (#1056)', () => {
  it('tar tillbaka Adas cell och lämnar Bos stycke i Regler', () => {
    const doc = game()
    const back = docOf(undone(doc, { v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Ada.' }, [bo('Bo.')]))
    expect(stamp(back)).toBe(stamp(applyEdit(doc, bo('Bo.'))))
  })

  it('vägrar när Bo har ändrat samma cell sedan dess, och säger vilken', () => {
    const r = undone(game(), { v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Ada.' }, [{ v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Bo.' }])
    expect(r).toEqual({ refused: [['rows', 'kort-1', 'fields', 'body']] })
  })

  it('tar tillbaka Adas cell när Bo skrev i en annan kolumn på samma kort', () => {
    const doc = game()
    const bos: EditIntent = { v: 'setCell', cardRef: 'kort-1', field: 'title', value: 'Bo.' }
    const back = docOf(undone(doc, { v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Ada.' }, [bos]))
    expect(stamp(back)).toBe(stamp(applyEdit(doc, bos)))
  })

  it('har inget att göra när Bo redan har skrivit tillbaka det Ada ändrade', () => {
    const doc = game()
    const after = applyEdit(doc, { v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Ada.' })
    const now = applyEdit(after, { v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Rad 1.' })
    expect(revertOf(changeOf(doc, after), now)).toEqual({ ok: true, edit: null })
  })
})

// Ett spel som har något av allt en redigering kan röra: en grupp med egen formgivning, symboler med
// licens, färger, bilder, typsnitt, ett prosaval och en egen kolumnordning.
const HASH = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const rich = (): ProjectDoc => {
  const doc = game()
  const front = doc.template.faces['front']!
  return {
    ...doc,
    template: {
      faces: {
        ...doc.template.faces,
        front: { ...front, variantBy: 'typ', variants: { eld: { override: [{ ...front.base[1]!, color: '#c00' } as Element], remove: ['frame'] } } },
      },
    },
    rows: doc.rows.map((r) => ({ ...r, fields: { ...r.fields, typ: 'eld', bild: `asset:${HASH}` } })),
    columns: ['title', 'body', 'typ', 'bild', 'antal'],
    icons: { sol: `asset:${OTHER}`, mane: `asset:${OTHER}` },
    credits: { sol: { licence: 'CC0', by: 'Ada' } },
    palette: { eld: '#c00', vatten: '#00c' },
    pictures: { [HASH]: { name: 'skog.png' } },
    prose: { body: true },
    fonts: { 'sans-serif': { stack: 'sans-serif' }, Cinzel: { stack: 'Cinzel, serif' } },
  }
}
const image: Element = { kind: 'image', id: 'bild', x: 5, y: 16, w: 53, h: 12, bind: { field: 'bild' } } as Element

// Varje redigering i vokabuläret, gjord av Ada på `rich()`, och vad Bo gör efter henne i en annan del
// av spelet. Nyckeln är verbet, så en redigering som läggs till utan att stå här är ett typfel.
// Allt i spelet som har en ordning, i den ordningen.
const orders = (doc: ProjectDoc) => ({
  rows: doc.rows.map((r) => [r.id, ...Object.keys(r.fields)]),
  faces: Object.entries(doc.template.faces).map(([id, f]) => [id, f.base.map((e) => e.id), Object.entries(f.variants).map(([g, v]) => [g, (v.override ?? []).map((e) => e.id)])]),
  blocks: doc.rules?.blocks.map((b) => b.id),
  zones: doc.setup.zones.map((z) => z.id),
  maps: [doc.icons, doc.credits, doc.palette, doc.pictures, doc.prose, doc.fonts].map((m) => (m ? Object.keys(m) : null)),
})
const BO_CELL: EditIntent = { v: 'setCell', cardRef: 'kort-3', field: 'title', value: 'Bo.' }
const EVERY: Record<EditIntent['v'], { mine: (doc: ProjectDoc) => EditIntent; theirs?: EditIntent; start?: (doc: ProjectDoc) => ProjectDoc }> = {
  rename: { mine: () => ({ v: 'rename', name: 'Skogens damer' }) },
  setCell: { mine: () => ({ v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Ada.' }) },
  addRow: { mine: () => ({ v: 'addRow', cardRef: 'kort-4', fields: { title: 'Lo' } }) },
  removeRow: { mine: () => ({ v: 'removeRow', cardRef: 'kort-2' }) },
  replaceRows: { mine: (doc) => ({ v: 'replaceRows', rows: [...doc.rows].reverse().slice(1) }) },
  addField: { mine: () => ({ v: 'addField', field: 'kraft', bind: { face: 'front', id: 'title' } }) },
  removeField: { mine: () => ({ v: 'removeField', field: 'body' }) },
  renameField: { mine: () => ({ v: 'renameField', from: 'body', to: 'text' }) },
  setProse: { mine: () => ({ v: 'setProse', field: 'body', prose: null }) },
  setColumnKind: { mine: () => ({ v: 'setColumnKind', field: 'body', kind: 'image' }) },
  moveField: { mine: () => ({ v: 'moveField', field: 'typ', before: 'title' }) },
  patchElement: { mine: () => ({ v: 'patchElement', face: 'front', id: 'title', patch: { x: 9, name: 'Rubrik' } }) },
  addElement: { mine: () => ({ v: 'addElement', face: 'front', element: image, icon: { name: 'stjarna', url: `asset:${OTHER}`, credit: { licence: 'CC0', by: 'Ada' } } }) },
  removeElement: { mine: () => ({ v: 'removeElement', face: 'front', id: 'frame' }) },
  moveElement: { mine: () => ({ v: 'moveElement', face: 'front', id: 'body', to: 0 }) },
  replaceFace: { mine: () => ({ v: 'replaceFace', face: 'back', base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' } as Element] }) },
  resetElement: { mine: () => ({ v: 'resetElement', face: 'front', id: 'title', group: 'eld' }) },
  setGroupColumn: { mine: () => ({ v: 'setGroupColumn', column: null }) },
  setRecipe: { mine: () => ({ v: 'setRecipe', recipe: { players: 3, counters: [{ name: 'Liv', start: 20 }, { name: 'Guld', start: 0 }] } }) },
  setDice: { mine: () => ({ v: 'setDice', dice: [{ faces: 6, count: 2, role: 'mine' }, { faces: 20, count: 1, zone: 'table', perSeat: true }] }) },
  addZone: { mine: () => ({ v: 'addZone', id: 'hog-1', kind: 'pile', name: 'Hög 1' }) },
  removeZone: { mine: () => ({ v: 'removeZone', id: 'discard' }) },
  addSeatZone: {
    start: (doc) => ['mine:A', 'mine:B'].reduce((d, id) => applyEdit(d, { v: 'removeZone', id }), doc),
    mine: () => ({ v: 'addSeatZone', role: 'mine', name: 'Framför {seat}' }),
  },
  insertZone: { mine: (doc) => ({ v: 'insertZone', zone: { ...doc.setup.zones.find((z) => z.id === 'discard')!, id: 'discard-2' } }) },
  setDeck: { mine: () => ({ v: 'setDeck', id: 'discard' }) },
  patchZone: { mine: () => ({ v: 'patchZone', id: 'draw', patch: { name: 'Dragbunten', shortcut: null } }) },
  setIcon: { mine: () => ({ v: 'setIcon', name: 'mane', url: `asset:${HASH}`, credit: { licence: 'CC-BY', by: 'Bo' } }) },
  renameIcon: { mine: () => ({ v: 'renameIcon', from: 'sol', to: 'solen' }) },
  removeIcon: { mine: () => ({ v: 'removeIcon', name: 'sol' }) },
  setRules: { mine: () => ({ v: 'setRules', rules: { title: 'Nya regler', blocks: [{ kind: 'text', id: 'n1', text: 'Allt nytt.' }] } }), theirs: BO_CELL },
  spliceRules: { mine: () => ({ v: 'spliceRules', replace: ['t1'], after: null, blocks: [{ kind: 'text', id: 't1', text: 'Ada.' }, { kind: 'text', id: 'x9', text: 'Mer.' }] }) },
  setRole: { mine: () => ({ v: 'setRole', role: 'jord', colour: '#640' }) },
  renameRole: { mine: () => ({ v: 'renameRole', from: 'eld', to: 'brand' }) },
  removeRole: { mine: () => ({ v: 'removeRole', role: 'vatten' }) },
  setCrop: { mine: () => ({ v: 'setCrop', hash: HASH, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }) },
  addPicture: { mine: () => ({ v: 'addPicture', hash: OTHER, name: 'berg.png' }) },
  removePicture: { mine: () => ({ v: 'removePicture', hash: HASH }) },
  setFont: { mine: () => ({ v: 'setFont', family: 'Lora', font: { stack: 'Lora, serif' } }) },
  removeFont: { mine: () => ({ v: 'removeFont', family: 'Cinzel' }) },
  setTheme: { mine: () => ({ v: 'setTheme', theme: { from: 'skogssaga' }, heading: 'Cinzel', body: 'Lora', prose: ['body'], fonts: { Lora: { stack: 'Lora, serif' } }, palette: { kostnad: '#8f2d20' }, icons: { blad: { url: `asset:${HASH}` } } }) },
  restore: { mine: (doc) => ({ v: 'restore', doc: { ...game(), name: doc.name } }) },
  compound: { mine: () => ({ v: 'compound', edits: [{ v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Ada.' }, { v: 'removeRow', cardRef: 'kort-2' }, { v: 'rename', name: 'Skogen' }] }) },
  // Ett steg tillbaka är också en redigering, och gör om är dess invers.
  revert: {
    mine: (doc) => {
      const step = revertOf(changeOf(applyEdit(doc, { v: 'rename', name: 'Före' }), doc), doc)
      if (!step.ok || !step.edit) throw new Error('no step')
      return step.edit
    },
  },
}

describe('varje redigering i vokabuläret har en invers (#1056)', () => {
  for (const [v, { mine, theirs = bo('Bo.'), start = (d: ProjectDoc) => d }] of Object.entries(EVERY)) {
    it(`${v}: ångra tar bara tillbaka Adas, och gör om lägger den tillbaka`, () => {
      const doc = start(rich())
      const edit = mine(doc)
      const after = applyEdit(doc, edit)
      const change = changeOf(doc, after)
      expect(change.parts.size + change.orders.size, 'the edit changed something').toBeGreaterThan(0)
      const now = applyEdit(after, theirs)

      const back = revertOf(change, now)
      if (!back.ok) throw new Error(`refused: ${JSON.stringify(back.conflicts)}`)
      expect(back.edit).not.toBeNull()
      const undoneDoc = applyEdit(now, back.edit!)
      expect(stamp(undoneDoc)).toBe(stamp(applyEdit(doc, theirs)))
      // Ordningen också, som `stamp` inte ser: korten, lagren, blocken, zonerna och posterna står där de stod.
      expect(orders(undoneDoc)).toEqual(orders(applyEdit(doc, theirs)))

      const forward = revertOf(changeOf(now, undoneDoc), undoneDoc)
      if (!forward.ok) throw new Error(`refused: ${JSON.stringify(forward.conflicts)}`)
      expect(stamp(applyEdit(undoneDoc, forward.edit!))).toBe(stamp(now))
    })
  }
})

describe('var en post står, och vems den är (#1056)', () => {
  const rows = (doc: ProjectDoc) => doc.rows.map((r) => r.id)

  it('lägger tillbaka ett borttaget kort där det stod, också när Bo har lagt till ett efter', () => {
    const doc = game()
    const back = docOf(undone(doc, { v: 'removeRow', cardRef: 'kort-2' }, [{ v: 'addRow', cardRef: 'kort-4', fields: { title: 'Lo' } }]))
    expect(rows(back)).toEqual(['kort-1', 'kort-2', 'kort-3', 'kort-4'])
    expect(back.rows[1]).toEqual(doc.rows[1])
  })

  it('lägger tillbaka ett borttaget kort efter det närmaste som står kvar, när Bo har tagit bort det före', () => {
    const back = docOf(undone(game(), { v: 'removeRow', cardRef: 'kort-2' }, [{ v: 'removeRow', cardRef: 'kort-1' }]))
    expect(rows(back)).toEqual(['kort-2', 'kort-3'])
  })

  it('vägrar ta bort Adas nya kort när Bo har skrivit i det', () => {
    const r = undone(game(), { v: 'addRow', cardRef: 'kort-4', fields: { title: 'Lo' } }, [{ v: 'setCell', cardRef: 'kort-4', field: 'body', value: 'Bo.' }])
    expect(r).toEqual({ refused: [['rows', 'kort-4']] })
  })

  it('flyttar tillbaka Adas lager när Bo har flyttat ett annat, men inte när Bo har flyttat samma', () => {
    const doc = game()
    const ids = (d: ProjectDoc) => d.template.faces['front']!.base.map((e) => e.id)
    const mine: EditIntent = { v: 'moveElement', face: 'front', id: 'body', to: 0 }
    expect(ids(docOf(undone(doc, mine, [{ v: 'addElement', face: 'front', element: image }])))).toEqual(['frame', 'title', 'body', 'bild'])
    expect(undone(doc, mine, [{ v: 'moveElement', face: 'front', id: 'body', to: 2 }])).toEqual({ refused: [['template', 'faces', 'front', 'base', 'body']] })
  })

  it('låter regelboken stå kvar med Bos block när Ada ångrar att hon påbörjade den', () => {
    const { rules: _rules, ...doc } = game()
    const mine: EditIntent = { v: 'spliceRules', replace: [], after: null, blocks: [{ kind: 'text', id: 'a1', text: 'Ada.' }], title: 'Regler' }
    const back = docOf(undone(doc, mine, [{ v: 'spliceRules', replace: [], after: 'a1', blocks: [{ kind: 'text', id: 'b1', text: 'Bo.' }] }]))
    expect(back.rules).toEqual({ title: 'Regler', blocks: [{ kind: 'text', id: 'b1', text: 'Bo.' }] })
  })

  it('tar bort regelboken helt när ingen annan har skrivit i den', () => {
    const { rules: _rules, ...doc } = game()
    const back = docOf(undone(doc, { v: 'spliceRules', replace: [], after: null, blocks: [{ kind: 'text', id: 'a1', text: 'Ada.' }] }, [BO_CELL]))
    expect(stamp(back)).toBe(stamp(applyEdit(doc, BO_CELL)))
  })
})

describe('ett grepp är ett steg, och aktören prövar steget mot sanningen (#1056)', () => {
  it('slår ihop ett grepps redigeringar till ett steg som går tillbaka till där greppet började', () => {
    const doc = game()
    const one = applyEdit(doc, { v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'A' })
    const two = applyEdit(one, { v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Ad' })
    const step = joined(changeOf(doc, one), changeOf(one, two))
    const back = revertOf(step, two)
    expect(back.ok && back.edit && applyEdit(two, back.edit).rows[0]?.fields['body']).toBe('Rad 1.')
  })

  it('vägrar ett steg tillbaka när någon hann ändra delen innan steget nådde aktören', () => {
    const doc = game()
    const after = applyEdit(doc, { v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Ada.' })
    const back = revertOf(changeOf(doc, after), after)
    if (!back.ok || !back.edit) throw new Error('no step')
    const raced = applyEdit(after, { v: 'setCell', cardRef: 'kort-1', field: 'body', value: 'Bo.' })
    expect(() => applyEdit(raced, back.edit!)).toThrow(/has changed since/)
  })

  it('vägrar ta bort en post som någon hann lägga något i innan steget nådde aktören', () => {
    const doc = game()
    const after = applyEdit(doc, { v: 'addRow', cardRef: 'kort-4', fields: { title: 'Lo' } })
    const back = revertOf(changeOf(doc, after), after)
    if (!back.ok || !back.edit) throw new Error('no step')
    const raced = applyEdit(after, { v: 'setCell', cardRef: 'kort-4', field: 'body', value: 'Bo.' })
    expect(() => applyEdit(raced, back.edit!)).toThrow(/someone else wrote/)
  })

  // Kapplöpningen i #1070: Adas editor prövar steget mot sin kopia, där ingen annan har flyttat
  // något, och skickar det. Innan det når aktören har Bos flytt av samma sak landat där. Aktören
  // ska då vägra, inte flytta tillbaka över Bo.
  const zonesWith = (doc: ProjectDoc, first: string): EditIntent => {
    const zones = doc.setup.zones
    return { v: 'restore', doc: { ...doc, setup: { ...doc.setup, zones: [zones.find((z) => z.id === first)!, ...zones.filter((z) => z.id !== first)] } } }
  }
  const rowsAs = (doc: ProjectDoc, ids: string[]): EditIntent => ({ v: 'replaceRows', rows: ids.map((id) => doc.rows.find((r) => r.id === id)!) })
  const discard = (doc: ProjectDoc) => doc.setup.zones.find((z) => z.id === 'discard')!
  const RACES: { what: string; mine: (doc: ProjectDoc) => EditIntent; theirs: (doc: ProjectDoc) => EditIntent; order: (doc: ProjectDoc) => unknown }[] = [
    { what: 'ett kort', mine: (doc) => rowsAs(doc, ['kort-2', 'kort-3', 'kort-1']), theirs: (doc) => rowsAs(doc, ['kort-2', 'kort-1', 'kort-3']), order: (doc) => doc.rows.map((r) => r.id) },
    { what: 'ett lager', mine: () => ({ v: 'moveElement', face: 'front', id: 'body', to: 0 }), theirs: () => ({ v: 'moveElement', face: 'front', id: 'body', to: 1 }), order: (doc) => doc.template.faces['front']!.base.map((e) => e.id) },
    {
      what: 'en zon',
      mine: (doc) => ({ v: 'compound', edits: [{ v: 'removeZone', id: 'discard' }, { v: 'insertZone', zone: discard(doc) }] }),
      theirs: (doc) => zonesWith(doc, 'discard'),
      order: (doc) => doc.setup.zones.map((z) => z.id),
    },
    { what: 'kolumnordningen', mine: () => ({ v: 'moveField', field: 'typ', before: 'title' }), theirs: () => ({ v: 'moveField', field: 'typ', before: 'bild' }), order: (doc) => doc.columns },
  ]
  for (const { what, mine, theirs, order } of RACES) {
    it(`vägrar flytta tillbaka ${what} som någon hann flytta innan steget nådde aktören (#1070)`, () => {
      const doc = rich()
      const after = applyEdit(doc, mine(doc))
      const back = revertOf(changeOf(doc, after), after)
      if (!back.ok || !back.edit) throw new Error('no step')
      const raced = applyEdit(after, theirs(after))
      expect(order(raced)).not.toEqual(order(after))
      expect(() => applyEdit(raced, back.edit!)).toThrow(/since/)
    })
  }

  it('flyttar tillbaka Adas lager när det som hann före var ett annat lager som lades till (#1070)', () => {
    const doc = game()
    const after = applyEdit(doc, { v: 'moveElement', face: 'front', id: 'body', to: 0 })
    const back = revertOf(changeOf(doc, after), after)
    if (!back.ok || !back.edit) throw new Error('no step')
    const raced = applyEdit(after, { v: 'addElement', face: 'front', element: image })
    expect(applyEdit(raced, back.edit).template.faces['front']!.base.map((e) => e.id)).toEqual(['frame', 'title', 'body', 'bild'])
  })

  it('läser ingen väg som når förbi spelet', () => {
    expect(() => applyEdit(game(), { v: 'revert', parts: [{ at: ['__proto__', 'x'], to: 1 }] })).toThrow(/no part of a game/)
    expect(() => applyEdit(game(), { v: 'revert', parts: [{ at: ['name', 'x'], to: 1 }] })).toThrow(/no part of a game/)
  })
})

// En ny kolumn skriver en tom cell i varje kort (#1069). Den tomma cellen är ingenting någon har
// skrivit i Adas kort, så kortet hon lade till går att ångra; ett värde Bo har skrivit i det gör det inte.
describe('en tom cell är ingenting någon skrev (#1069)', () => {
  const rows = (doc: ProjectDoc) => doc.rows.map((r) => r.id)
  const ADDS: EditIntent = { v: 'addRow', cardRef: 'kort-4', fields: { title: '', antal: 1 } }
  const COLUMN: EditIntent = { v: 'addField', field: 'kraft' }

  it('tar bort Adas nya kort fast Bo har lagt till en kolumn sedan, och Bos kolumn står kvar', () => {
    const doc = game()
    const back = docOf(undone(doc, ADDS, [COLUMN]))
    expect(rows(back)).toEqual(['kort-1', 'kort-2', 'kort-3'])
    expect(stamp(back)).toBe(stamp(applyEdit(doc, COLUMN)))
  })

  it('vägrar när Bo har skrivit ett värde i den nya kolumnen på Adas kort', () => {
    const r = undone(game(), ADDS, [COLUMN, { v: 'setCell', cardRef: 'kort-4', field: 'kraft', value: '3' }])
    expect(r).toEqual({ refused: [['rows', 'kort-4']] })
  })

  it('vägrar när Adas kort är det enda som bär Bos kolumn, så att kolumnen inte går med kortet', () => {
    const r = undone({ ...game(), rows: [] }, ADDS, [COLUMN])
    expect(r).toEqual({ refused: [['rows', 'kort-4']] })
  })

  // Åt andra hållet: kortet som läggs tillbaka tar inte med sig en tom cell i en kolumn som inget
  // annat kort längre har. Annars kom en kolumn Bo har tagit bort tillbaka, tom, med Adas kort.
  it('gör om lägger tillbaka Adas kort utan Bos kolumn när Bo har tagit bort den efter att Ada ångrat', () => {
    const doc = game()
    const added = applyEdit(doc, ADDS)
    const widened = applyEdit(added, COLUMN)
    const back = revertOf(changeOf(doc, added), widened)
    if (!back.ok || !back.edit) throw new Error('no step')
    const undoneDoc = applyEdit(widened, back.edit)
    const narrowed = applyEdit(undoneDoc, { v: 'removeField', field: 'kraft' })
    const forward = revertOf(changeOf(widened, undoneDoc), narrowed)
    if (!forward.ok || !forward.edit) throw new Error('no step forward')
    const redone = applyEdit(narrowed, forward.edit)
    expect(rows(redone)).toEqual(['kort-1', 'kort-2', 'kort-3', 'kort-4'])
    expect(columnsOf(redone)).not.toContain('kraft')
    expect(redone.rows[3]).toEqual({ id: 'kort-4', fields: { title: '', antal: 1 } })
  })

  it('gör om lägger tillbaka den tomma cellen när kolumnen står kvar', () => {
    const doc = game()
    const added = applyEdit(doc, ADDS)
    const widened = applyEdit(added, COLUMN)
    const back = revertOf(changeOf(doc, added), widened)
    if (!back.ok || !back.edit) throw new Error('no step')
    const undoneDoc = applyEdit(widened, back.edit)
    const forward = revertOf(changeOf(widened, undoneDoc), undoneDoc)
    if (!forward.ok || !forward.edit) throw new Error('no step forward')
    expect(stamp(applyEdit(undoneDoc, forward.edit))).toBe(stamp(widened))
  })
})

// Ett kort som ångras tillbaka tar inte med sig en kolumn någon annan har tagit bort (#1072). Ada tar
// bort ett kort med ett värde i en kolumn, Bo tar bort kolumnen, och Ada ångrar: kortet kommer
// tillbaka utan värdet, och Bos borttagning står. Det som släpptes sägs (`dropped`), så editorn kan
// säga varför.
describe('ett kort som kommer tillbaka tar inte med sig en kolumn någon annan tagit bort (#1072)', () => {
  const REMOVES: EditIntent = { v: 'removeRow', cardRef: 'kort-1' }
  const NO_BODY: EditIntent = { v: 'removeField', field: 'body' }

  it('lägger tillbaka Adas kort utan värdet i kolumnen Bo har tagit bort, och säger vad som släpptes', () => {
    const doc = game()
    const after = applyEdit(doc, REMOVES)
    const now = applyEdit(after, NO_BODY)
    const back = revertOf(changeOf(doc, after), now)
    if (!back.ok || !back.edit) throw new Error('no step')
    const undoneDoc = applyEdit(now, back.edit)
    expect(undoneDoc.rows.map((r) => r.id)).toEqual(['kort-1', 'kort-2', 'kort-3'])
    expect(undoneDoc.rows[0]).toEqual({ id: 'kort-1', fields: { title: 'Björn', antal: 1 } })
    expect(columnsOf(undoneDoc)).not.toContain('body')
    expect(back.dropped).toEqual([['rows', 'kort-1', 'fields', 'body']])
  })

  it('lägger tillbaka kolumnen med kortet när det var Adas borttagning av kortet som tog den', () => {
    const doc: ProjectDoc = { ...game(), rows: [{ id: 'kort-1', fields: { title: 'Björn', kraft: '', antal: 1 } }] }
    const after = applyEdit(doc, REMOVES)
    expect(columnsOf(after)).not.toContain('kraft')
    const back = revertOf(changeOf(doc, after), after)
    if (!back.ok || !back.edit) throw new Error('no step')
    expect(stamp(applyEdit(after, back.edit))).toBe(stamp(doc))
    expect(back.dropped).toBeUndefined()
  })

  it('släpper värdet också när mallen var den enda andra som bar kolumnen', () => {
    const doc: ProjectDoc = { ...game(), rows: [{ id: 'kort-1', fields: { title: 'Björn', body: 'Rad 1.', antal: 1 } }] }
    const after = applyEdit(doc, REMOVES)
    const now = applyEdit(after, NO_BODY)
    const back = revertOf(changeOf(doc, after), now)
    if (!back.ok || !back.edit) throw new Error('no step')
    const undoneDoc = applyEdit(now, back.edit)
    expect(undoneDoc.rows).toEqual([{ id: 'kort-1', fields: { title: 'Björn', antal: 1 } }])
    expect(columnsOf(undoneDoc)).not.toContain('body')
  })

  it('gör om lägger tillbaka Adas nya kort utan värdet i kolumnen Bo tog bort efter att hon ångrat', () => {
    const doc = game()
    const added = applyEdit(doc, { v: 'addRow', cardRef: 'kort-4', fields: { title: 'Lo', body: 'Rad 4.', antal: 1 } })
    const back = revertOf(changeOf(doc, added), added)
    if (!back.ok || !back.edit) throw new Error('no step')
    const undoneDoc = applyEdit(added, back.edit)
    const narrowed = applyEdit(undoneDoc, NO_BODY)
    const forward = revertOf(changeOf(added, undoneDoc), narrowed)
    if (!forward.ok || !forward.edit) throw new Error('no step forward')
    const redone = applyEdit(narrowed, forward.edit)
    expect(redone.rows.find((r) => r.id === 'kort-4')).toEqual({ id: 'kort-4', fields: { title: 'Lo', antal: 1 } })
    expect(columnsOf(redone)).not.toContain('body')
    expect(forward.dropped).toEqual([['rows', 'kort-4', 'fields', 'body']])
  })

  // Kapplöpningen: Adas editor prövar steget mot sin kopia, där kolumnen står kvar, men Bos
  // borttagning av den når aktören först. Aktören släpper värdet i stället för att återskapa
  // kolumnen, och loggen bär steget som det skrevs: utan värdet, och utan frågan.
  it('släpper värdet hos aktören när Bos borttagning av kolumnen hann före steget', () => {
    const doc = game()
    const after = applyEdit(doc, REMOVES)
    const back = revertOf(changeOf(doc, after), after)
    if (!back.ok || !back.edit) throw new Error('no step')
    const raced = applyEdit(after, NO_BODY)
    const logged = decideEdit(raced, back.edit)
    expect(JSON.stringify(logged)).not.toContain('standing')
    expect(JSON.stringify(logged)).not.toContain('Rad 1.')
    for (const edit of [logged, back.edit]) {
      const landed = applyEdit(raced, edit)
      expect(landed.rows[0]).toEqual({ id: 'kort-1', fields: { title: 'Björn', antal: 1 } })
      expect(columnsOf(landed)).not.toContain('body')
    }
    // Står kolumnen kvar när steget når aktören, kommer värdet tillbaka med kortet.
    expect(stamp(applyEdit(after, decideEdit(after, back.edit)))).toBe(stamp(doc))
  })
})

// Samma mönster utanför tabellen (#1072, L14): det som kommer tillbaka hör till något helt som någon
// annan har tagit bort — ett lager till en grupp, ett lager eller ett prosaval till en kolumn. Där
// finns inget kort som kan komma tillbaka utan delen: det steget vill lägga tillbaka *är* delen, så
// steget vägras i stället för att återskapa gruppen eller kolumnen.
describe('ett steg som skulle återskapa något helt som någon annan tagit bort vägras (#1072)', () => {
  const LAYER = ['template', 'faces', 'front', 'variants', 'eld', 'override', 'title']

  it('vägrar lägga tillbaka Adas lager i en grupp som Bo har tagit bort', () => {
    const doc = rich()
    const r = undone(doc, { v: 'resetElement', face: 'front', id: 'title', group: 'eld' }, [{ v: 'replaceFace', face: 'front', base: doc.template.faces['front']!.base, variants: {} }])
    expect(r).toEqual({ refused: expect.arrayContaining([LAYER]) })
  })

  it('vägrar lägga tillbaka Adas lager som ritar en kolumn Bo har tagit bort, så att kolumnen inte kommer tillbaka', () => {
    const r = undone(game(), { v: 'removeElement', face: 'front', id: 'body' }, [{ v: 'removeField', field: 'body' }])
    expect(r).toEqual({ refused: [['template', 'faces', 'front', 'base', 'body', 'bind']] })
  })

  it('vägrar lägga tillbaka Adas prosaval för en kolumn Bo har tagit bort', () => {
    const r = undone({ ...game(), prose: { body: true } }, { v: 'setProse', field: 'body', prose: null }, [{ v: 'removeField', field: 'body' }])
    expect(r).toEqual({ refused: [['prose', 'body']] })
  })

  it('vägrar lägga tillbaka Adas bildval för en kolumn Bo har tagit bort (#1085)', () => {
    const r = undone({ ...game(), images: { body: true } }, { v: 'setColumnKind', field: 'body', kind: null }, [{ v: 'removeField', field: 'body' }])
    expect(r).toEqual({ refused: [['images', 'body']] })
  })

  it('lägger tillbaka lagret och kolumnen när det var Adas eget steg som tog kolumnen', () => {
    const doc = { ...game(), rows: game().rows.map((r) => ({ ...r, fields: { title: r.fields['title'] ?? '', antal: 1 } })) }
    expect(stamp(docOf(undone(doc, { v: 'removeElement', face: 'front', id: 'body' }, [])))).toBe(stamp(doc))
  })

  it('vägrar hos aktören när Bos borttagning av kolumnen hann före steget som lägger tillbaka lagret', () => {
    const doc = game()
    const after = applyEdit(doc, { v: 'removeElement', face: 'front', id: 'body' })
    const back = revertOf(changeOf(doc, after), after)
    if (!back.ok || !back.edit) throw new Error('no step')
    const raced = applyEdit(after, { v: 'removeField', field: 'body' })
    expect(() => applyEdit(raced, decideEdit(raced, back.edit!))).toThrow(/someone else has removed/)
    expect(stamp(applyEdit(after, decideEdit(after, back.edit)))).toBe(stamp(doc))
  })
})

// Ett namnbyte på en kolumn som mallen inte ritar (#1076). Ada byter `kraft` till `styrka`, Bo tar
// bort `styrka`, och Ada ångrar: värdena kom tillbaka under `kraft`, och Bos borttagna kolumn stod i
// leken igen under sitt gamla namn. Det steget ska ta tillbaka — kolumnens namn — finns inte längre,
// så steget vägras.
describe('ett namnbyte på en kolumn någon annan har tagit bort tas inte tillbaka (#1076)', () => {
  const kraft = (): ProjectDoc => ({ ...game(), rows: game().rows.map((r, i) => ({ ...r, fields: { ...r.fields, kraft: String(i + 1) } })) })
  const RENAMES: EditIntent = { v: 'renameField', from: 'kraft', to: 'styrka' }
  const cells = (field: string) => game().rows.map((r) => ['rows', r.id, 'fields', field])

  it('vägrar ångra namnbytet när Bo har tagit bort kolumnen under sitt nya namn', () => {
    const r = undone(kraft(), RENAMES, [{ v: 'removeField', field: 'styrka' }])
    expect(r).toEqual({ refused: cells('kraft') })
  })

  it('vägrar ångra namnbytet när Bo har bytt namn på kolumnen igen, så att den inte står två gånger', () => {
    const r = undone(kraft(), RENAMES, [{ v: 'renameField', from: 'styrka', to: 'mod' }])
    expect(r).toEqual({ refused: cells('kraft') })
  })

  it('vägrar göra om namnbytet när Bo har tagit bort kolumnen efter att Ada ångrat', () => {
    const doc = kraft()
    const after = applyEdit(doc, RENAMES)
    const back = revertOf(changeOf(doc, after), after)
    if (!back.ok || !back.edit) throw new Error('no step')
    const undoneDoc = applyEdit(after, back.edit)
    expect(stamp(undoneDoc)).toBe(stamp(doc))
    const narrowed = applyEdit(undoneDoc, { v: 'removeField', field: 'kraft' })
    expect(revertOf(changeOf(after, undoneDoc), narrowed)).toEqual({ ok: false, conflicts: cells('styrka') })
  })

  it('vägrar också prosavalet som följde med namnbytet', () => {
    const r = undone({ ...kraft(), prose: { kraft: true } }, RENAMES, [{ v: 'removeField', field: 'styrka' }])
    expect(r).toEqual({ refused: expect.arrayContaining([['prose', 'kraft'], ...cells('kraft')]) })
  })

  it('vägrar ångra namnbytet på en kolumn mallen ritar, när Bos borttagning tog lagret med sig', () => {
    const r = undone(game(), { v: 'renameField', from: 'body', to: 'text' }, [{ v: 'removeField', field: 'text' }])
    expect(r).toEqual({ refused: expect.arrayContaining([['template', 'faces', 'front', 'base', 'body', 'bind'], ...cells('body')]) })
  })

  // Det andra som handlar om en kolumn står redan på samma sida: att flytta tillbaka en kolumn Bo
  // har tagit bort vägras, eftersom kolumnordningen är en del och Bos borttagning skrev den.
  it('vägrar flytta tillbaka en kolumn som Bo har tagit bort', () => {
    const r = undone(kraft(), { v: 'moveField', field: 'kraft', before: 'title' }, [{ v: 'removeField', field: 'kraft' }])
    expect(r).toEqual({ refused: [['columns']] })
  })

  // En kolumn som Ada tog bort i samma steg som hon lade till en annan, med andra värden, är två
  // kolumner och inte ett namnbyte: borttagningen var hennes egen, och den tas tillbaka.
  it('tar tillbaka en kolumn Ada tog bort när den nya hon lade till i samma steg var en annan kolumn', () => {
    const doc = kraft()
    const both: EditIntent = { v: 'compound', edits: [{ v: 'removeField', field: 'kraft' }, { v: 'addField', field: 'styrka' }] }
    const back = docOf(undone(doc, both, [{ v: 'removeField', field: 'styrka' }]))
    expect(stamp(back)).toBe(stamp(doc))
  })

  // Kapplöpningen: Adas editor räknar fram steget när `styrka` står kvar, men Bos borttagning når
  // aktören först. Steget bär varje cell i `styrka` som den var, så aktören vägrar det.
  it('vägrar hos aktören när Bos borttagning av kolumnen hann före steget', () => {
    const doc = kraft()
    const after = applyEdit(doc, RENAMES)
    const back = revertOf(changeOf(doc, after), after)
    if (!back.ok || !back.edit) throw new Error('no step')
    const raced = applyEdit(after, { v: 'removeField', field: 'styrka' })
    expect(() => applyEdit(raced, decideEdit(raced, back.edit!))).toThrow(/has changed since/)
    expect(stamp(applyEdit(after, decideEdit(after, back.edit)))).toBe(stamp(doc))
  })
})
