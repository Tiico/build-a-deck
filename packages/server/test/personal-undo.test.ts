import { describe, expect, it } from 'vitest'
import { applyEdit, type EditIntent } from '../src/edits.js'
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
  moveField: { mine: () => ({ v: 'moveField', field: 'typ', before: 'title' }) },
  patchElement: { mine: () => ({ v: 'patchElement', face: 'front', id: 'title', patch: { x: 9, name: 'Rubrik' } }) },
  addElement: { mine: () => ({ v: 'addElement', face: 'front', element: image, icon: { name: 'stjarna', url: `asset:${OTHER}`, credit: { licence: 'CC0', by: 'Ada' } } }) },
  removeElement: { mine: () => ({ v: 'removeElement', face: 'front', id: 'frame' }) },
  moveElement: { mine: () => ({ v: 'moveElement', face: 'front', id: 'body', to: 0 }) },
  replaceFace: { mine: () => ({ v: 'replaceFace', face: 'back', base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' } as Element] }) },
  resetElement: { mine: () => ({ v: 'resetElement', face: 'front', id: 'title', group: 'eld' }) },
  setGroupColumn: { mine: () => ({ v: 'setGroupColumn', column: null }) },
  setRecipe: { mine: () => ({ v: 'setRecipe', recipe: { players: 3, counters: [{ name: 'Liv', start: 20 }, { name: 'Guld', start: 0 }] } }) },
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

  it('läser ingen väg som når förbi spelet', () => {
    expect(() => applyEdit(game(), { v: 'revert', parts: [{ at: ['__proto__', 'x'], to: 1 }] })).toThrow(/no part of a game/)
    expect(() => applyEdit(game(), { v: 'revert', parts: [{ at: ['name', 'x'], to: 1 }] })).toThrow(/no part of a game/)
  })
})
