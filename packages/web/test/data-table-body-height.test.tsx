// @vitest-environment jsdom
// Taket på den stängda body-cellen (#324, L39), och varför det inte får sitta på cellen.
//
// L39 kallar taket «inte en detalj i den här lösningen utan dess bärande del»: `max-height` på ett
// `<td>` hedras inte — en tabellcell växer med sitt innehåll oavsett vad som skrivs — och
// prototypens första mätning gav 101 px där 34 var begärt. Det är ett påstående om vad en riktig
// layoutmotor gör och kan därför inte ställas i jsdom, som inte lägger ut någonting. Det ställs
// här till Chromium mot editorns eget ark, precis som tabellens huvud mäts i
// `data-table-layout.test.tsx`.
//
// Tre påståenden, och det tredje är kontrollen som gör de två första värda något:
//
//  1. Den stängda cellen visar formen och tar aldrig mer höjd än taket.
//  2. Ett kort som bär en lista är därför exakt lika högt som ett som bär två rader text —
//     tabellen är tät (#46) och får inte gunga med vad som råkar stå i en cell.
//  3. Flyttas samma tak till `<td>` växer cellen ändå. Prototypens fall, pinnat.
//
// Och uttoningen under kanten, som är taket sett av den som läser: den säger att något är kvar
// under kanten, så den får bara ritas där något verkligen är det. Ritad jämt lägger den sin
// gradient över underlängderna på en cell som rymdes — samma slags fel som `text-overflow` på ett
// fält, fast tvärtom: en signal som ljuger genom att alltid stå på.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { DataTable } from '../src/editor/DataTable.js'
import { deckValues, fitColumns, markValues } from '../src/editor/columns.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { translate, type T } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

const sv: T = (key, params) => translate('sv', key, params)
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// Tre kort som ställer frågan: en rad, en lista, och en lista som är för lång för taket. Samma
// tre former prototypen mätte 49 · 34 · 49 px på.
const KORT = [
  'Flyger tyst över skogen och tar med sig det den ser.',
  '**Gläntans väktare** vaktar platsen.\n\n- Se på de tre översta korten\n- Lägg ett i din hand\n- Lägg resten i kasthögen',
  'Sköld 1.',
]

function deck(): ProjectDoc {
  const doc = projectDoc()
  for (const [i, body] of KORT.entries()) doc.rows[i]!.fields['body'] = body
  return doc
}

function markup(doc: ProjectDoc): string {
  const { container, unmount } = render(
    <DataTable
      doc={doc}
      selectedRow={null}
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
    />,
  )
  const html = container.innerHTML
  unmount()
  return html
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

const shellOf = (html: string, extra: string) =>
  read('index.html')
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}${extra}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel">${html}</div></main></div></div>`)

type Seen = {
  // Taket arket ber om, läst ur arket självt och aldrig skrivet som en siffra här.
  cap: number
  // Varje rad: hela radens höjd, cellens, skrivytans, hur högt innehållet i den egentligen är,
  // och om uttoningen under kanten är ritad.
  rows: { row: number; cell: number; body: number; content: number; fades: boolean }[]
  // Vad en skärmläsare hör av formen i den stängda cellen.
  shape: string[]
}

