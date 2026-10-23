import { describe, expect, it } from 'vitest'
import { Harness, registry, twoSeatSetup } from './fixture.js'
import { applyPatch, diff, initialState, project, replay } from '../src/index.js'

// Bordets anteckningsblock (#1131): rader som alla vid bordet ser och skriver i, för det man måste
// hålla koll på under spelet — poäng som inte bor på ett kort, vems tur det var, en regelfråga till
// efteråt. Blocket är sessionens och inte spelets: det är inte ett drag, Ångra tar inte tillbaka
// det, och en tillbakaspolning av bordet lämnar det kvar.
describe('anteckningsblocket', () => {
  it('är tomt på ett nytt bord', () => {
    expect(new Harness().view('A').notes).toEqual([])
  })

  it('en rad som skrivs syns för varje vy, med vem som skrev den', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    const line = h.do('A', { v: 'note.add', text: 'Poäng: Ada 7, Bo 4' })
    const row = { id: `n${line.seq}`, by: 'A', text: 'Poäng: Ada 7, Bo 4', done: false }
    expect(h.view('A').notes).toEqual([row])
    expect(h.view('B').notes).toEqual([row])
    expect(h.view(null).notes).toEqual([row])
    expect(project(h.state, registry, null, undefined, h.deps.history, true).notes).toEqual([row])
  })

  it('raderna står i den ordning de skrevs', () => {
    const h = new Harness()
    h.do('A', { v: 'note.add', text: 'ett' })
    h.do('B', { v: 'note.add', text: 'två' })
    expect(h.view('A').notes.map((n) => [n.by, n.text])).toEqual([
      ['A', 'ett'],
      ['B', 'två'],
    ])
  })

  it('vem som helst vid bordet skriver om, bockar av och tar bort en rad, och raden behåller sin skribent', () => {
    const h = new Harness()
    const id = `n${h.do('A', { v: 'note.add', text: 'Cy har en extra tur' }).seq}`
    h.do('B', { v: 'note.edit', note: id, text: 'Cy har en extra tur nästa runda' })
    expect(h.view('A').notes).toEqual([{ id, by: 'A', text: 'Cy har en extra tur nästa runda', done: false }])
    h.do('B', { v: 'note.check', note: id, done: true })
    expect(h.view('A').notes[0]?.done).toBe(true)
    h.do('A', { v: 'note.check', note: id, done: false })
    expect(h.view('A').notes[0]?.done).toBe(false)
    h.do('B', { v: 'note.remove', note: id })
    expect(h.view('A').notes).toEqual([])
  })

  it('avvisar en tom rad, en för lång rad och en rad som inte finns', () => {
    const h = new Harness()
    expect(h.try('A', { v: 'note.add', text: '   ' })).toMatchObject({ ok: false })
    expect(h.try('A', { v: 'note.add', text: 'x'.repeat(281) })).toMatchObject({ ok: false })
    expect(h.try('A', { v: 'note.add', text: 'x'.repeat(280) })).toMatchObject({ ok: true })
    expect(h.try('A', { v: 'note.edit', note: 'n99', text: 'hej' })).toMatchObject({ ok: false, reason: 'unknown note n99' })
    expect(h.try('A', { v: 'note.check', note: 'n99', done: true })).toMatchObject({ ok: false })
    expect(h.try('A', { v: 'note.remove', note: 'n99' })).toMatchObject({ ok: false })
    const id = `n${h.do('A', { v: 'note.add', text: 'hej' }).seq}`
    expect(h.try('A', { v: 'note.edit', note: id, text: ' ' })).toMatchObject({ ok: false })
  })

  it('rymmer hundra rader och inte fler', () => {
    const h = new Harness()
    for (let i = 0; i < 100; i++) h.do('A', { v: 'note.add', text: `rad ${i}` })
    expect(h.try('A', { v: 'note.add', text: 'en till' })).toMatchObject({ ok: false, reason: 'the notepad holds at most 100 notes' })
  })

  it('är inte spel: bordet är inte påbörjat, och Ångra går förbi raderna till det egna draget', () => {
    const h = new Harness()
    h.do('A', { v: 'note.add', text: 'innan' })
    expect(h.view('A').played).toBe(false)
    expect(h.view('A').undo).toBeNull()

    const move = h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'note.add', text: 'efter mitt drag' })
    h.do('B', { v: 'note.add', text: 'den andras rad' })
    expect(h.view('A').undo).toEqual({ toSeq: move.seq - 1, contested: false })
  })

  it('står kvar när bordet spolas tillbaka, ångras eller ställs upp igen', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'note.add', text: 'Ada drog ett kort' })
    h.do('A', { v: 'undo.self' })
    expect(h.zone('hand:A')).toEqual([])
    expect(h.view('A').notes.map((n) => n.text)).toEqual(['Ada drog ett kort'])

    h.do('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
    const proposal = h.do('B', { v: 'rewind.propose', toSeq: 0 })
    h.do('A', { v: 'rewind.confirm', proposal: proposal.batch })
    expect(h.zone('hand:B')).toEqual([])
    expect(h.view('A').notes.map((n) => n.text)).toEqual(['Ada drog ett kort'])

    h.do(null, { v: 'setup.reset' })
    expect(h.view('A').notes.map((n) => n.text)).toEqual(['Ada drog ett kort'])
  })

  it('spelas upp identiskt ur loggen, och når en klient som får patchar', () => {
    const h = new Harness()
    const before = h.view('B')
    const id = `n${h.do('A', { v: 'note.add', text: 'ett' }).seq}`
    h.do('B', { v: 'note.check', note: id, done: true })
    const after = h.view('B')
    expect(applyPatch(before, diff(before, after))).toEqual(after)
    expect(replay(initialState('v1', twoSeatSetup(), registry), registry, h.log).notes).toEqual(h.state.notes)
  })
})
