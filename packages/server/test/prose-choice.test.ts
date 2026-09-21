import { describe, expect, it } from 'vitest'
import { applyEdit } from '../src/edits.js'
import { ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// Valet per kolumn (L43, #362): «höjden föreslår, designern avgör». Rutan i mallen sätter
// förvalet — det räknas i webbens `bodyFieldsOf` — men vad kolumnen *är* står skrivet i
// dokumentet, och det är det som lagras, versioneras och följer med som all annan dokumentdata.
const base = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: {
      faces: {
        front: {
          base: [
            { kind: 'text', id: 'kostnad', x: 48, y: 5, w: 11, h: 12, bind: { field: 'kostnad' }, font: { family: 'sans-serif', sizePt: 14 }, color: '#111' },
            { kind: 'if', id: 'om', when: { field: 'smak', nonEmpty: true }, children: [
              { kind: 'text', id: 'smak', x: 5, y: 60, w: 53, h: 7, bind: { field: 'smak' }, font: { family: 'sans-serif', sizePt: 7.5 }, color: '#333' },
            ] },
          ],
          variants: {},
        },
      },
    },
    rows: [
      { id: 'vaktare', fields: { kostnad: '3', smak: 'Den stod där före stigen.', antal: 1 } },
      { id: 'halsning', fields: { kostnad: '5', smak: 'Kort hälsning.', antal: 1 } },
    ],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('valet skrivs i dokumentet (L43, #362)', () => {
  it('skriver ett uttryckligt ja och ett uttryckligt nej under kolumnens egen nyckel', () => {
    const doc = applyEdit(applyEdit(base(), { v: 'setProse', field: 'kostnad', prose: false }), { v: 'setProse', field: 'smak', prose: true })
    expect(doc.prose).toEqual({ kostnad: false, smak: true })
    // Och det läser tillbaka som dokumentet det är: schemat känner posten.
    expect(ProjectDoc.parse(doc).prose).toEqual({ kostnad: false, smak: true })
  })

  it('tar bort posten när kolumnen ska följa höjden igen, i stället för att skriva ett tredje värde', () => {
    const chosen = applyEdit(base(), { v: 'setProse', field: 'kostnad', prose: false })
    const back = applyEdit(chosen, { v: 'setProse', field: 'kostnad', prose: null })
    // «Följer höjden» är frånvaro och inte ett värde: annars vore ett dokument utan post något
    // annat än ett dokument som lämnat tillbaka sitt val, och befintliga lekar hade två svar.
    expect(back.prose).toBeUndefined()
  })

  it('låter en kolumn som gått ta sitt val med sig', () => {
    const chosen = applyEdit(base(), { v: 'setProse', field: 'smak', prose: true })
    const gone = applyEdit(chosen, { v: 'removeField', field: 'smak' })
    // Annars ärver nästa kolumn som råkar heta `smak` ett val ingen har gjort åt den.
    expect(gone.prose).toBeUndefined()
  })
})

// Kolumnnyckeln är designerns att ändra, och ett val som inte följer med ett namnbyte faller
// tillbaka på höjden — alltså rakt in i buggen #362 beskriver, utan att någon rört prosafrågan.
describe('valet följer med vid namnbyte (L43, #362)', () => {
  it('flyttar valet till den nya nyckeln, i stället för att lämna det under den gamla', () => {
    const chosen = applyEdit(base(), { v: 'setProse', field: 'kostnad', prose: false })
    const renamed = applyEdit(chosen, { v: 'renameField', from: 'kostnad', to: 'pris' })
    expect(renamed.prose).toEqual({ pris: false })
  })

  it('tar med kolumnen själv: korten, mallens bindning och ordningen', () => {
    const doc = applyEdit({ ...base(), columns: ['kostnad', 'smak'] }, { v: 'renameField', from: 'kostnad', to: 'pris' })
    expect(doc.rows.map((r) => r.fields['pris'])).toEqual(['3', '5'])
    expect(doc.rows.every((r) => !('kostnad' in r.fields))).toBe(true)
    expect(doc.columns).toEqual(['pris', 'smak'])
    const drawn = doc.template.faces['front']!.base.find((el) => el.id === 'kostnad')!
    expect('bind' in drawn && 'field' in drawn.bind ? drawn.bind.field : null).toBe('pris')
  })

  it('följer med in i ett villkor och i det villkoret frågar om', () => {
    const doc = applyEdit(base(), { v: 'renameField', from: 'smak', to: 'notis' })
    const om = doc.template.faces['front']!.base.find((el) => el.id === 'om')!
    expect(om.kind === 'if' ? om.when.field : null).toBe('notis')
    const inside = om.kind === 'if' ? om.children[0]! : null
    expect(inside && 'bind' in inside && 'field' in inside.bind ? inside.bind.field : null).toBe('notis')
  })

  it('vägrar ett namn tabellen redan svarar på, och en kolumn som inte finns', () => {
    expect(() => applyEdit(base(), { v: 'renameField', from: 'kostnad', to: 'smak' })).toThrow()
    expect(() => applyEdit(base(), { v: 'renameField', from: 'finns-ej', to: 'pris' })).toThrow()
  })
})
