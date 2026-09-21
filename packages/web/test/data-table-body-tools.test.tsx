// @vitest-environment jsdom
// Verktygsraden i en öppen body-cell, när kolumnen är bredare än lådan (#397).
//
// L39 säger uttryckligen att verktygen ska synas finnas innan man börjar skriva: «en rad som tonar
// fram vid fokus säger ingenting till den som ännu inte klickat». Vid den bredd en riktig regeltext
// ber om var det åtagandet brutet — inte av en tonande rad utan av avstånd. Mätt i granskningen:
// etiketten på x 584, raden på x 2 072, 1 353 px isär, och verktygen inte på skärmen alls.
//
// Beslutet (2026-09-21, prototyp 03) är att raden står kvar i cellens huvud och att det är
// *skrivytan* som får ett tak. Huvudet och verktygen ryms därmed alltid, utan att röra sig, och
// kolumnen får vara bred ändå. Att kolumnen är bredare än skrivytan är inte ett fel som ska fyllas:
// resten av den öppna cellen är cellens egen grund ut till kolumnens kant.
//
// #398:s tak håller `fitColumns` innanför lådan, men det gäller bara vad mätningen ger. En bredd
// designern dragit själv är hennes (L4, #46) och rörs inte — så det är den som ställs här, och det
// är det enda fallet där den här frågan alls kan uppstå efter #398.
//
// jsdom lägger ingenting ut, så allt nedan mäts i en riktig motor mot editorns eget ark.
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

// En regeltext av det slag L39 finns för, lång nog att den öppna cellen har något att bryta rad på.
const REGEL =
  'När den här enheten kommer i spel får du dra ett kort, och om du redan har fler än tre ' +
  'kopparmarker i förrådet kastar du en av dem och lägger i stället en duellmarker på en ' +
  'motståndares zon, som står kvar till slutet av nästa tur.'

function deck(): ProjectDoc {
  const doc = projectDoc()
  doc.rows[0]!.fields['body'] = REGEL
  return doc
}

function Table() {
  const [doc, setDoc] = useState(deck)
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

// Tabellens markup med `body` dragen till en bredd designern valt själv, och cellen på första
// raden öppnad — precis det ögonblick issuet handlar om.
function markup(): string {
  const { container, unmount } = render(<Table />)
  try {
    const grip = container.querySelector('thead th[data-col="body"] .byd-data-pull') as HTMLElement
    fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 0 })
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 1700 })
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 1700 })
    const cell = container.querySelector('tbody tr .byd-data-bodycell') as HTMLElement
    fireEvent.focusIn(cell)
    return container.innerHTML
  } finally {
    unmount()
  }
}

const shellOf = (html: string, extra: string) =>
  read('index.html')
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${read('src/editor/editor.css')}\n${read('src/buttons.css')}${extra}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root"><div class="byd-editor" data-page="editor" data-mode="table"><main><div role="tabpanel">${html}</div></main></div></div>`)

type Sedd = {
  // Hela verktygsraden mot lådans synfält, och etiketten den ska stå bredvid.
  verktygInne: boolean
  isär: number
  // Att kolumnen verkligen är bredare än lådan, annars säger ingenting ovan något.
  kolumn: number
  låda: number
  // Och vad huvudet står över: skrivytans vänsterkant ska vara cellhuvudets, så raden inte
  // svävar någon annanstans än ovanför det man skriver i (L39).
  huvudetÖverSkrivytan: boolean
}

async function measure(width: number, extra = ''): Promise<Sedd> {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  try {
    await page.setContent(shellOf(markup(), extra), { waitUntil: 'load' })
    return await page.evaluate(
      ({ deck, fit, mark, pin }) => {
        const box = document.querySelector('.byd-data-scroll') as HTMLElement
        new Function('box', 'deck', `(${fit})(box, deck)`)(box, deck)
        new Function('box', `(${mark})(box)`)(box)
        new Function('box', `(${pin})(box)`)(box)
        const låda = box.getBoundingClientRect()
        const verktyg = box.querySelector('.byd-data-bodytools')!.getBoundingClientRect()
        const etikett = box.querySelector('.byd-data-bodyhead > b')!.getBoundingClientRect()
        const huvud = box.querySelector('.byd-data-bodyhead')!.getBoundingClientRect()
        const skriv = box.querySelector('.byd-data-bodycell .byd-data-body')!.getBoundingClientRect()
        return {
          verktygInne: verktyg.left >= låda.left && verktyg.right <= låda.right + 1,
          isär: Math.round(verktyg.left - etikett.left),
          kolumn: Math.round(box.querySelector('thead th[data-col="body"]')!.getBoundingClientRect().width),
          låda: Math.round(låda.width),
          huvudetÖverSkrivytan: Math.abs(huvud.left - skriv.left) <= 2 && Math.abs(huvud.right - skriv.right) <= 2,
        }
      },
      { deck: deckValues(deck(), sv), fit: String(fitColumns), mark: String(markValues), pin: String(markCut) },
    )
  } finally {
    await page.close()
  }
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

describe('verktygen i en öppen body-cell (#397, L39)', () => {
  it('står hela på skärmen vid 1440, 1280 och 1024, hur bred kolumnen än är', async () => {
    const sedda = await Promise.all([1440, 1280, 1024].map((width) => measure(width)))

    for (const [i, sedd] of sedda.entries()) {
      const vid = [1440, 1280, 1024][i]
      // Villkoret som gör frågan värd att ställa: kolumnen är verkligen bredare än lådan.
      expect(sedd.kolumn, `kolumnen vid ${vid}`).toBeGreaterThan(sedd.låda)
      expect(sedd.verktygInne, `verktygen vid ${vid}`).toBe(true)
      // Och huvudet står över skrivytan och ingen annanstans (L39).
      expect(sedd.huvudetÖverSkrivytan, `huvudet vid ${vid}`).toBe(true)
    }
  }, 60_000)

  // Att det verkligen är ett villkor: taket borttaget och ingenting annat ändrat, och raden
  // hamnar där granskningen fann den — över tusen pixlar från sin egen etikett och utanför bild.
  it('är ett verkligt villkor: utan taket står raden utanför skärmen igen', async () => {
    const [med, utan] = await Promise.all([
      measure(1440),
      measure(1440, '.byd-data-bodycell[data-open] { max-width: none !important; }'),
    ])

    expect(utan.verktygInne).toBe(false)
    expect(utan.isär).toBeGreaterThan(1000)
    expect(med.isär).toBeLessThan(utan.isär)
  }, 60_000)
})