async function measure(doc: ProjectDoc, extra = ''): Promise<Seen> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await page.setContent(shellOf(markup(doc), extra), { waitUntil: 'load' })
    return await page.evaluate(
      ({ deck, fit, mark }) => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        // Bägge av tabellens egna beslut, i den ordning den fattar dem: bredderna, och sedan —
        // vid de bredderna — vilka värden som inte fick plats. Uttoningen hänger på det andra.
        new Function('box', 'deck', `(${fit})(box, deck)`)(box, deck)
        new Function('box', `(${mark})(box)`)(box)
        const bodies = [...document.querySelectorAll<HTMLElement>('.byd-data tbody .byd-data-body')]
        // Taket som arket ber om, mätt och inte skrivet: samma element utan innehåll och utan
        // tak, med två rader i sig.
        const probe = bodies[0]!.cloneNode(false) as HTMLElement
        probe.style.maxHeight = 'none'
        probe.style.position = 'absolute'
        probe.style.visibility = 'hidden'
        probe.textContent = 'x\nx'
        probe.style.whiteSpace = 'pre'
        bodies[0]!.parentElement!.append(probe)
        const cap = Math.round(probe.getBoundingClientRect().height)
        probe.remove()
        return {
          cap,
          rows: bodies.map((body) => ({
            row: Math.round(body.closest('tr')!.getBoundingClientRect().height),
            cell: Math.round(body.closest('td')!.getBoundingClientRect().height),
            body: Math.round(body.getBoundingClientRect().height),
            content: body.scrollHeight,
            fades: getComputedStyle(body, '::after').content !== 'none',
          })),
          shape: bodies.map((body) => [...body.children].map((child) => child.tagName).join(' ')),
        }
      },
      { deck: deckValues(doc, sv), fit: String(fitColumns), mark: String(markValues) },
    )
  } finally {
    await page.close()
  }
}

describe('den stängda body-cellen har ett tak (L39)', () => {
  it('visar formen och tar aldrig mer höjd än två rader', async () => {
    const seen = await measure(deck())
    // Formen är den kortet ritas med: ett stycke är ett stycke och en punktlista en lista.
    expect(seen.shape).toEqual(['P', 'P UL', 'P'])
    // Innehållet i den mellersta cellen är högre än taket — annars mäter ingenting här något.
    expect(seen.rows[1]!.content).toBeGreaterThan(seen.cap)
    for (const row of seen.rows) expect(row.body).toBeLessThanOrEqual(seen.cap)
    // Och cellen är skrivytan plus det arket lägger runt den, aldrig innehållets egen höjd.
    const kapade = seen.rows.filter((r) => r.content > seen.cap)
    expect(kapade.length).toBeGreaterThan(0)
    for (const row of kapade) expect(row.cell).toBe(kapade[0]!.cell)
    // Och en kapad rad kostar två rader mer än en cell som får plats på en. Mätt: 45 · 52 · 45 px
    // mot prototypens 49 · 34 · 49 — samma form, tätare tabell, och skillnaden mellan högsta och
    // lägsta rad är taket och ingenting annat.
    const höjder = seen.rows.map((r) => r.row)
    expect(Math.max(...höjder) - Math.min(...höjder)).toBeLessThanOrEqual(seen.cap - Math.min(...seen.rows.map((r) => r.body)))
  }, 90_000)

  it('tonar ut under kanten bara på den cell som verkligen är kapad', async () => {
    const seen = await measure(deck())
    // Uttoningen står där och bara där innehållet går under kanten. På de två cellerna som ryms
    // ligger den annars över raden som redan är hel: gradienten är 12 px och de åtta understa av
    // dem är cellens luft, så resten hamnar på underlängderna i den sista raden text.
    expect(seen.rows.map((r) => r.fades)).toEqual(seen.rows.map((r) => r.content > r.body))
    // Och det är inte en tom lista: en av de tre är kapad och två är det inte.
    expect(seen.rows.filter((r) => r.fades)).toHaveLength(1)
  }, 90_000)

  // Kontrollen. Samma tak, samma innehåll, flyttat till `<td>`: cellen växer ändå, och det är
  // därför taket står på ett element inuti den.
  it('växer ändå om taket flyttas till cellen — prototypens 101 mot 34', async () => {
    const inside = await measure(deck())
    const onTd = await measure(
      deck(),
      `\n.byd-data td .byd-data-body { max-height: none; }
       .byd-data td[data-col='body'] { max-height: ${inside.cap}px; overflow: hidden; }`,
    )
    const grown = onTd.rows[1]!.cell
    expect(grown).toBeGreaterThan(inside.cap)
    expect(grown).toBeGreaterThan(inside.rows[1]!.cell)
  }, 90_000)
})
