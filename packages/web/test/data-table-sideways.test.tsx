// @vitest-environment jsdom
// What stands still while the table is scrolled sideways (#145).
//
// The head row is `sticky` upward, which is right. Sideways nothing was fixed at all — not the
// tick, not `id` — so a designer standing in a `body` cell on row fifty-four had nothing on the
// screen telling her which card she was writing into. Measured at 1440 × 900: with `body` set to
// 1400 px the table is 2178 in a box of 1408 and `id` ends up 770 px out of sight; with `title`
// pulled to 987 it is 1791 px out. The fixture has three cards called `Duel` and three called
// `Stolen Goods`, so the title is no answer either, even on the occasions it happens to be there.
//
// Since #141 a table wider than its box is the normal case rather than the exception, which is
// what makes this the moment to fix it.
//
// The decision: the tick and `id` stand still in the inline direction exactly as the head stands
// still in the block direction, with an edge under `id` that says there is more to the left. The
// chip that used to say `← 3 kolumner till vänster` goes with it — the edge says the same thing
// without costing the place the reader was standing in, and two cues for one fact is one too many.
//
// jsdom lays nothing out and scrolls nothing, so every question here is put to a real engine
// against the stylesheet the editor ships.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { DataTable, markCut } from '../src/editor/DataTable.js'
import { deckValues, fitColumns, markValues } from '../src/editor/columns.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { translate, type T } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

const sv: T = (key, params) => translate('sv', key, params)
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// Cards that cannot be told apart by their titles, which is the fixture's whole job here: a row
// has to say which card it is, and three of these say `Duel`.
const CARDS = [
  { id: 'the-heist', fields: { typ: 'Playcard', title: 'Duel', body: 'Stjäl ett kort från motståndaren och lägg det underst i din draghög', antal: 2 } },
  { id: 'sals-saloon', fields: { typ: 'Location', title: 'Stolen Goods', body: 'Blockerar nästa anfall mot dig', antal: 4 } },
  { id: 'juice-em-up', fields: { typ: 'Effect', title: 'Duel', body: 'Dra två kort, lägg sedan tillbaka ett av dem underst i draghögen', antal: 1 } },
  { id: 'the-sheriff', fields: { typ: 'Shopcard', title: 'Stolen Goods', body: 'Ge 2 mynt', antal: 3 } },
  { id: 'last-call', fields: { typ: 'Playcard', title: 'Duel', body: 'Titta på motståndarens hand och välj ett kort som kastas', antal: 2 } },
  { id: 'the-getaway', fields: { typ: 'Location', title: 'Stolen Goods', body: 'Förstör en varelse med kostnad 3 eller mindre', antal: 1 } },
]

function deckDoc(): ProjectDoc {
  const doc = projectDoc()
  const front = doc.template.faces['front']!
  return {
    ...doc,
    template: {
      ...doc.template,
      faces: {
        ...doc.template.faces,
        front: {
          ...front,
          base: ['typ', 'title', 'body'].map((field, i) => ({
            kind: 'text' as const,
            id: field,
            x: 5,
            y: 5 + i * 12,
            w: 53,
            h: 10,
            bind: { field },
            font: { family: 'sans-serif', sizePt: 9 },
            color: '#111',
          })),
        },
      },
    },
    rows: CARDS,
  }
}

function Table() {
  const [doc, setDoc] = useState(deckDoc)
  return (
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={(rows) => setDoc((now) => ({ ...now, rows }))}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
    />
  )
}

// The table's markup, with `body` pulled wide enough to burst the box when asked for.
function markup(pull?: { field: string; by: number }): string {
  const { container, unmount } = render(<Table />)
  try {
    if (pull) {
      const grip = container.querySelector(`thead th[data-col="${pull.field}"] .byd-data-pull`) as HTMLElement
      fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 0 })
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: pull.by })
      fireEvent.pointerUp(grip, { pointerId: 1, clientX: pull.by })
    }
    return container.innerHTML
  } finally {
    unmount()
  }
}

