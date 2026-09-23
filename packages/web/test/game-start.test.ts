import { describe, expect, it } from 'vitest'
import { initialState, replay, type SetupDef } from '@byd/engine'
import type { ZoneAction } from '@byd/protocol'
import { openingSetup, setupFromProject } from '@byd/server/doc'
import { compileStart, startsAt } from '../src/table/actions.js'
import { registry, tableOf } from './scene.js'
import { twoSeatSetup } from './fixture.js'

// Spelstarten (#451). En åtgärd har hittills bara kunnat köras av en människa som klickar på
// högen; det här är det andra sättet att trycka på den maskin `compileAction` redan är.
//
// Starten är ett kuvert av vanliga verb och inget nytt verb: slumpen hamnar i loggen som
// resultat precis som när någon trycker Blanda för hand, så uppspelningen är identisk (D4).
const action = (id: string, when: ZoneAction['when'], steps: ZoneAction['steps']): ZoneAction => ({ id, label: id, when, steps })

// Samma bord som andra vytester, men med åtgärder på högarna.
function withActions(on: Record<string, ZoneAction[]>): SetupDef {
  const setup = twoSeatSetup()
  return {
    ...setup,
    zones: setup.zones.map((z) => {
      const actions = on[z.id]
      return actions === undefined ? z : { ...z, actions }
    }),
  }
}

describe('vad som händer med lekarna vid spelstart', () => {
  it('lägger varje startåtgärd på varje hög i ett enda kuvert, i den ordning snapshotten listar zonerna', () => {
    const table = tableOf(
      withActions({
        // Dokumentet listar draghögen först och kasthögen sedan. Ordningen vid bordet är ändå
        // kasthögens först, för `project` sorterar zonerna på id och filten ser ingen annan
        // ordning än den. Det är avsiktligt läst här och inte ett fel: den ordning som
        // committas måste vara den som spelas upp, och zon-id är det enda både sidor delar.
        discard: [action('vänd', 'start', [{ v: 'flipTop', face: 'front' }])],
        draw: [action('blanda', 'both', [{ v: 'shuffle' }])],
      }),
    )
    const view = table.view(null)
    expect(view.zones.map((z) => z.id)).toEqual([...view.zones.map((z) => z.id)].sort())
    expect(compileStart(view)).toEqual({
      ok: true,
      intents: [
        { v: 'flip', component: { top: 'discard' }, face: 'front' },
        { v: 'shuffle', pile: 'draw' },
      ],
    })
  })

  it('rör inte en åtgärd som bara körs när någon ber om den, och inte en som inget säger', () => {
    const table = tableOf(
      withActions({
        draw: [
          action('blanda', 'request', [{ v: 'shuffle' }]),
          // Skriven innan starten fanns: fältet saknas, och det betyder «bara på begäran».
          { id: 'dela', label: 'dela', steps: [{ v: 'deal', each: { of: 'number', n: 1 }, to: { at: 'hands' }, face: 'keep' }] },
        ],
      }),
    )
    expect(compileStart(table.view(null))).toEqual({ ok: false, why: 'nothing' })
  })

  it('säger varför den inte går att köra i stället för att köra en halv start', () => {
    const table = tableOf(
      withActions({
        draw: [
          action('blanda', 'start', [{ v: 'shuffle' }]),
          action('starthand', 'start', [{ v: 'deal', each: { of: 'seats' }, to: { at: 'hands' }, face: 'keep' }]),
        ],
      }),
    )
    // Ingen har satt sig: «ett per spelare» är inte noll kort, det är ingen att räkna.
    expect(table.view(null).seats.every((s2) => s2.name === null)).toBe(true)
    expect(compileStart(table.view(null))).toEqual({ ok: false, why: 'nowhere' })

    // Och när någon satt sig går hela starten, blandningen inkluderad.
    table.run(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    expect(compileStart(table.view(null))).toEqual({
      ok: true,
      intents: [
        { v: 'shuffle', pile: 'draw' },
        { v: 'deal', from: 'draw', to: ['hand:A'], each: 1 },
      ],
    })
  })

  it('läser bara högars åtgärder: en yta har ingen ring att hänga en åtgärd i', () => {
    // K21 erbjuder panelen bara på högar, så det här är ett dokument som inte borde finnas. Men
    // starten är ett enda kuvert: ett steg som motorn avvisar fäller hela den, alltså också
    // blandningen på draghögen. Att läsa bara högar är billigare än att upptäcka det vid bordet.
    const table = tableOf(
      withActions({
        table: [action('yta', 'start', [{ v: 'shuffle' }])],
        draw: [action('blanda', 'start', [{ v: 'shuffle' }])],
      }),
    )
    expect(compileStart(table.view(null))).toEqual({ ok: true, intents: [{ v: 'shuffle', pile: 'draw' }] })
  })
})

// Receptets egen blandning (#453). Ovanför står maskinen; det här är att det bord ett nytt spel
// verkligen föds med trycker på den. Att skriva ett fält ingen läser är precis det fel ett
// påstående om uppställningen inte fångar, så vägen mäts hela: receptets dokument, genom
// `setupFromProject` som bordet byggs av, till `startsAt` som starten frågar.
const newGame = (players: number): SetupDef =>
  setupFromProject({
    rows: ['drake', 'riddare', 'trollkarl', 'tjuv', 'präst', 'bågskytt'].map((id) => ({ id, fields: { antal: 1 } })),
    setup: openingSetup({ players, counters: [] }),
  })

describe('leken ett nytt spel föds med', () => {
  it('blandas av starten, och av ingenting annat på bordet', () => {
    const setup = newGame(2)
    const table = tableOf(setup)
    const view = table.view(null)
    expect(startsAt(view)).toEqual([{ zone: 'draw', action: { id: 'shuffle', label: 'Blanda', steps: [{ v: 'shuffle' }], when: 'both' } }])
    expect(compileStart(view)).toEqual({ ok: true, intents: [{ v: 'shuffle', pile: 'draw' }] })
  })

  it('ligger i dokumentets ordning tills starten trycks, och i en annan efter', () => {
    const table = tableOf(newGame(2))
    const before = table.state().zones['draw']!.order.map((id) => table.state().components[id]!.cardRef)
    expect(before).toEqual(['drake', 'riddare', 'trollkarl', 'tjuv', 'präst', 'bågskytt'])
    const started = compileStart(table.view(null))
    expect(started.ok).toBe(true)
    table.run(null, ...(started.ok ? started.intents : []))
    const after = table.state().zones['draw']!.order.map((id) => table.state().components[id]!.cardRef)
    expect([...after].sort()).toEqual([...before].sort())
    expect(after).not.toEqual(before)
  })

  // D4: all slump ligger i loggen som resultat och aldrig som frö, så en start med en blandning
  // är lika uppspelbar som vilken annan rad som helst. Mätt och inte påstått — loggen viks om
  // från ett nyfött tillstånd och ska ge exakt det bordet som står.
  it('spelas upp identiskt ur loggen, blandningen inräknad', () => {
    const setup = newGame(4)
    const table = tableOf(setup)
    const started = compileStart(table.view(null))
    table.run(null, ...(started.ok ? started.intents : []))
    expect(table.log.map((line) => line.intent.v)).toEqual(['shuffle'])
    // Resultatet ligger i raden; fröet finns inte att spela upp med.
    expect(table.log[0]!.outcome).toMatchObject({ kind: 'shuffle' })
    expect(replay(initialState('v1', setup, registry), registry, table.log)).toEqual(table.state())
  })
})
