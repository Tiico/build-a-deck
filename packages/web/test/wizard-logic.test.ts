import { describe, expect, it } from 'vitest'
import { parseCsv } from '../src/editor/csv.js'
import { buildProject, type WizardState } from '../src/wizard/build.js'
import { translate } from '../src/i18n/index.js'

describe('parseCsv', () => {
  it('reads a header line and rows, with commas or tabs, quoted fields, and CRLF', () => {
    const text = 'title,cost,body\r\n"Drake, den stora",5,"Flygande. ""Vass""."\r\nRiddare,3,Sköld 1.\r\n\r\n'
    expect(parseCsv(text)).toEqual({
      headers: ['title', 'cost', 'body'],
      rows: [
        { title: 'Drake, den stora', cost: '5', body: 'Flygande. "Vass".' },
        { title: 'Riddare', cost: '3', body: 'Sköld 1.' },
      ],
    })
    expect(parseCsv('a\tb\n1\t2')).toEqual({ headers: ['a', 'b'], rows: [{ a: '1', b: '2' }] })
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
  })
})

describe('buildProject', () => {
  const state: WizardState = {
    name: 'Skogens herrar',
    players: 3,
    fields: [
      { key: 'title', label: 'Titel', kind: 'text' },
      { key: 'cost', label: 'Kostnad', kind: 'number' },
      { key: 'body', label: 'Text', kind: 'text' },
    ],
    frame: 'classic',
    rows: [
      { title: 'Drake', cost: '5', body: 'Flygande.', antal: '2' },
      { title: 'Drake', cost: '1', body: 'En till med samma namn.' },
      { title: '', cost: '', body: 'Utan titel' },
    ],
  }

  it('makes a project with seats and default zones from the player count, the frame bound to the fields, and rows with ids and antal', () => {
    const doc = buildProject(state)
    expect(doc.name).toBe('Skogens herrar')
    expect(doc.setup.seats).toEqual(['A', 'B', 'C'])
    expect(doc.setup.floor).toBe('table')
    expect(doc.setup.deckZone).toBe('draw')
    const kinds = Object.fromEntries(doc.setup.zones.map((z) => [z.id, z.kind]))
    expect(kinds).toMatchObject({ table: 'area', draw: 'pile', discard: 'pile', 'hand:A': 'hand', 'hand:B': 'hand', 'hand:C': 'hand' })
    expect(doc.setup.zones.filter((z) => z.kind === 'hand').every((z) => z.returnTo === 'draw' && z.visibility === 'owner')).toBe(true)
    // The phone's verbs (C4) from the start: cast onto the discard, put back underneath the draw pile.
    expect(doc.setup.zones.find((z) => z.id === 'discard')?.shortcut).toEqual({ label: 'Kasta', at: 'top' })
    expect(doc.setup.zones.find((z) => z.id === 'draw')?.shortcut).toEqual({ label: 'Lägg underst', at: 'bottom' })
    // Every seat owns an area in front of it (C4), reachable from the sheet as "Framför mig",
    // and a counters zone everyone may see; the counters themselves are the wizard's list.
    expect(doc.setup.zones.find((z) => z.id === 'mine:A')).toMatchObject({ kind: 'area', owner: 'A', visibility: 'owner', shortcut: { label: 'Framför mig', at: 'top' } })
    expect(doc.setup.zones.find((z) => z.id === 'counters:C')).toMatchObject({ kind: 'area', owner: 'C', visibility: 'all' })
    expect(doc.setup.counters).toEqual([{ name: 'Poäng', start: 0 }])
    // The counter the wizard suggests is a word the designer will read and rename, so it is
    // written in the language they are building the game in (A4).
    expect(buildProject(state, (key, params) => translate('en', key, params)).setup.counters).toEqual([{ name: 'Score', start: 0 }])

    const front = doc.template.faces['front']!
    const bound = front.base.flatMap((e) => ('bind' in e && 'field' in e.bind ? [e.bind.field] : []))
    expect(bound).toEqual(expect.arrayContaining(['title', 'cost', 'body']))
    expect(doc.template.faces['back']).toBeDefined()

    expect(doc.rows.map((r) => r.id)).toEqual(['drake', 'drake-2', 'kort-3'])
    expect(doc.rows[0]?.fields).toEqual({ title: 'Drake', cost: 5, body: 'Flygande.', antal: 2 })
    expect(doc.rows[1]?.fields['antal']).toBe(1)
    expect(doc.rows[2]?.fields['title']).toBe('')
  })

  it('leaves out frame elements for fields the game does not have', () => {
    const doc = buildProject({ ...state, fields: state.fields.filter((f) => f.key !== 'cost') })
    const ids = doc.template.faces['front']!.base.map((e) => e.id)
    expect(ids).not.toContain('cost')
    expect(ids).toContain('title')
  })
})