const shellOf = (html: string) =>
  read('index.html')
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel">${html}</div></main></div></div>`)

const FIT = `(box, deck) => { (${String(fitColumns)})(box, deck); (${String(markValues)})(box) }`
// Vad rullningen ändrar, frågat efter rullningen — som på sidan, där den hänger på bildrutan och
// inte på mätningen. Frågat före hade lådans kant svarat om ett läge tabellen inte stod i.
const PIN = `(box) => (${String(markCut)})(box)`

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// The table laid out, scrolled where `to` says, and read by `read_`.
async function at<T_>(html: string, to: 'start' | 'end', read_: (page: import('playwright').Page) => Promise<T_>): Promise<T_> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await page.setContent(shellOf(html), { waitUntil: 'load' })
    await page.evaluate(
      ({ deck, fit, to }) => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        new Function('box', 'deck', `(${fit})(box, deck)`)(box, deck)
        box.scrollLeft = to === 'end' ? box.scrollWidth - box.clientWidth : 0
      },
      { deck: deckValues(deckDoc(), sv), fit: FIT, to },
    )
    await page.evaluate((pin) => new Function('box', `(${pin})(box)`)(document.querySelector('.byd-data-scroll')), PIN)
    return await read_(page)
  } finally {
    await page.close()
  }
}

// The fixture that bursts the box: `body` at 1400 px, which is the issue's own first row.
const burst = () => markup({ field: 'body', by: 1400 })

describe('the card the row belongs to, at the far end of a sideways scroll (#145)', () => {
  it('is still on the screen, on every row', async () => {
    const seen = await at(burst(), 'end', (page) =>
      page.evaluate(() => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        const room = box.getBoundingClientRect()
        // The table really is wider than the box and really is scrolled to the end, or every
        // answer below would be right for the wrong reason.
        const scrolled = Math.round(box.scrollLeft)
        const over = box.scrollWidth - box.clientWidth
        const gone: string[] = []
        for (const row of box.querySelectorAll('tbody tr')) {
          const id = row.querySelector('.byd-data-id') as HTMLElement | null
          if (!id) return { scrolled, over, gone: ['no id cell at all'] }
          const seat = id.getBoundingClientRect()
          if (seat.left < room.left - 0.5 || seat.right > room.right + 0.5) {
            gone.push(`${row.getAttribute('data-card-ref')}: ${Math.round(room.left - seat.left)}px out of sight`)
          }
        }
        return { scrolled, over, gone }
      }),
    )
    expect(seen.over).toBeGreaterThan(0)
    expect(seen.scrolled).toBe(seen.over)
    expect(seen.gone).toEqual([])
  }, 90_000)

  it('is painted over the values running under it, and not behind them', async () => {
    const seen = await at(burst(), 'end', (page) =>
      page.evaluate(() => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        const behind: string[] = []
        for (const row of box.querySelectorAll('tbody tr')) {
          const id = row.querySelector('.byd-data-id') as HTMLElement
          const seat = id.getBoundingClientRect()
          // What the browser itself answers at the middle of the cell. A cell that is merely in
          // the right place while a value is drawn on top of it is not standing still.
          const hit = document.elementFromPoint(seat.left + seat.width / 2, seat.top + seat.height / 2)
          if (hit !== id && !id.contains(hit)) behind.push(`${row.getAttribute('data-card-ref')}: ${hit?.tagName.toLowerCase()}.${hit instanceof Element ? [...hit.classList].join('.') : '—'}`)
        }
        return behind
      }),
    )
    expect(seen).toEqual([])
  }, 90_000)

  it('keeps the tick beside it, so a row can still be marked from where it stands', async () => {
    const seen = await at(burst(), 'end', (page) =>
      page.evaluate(() => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        const room = box.getBoundingClientRect()
        const gone: string[] = []
        for (const row of box.querySelectorAll('tbody tr')) {
          const tick = row.querySelector('.byd-data-check') as HTMLElement
          const seat = tick.getBoundingClientRect()
          if (seat.left < room.left - 0.5) gone.push(`${row.getAttribute('data-card-ref')}: ${Math.round(room.left - seat.left)}px out of sight`)
        }
        return gone
      }),
    )
    expect(seen).toEqual([])
  }, 90_000)

  it('meets the head that stands still upward, in the corner where the two cross', async () => {
    const seen = await at(burst(), 'end', (page) =>
      page.evaluate(() => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        box.scrollTop = box.scrollHeight - box.clientHeight
        const room = box.getBoundingClientRect()
        // The heading is named by the column it heads, not by the body cell's class.
        const head = box.querySelector('thead th[data-col="id"]') as HTMLElement | null
        if (!head) return 'no id heading'
        const seat = head.getBoundingClientRect()
        const across = seat.left >= room.left - 0.5 && seat.right <= room.right + 0.5
        // The head is held to the top by `top: 0`; the corner has to answer to both at once.
        const down = Math.abs(seat.top - room.top) < 1.5
        return across && down ? 'in the corner' : `across: ${across}, at the top: ${down}`
      }),
    )
    expect(seen).toBe('in the corner')
  }, 90_000)
})

describe('a table that fits its box (#145)', () => {
  it('pays nothing for the fixed columns: every column stands where the measurement put it', async () => {
    const [fits, burstOpen] = await Promise.all([
      at(markup(), 'start', (page) =>
        page.evaluate(() => {
          const box = document.querySelector('.byd-data-scroll') as HTMLElement
          const table = box.querySelector('.byd-data') as HTMLElement
          return { over: box.scrollWidth - box.clientWidth, table: Math.round(table.getBoundingClientRect().width) }
        }),
      ),
      at(burst(), 'start', (page) => page.evaluate(() => document.querySelector('.byd-data-scroll')!.scrollWidth - document.querySelector('.byd-data-scroll')!.clientWidth)),
    ])
    // The control: the wide fixture really does burst the box, so "nothing to scroll" below is a
    // fact about this deck and not about the harness.
    expect(burstOpen).toBeGreaterThan(0)
    expect(fits.over).toBe(0)
  }, 90_000)
})

// Rubriken över den text man läser (#401).
//
// #145 löste vilket *kort* raden är; vilken *kolumn* texten står i löste den inte. Rullad till
// slutet av en tabell där `body` är 1 400 px står svansarna kvar utan rubrik ovanför sig, och i
// huvudet syns «id» och sedan ungefär tolvhundra pixlar tomt innan nästa namn.
//
// Beslutet (2026-09-21, prototyp 03) lånar #145:s eget mönster: kolumnens namn glider i sidled och
// stannar vid lådans vänsterkant, precis innanför det som redan står stilla där, så länge någon
// del av kolumnen är i bild.
//
// Var den kanten går pinnas inte här. Bredden på det fastnålade är mätt och inte skriven, och
// fontens metrik är en annan på CI:s Linux än på en Mac (#325).
const rubrikenOchLådan = (page: import('playwright').Page, col: string) =>
  page.evaluate((col) => {
    const box = document.querySelector('.byd-data-scroll') as HTMLElement
    const th = box.querySelector(`thead th[data-col="${col}"]`) as HTMLElement
    const namn = th.querySelector('button') as HTMLElement
    const låda = box.getBoundingClientRect()
    const r = namn.getBoundingClientRect()
    // Det som står stilla ovanpå kolumnen, mätt på sidan i stället för skrivet här.
    const fast = [...box.querySelectorAll('thead .byd-data-check, thead th[data-col="id"]')]
      .reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0)
    return {
      vänster: Math.round(r.left - låda.left),
      höger: Math.round(r.right - låda.left),
      lådan: Math.round(låda.width),
      fast: Math.round(fast),
      text: (namn.textContent ?? '').trim(),
      // Står kolumnen över huvud taget i bild? Annars säger ingenting om rubriken något.
      kolumnenSyns: th.getBoundingClientRect().right > låda.left && th.getBoundingClientRect().left < låda.right,
    }
  }, col)

describe('rubriken över den text man läser (#401)', () => {
  it('står kvar innanför lådan, efter det fastnålade, när kolumnen rullats förbi', async () => {
    const sedd = await at(burst(), 'end', (page) => rubrikenOchLådan(page, 'body'))

    // Villkoret för att frågan ska betyda något: kolumnen är fortfarande i bild vid slutet.
    expect(sedd.kolumnenSyns).toBe(true)
    expect(sedd.text).toContain('body')
    // Namnet ligger innanför lådan och inte under det som står stilla där.
    expect(sedd.vänster).toBeGreaterThanOrEqual(sedd.fast)
    expect(sedd.höger).toBeLessThanOrEqual(sedd.lådan)
  }, 90_000)

  // Att det verkligen är ett villkor: vid lådans början, där kolumnen börjar långt inne i bilden,
  // står namnet kvar vid sin egen kolumn och inte klistrat vid kanten. Glidningen är alltså ett
  // svar på rullningen och inte en rubrik som alltid står längst till vänster.
  it('är ett verkligt villkor: orullad står namnet kvar vid sin egen kolumn', async () => {
    const [orullad, rullad] = await Promise.all([
      at(burst(), 'start', (page) => rubrikenOchLådan(page, 'body')),
      at(burst(), 'end', (page) => rubrikenOchLådan(page, 'body')),
    ])

    expect(orullad.vänster).toBeGreaterThan(rullad.vänster)
    expect(orullad.vänster).toBeGreaterThan(orullad.fast)
  }, 90_000)
})

// Kapet mot lådan (#401, andra halvan).
//
// #46:s ellips och #53:s uttoning gäller när ett värde är kapat av *sin egen kolumn*. Det
// betydligt vanligare fallet — att det är lådan som kapar — hade inget märke alls: vid 1 024 px
// var fyra av sju kolumner osynliga och ingenting på skärmen antydde att de fanns.
//
// Gesten är #53:s egen, en nivå upp. Där skrevs att en slöja är fel för att raden har fyra grunder
// och en slöja måste känna alla fyra, medan en mask inte känner någon. Lådans kant har samma
// problem — vad som råkar stå där är vilken rad som helst — så det är masken och inte slöjan som
// flyttas hit. Den ritas bara när något verkligen är kapat; en tabell som får plats ritas exakt
// som i dag.
const kantenAvLådan = (page: import('playwright').Page) =>
  page.evaluate(() => {
    const box = document.querySelector('.byd-data-scroll') as HTMLElement
    const how = getComputedStyle(box)
    return {
      märkt: box.getAttribute('data-beyond'),
      mask: how.maskImage === 'none' ? (how as unknown as { webkitMaskImage?: string }).webkitMaskImage ?? 'none' : how.maskImage,
      kvar: box.scrollWidth - box.clientWidth - Math.round(box.scrollLeft),
    }
  })

describe('kapet mot lådan bär samma gest som kapet mot kolumnen (#401)', () => {
  it('tonar ut vid högerkanten så länge något ligger utanför den', async () => {
    const sedd = await at(burst(), 'start', kantenAvLådan)

    expect(sedd.kvar).toBeGreaterThan(0)
    expect(sedd.märkt).toBe('true')
    expect(sedd.mask).not.toBe('none')
    // En uttoning och inte ett hårt stopp (#53): det som ritas är en övergång och inte en kant.
    expect(sedd.mask).toContain('gradient')
  }, 90_000)

  it('ritas inte alls när tabellen får plats, och inte längre när man rullat till slutet', async () => {
    const [ryms, slutet] = await Promise.all([at(markup(), 'start', kantenAvLådan), at(burst(), 'end', kantenAvLådan)])

    expect(ryms.kvar).toBe(0)
    expect(ryms.märkt).toBe(null)
    expect(ryms.mask).toBe('none')

    // Och vid slutet av rullningen finns ingenting mer åt höger att antyda. Ett märke där vore
    // samma lögn som en kant under `id` på en tabell som står vid sin början (#145).
    expect(slutet.kvar).toBe(0)
    expect(slutet.märkt).toBe(null)
  }, 90_000)
})

// Och vad uttoningen inte får äta (#401 mot #17, #53).
//
// Lådans högerkant är också där den fastnålade ×-kolumnen står, och den står där just för att den
// inte ska kunna rullas bort: den är det som skulle gå förlorat först. En uttoning lagd på hela
// lådan tar den med sig — masken vet ingenting om vad som råkar ligga under den, vilket är dess
// styrka överallt utom precis här. Så uttoningen slutar där pinnen börjar.
const pinnensGrund = (page: import('playwright').Page) =>
  page.evaluate(() => {
    const box = document.querySelector('.byd-data-scroll') as HTMLElement
    const pin = box.querySelector('thead .byd-data-remove') as HTMLElement
    const r = pin.getBoundingClientRect()
    const låda = box.getBoundingClientRect()
    return {
      märkt: box.getAttribute('data-beyond'),
      // Hur långt in från lådans högerkant pinnen börjar, och hur bred den är.
      pinFrånKanten: Math.round(låda.right - r.right),
      pinBredd: Math.round(r.width),
      // Vad masken säger på just den punkten, läst ur arket i stället för gissat.
      mask: getComputedStyle(box).maskImage,
    }
  })

describe('uttoningen vid lådans kant lämnar den fastnålade × i fred (#401, #17)', () => {
  it('slutar tona där pinnen börjar, så det som aldrig får rullas bort inte tonas bort', async () => {
    const sedd = await at(burst(), 'start', pinnensGrund)

    expect(sedd.märkt).toBe('true')
    // Pinnen står i lådans högerkant — det är premissen som gör kollisionen möjlig.
    expect(sedd.pinFrånKanten).toBeLessThanOrEqual(1)
    expect(sedd.pinBredd).toBeGreaterThan(0)
    // Och masken blir ogenomskinlig igen innan den når dit. Att den nämner pinnens egen bredd är
    // vad som binder de två talen ihop: flyttas pinnen flyttas uttoningens slut med den.
    expect(sedd.mask).toContain('gradient')
    // Efter den genomskinliga punkten kommer en ogenomskinlig igen: det är pinnen, oberörd.
    const genomskinlig = sedd.mask.lastIndexOf('rgba(0, 0, 0, 0)')
    expect(genomskinlig, `masken har ingen genomskinlig punkt alls: ${sedd.mask}`).toBeGreaterThan(-1)
    expect(sedd.mask.slice(genomskinlig + 1), `masken slutar inte ogenomskinlig: ${sedd.mask}`).toContain('rgb(0, 0, 0)')
  }, 90_000)
})

// The chip only ever existed after a real scroll had been measured, and the markup this file
// hands to the browser is taken in jsdom, where nothing is laid out and nothing has scrolled. So
// it cannot be asked for by looking at a page — which is why this is read as text, the way the
// spacing ladder is (#132). It is a weak guard and it is the honest one: what it says is that the
// editor no longer has a second way to say the thing the fixed edge now says.
describe('the chip that used to say what had gone out of the box (#145)', () => {
  it('is gone from the table and from the stylesheet, because the fixed edge says it instead', () => {
    expect(read('src/editor/DataTable.tsx')).not.toContain('byd-data-outside')
    expect(read('src/editor/editor.css')).not.toContain('byd-data-outside')
  }, 60_000)
})
