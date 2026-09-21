// @vitest-environment jsdom
// Radens hovring (#400), och den mätning beslutet hänger på.
//
// Raden under pekaren var oförändrad: `getComputedStyle` gav `rgb(27, 29, 35)` före och efter
// `pointermove`, och tabellen är 2 552 px i en 1 408 px låda. Ingenting band ihop en rad tvärs över
// rullningen. Beslutet är att radens egen grund lyfts svagt — en genomskinlig vit slöja på 3 %,
// lagd på cellen och inte på raden — hela vägen ut till högerkanten.
//
// Två saker gör den här sviten till en webbläsarsvit och inte till en läsning av arket.
//
// Den ena är att lyftet ska *synas*, och en rad har fem grunder att synas på: vanlig, markerad
// (#17), påtittad, och jämförelsens två toner (B4). De två sista sätts på `td` och inte på `tr`,
// så en tint lagd på raden hamnar under dem och syns inte alls på en jämförd rad. Det är inget en
// regel i arket kan svara på; det är kaskaden som svarar, och den svarar bara i en motor.
//
// Den andra är färgen. Slöjan är genomskinlig, så vad ögat får är en komposition och inte ett
// värde någon skrivit. Mätningen läser därför *målade bildpunkter*: en skärmbild ritas in i en
// duk och cellens grund är den vanligaste färgen i dess ruta. Det ger riktiga `rgb(...)` och går
// därmed fri från fällan i #376 — Chromium svarar `color(srgb …)` på `color-mix` och på
// procentalfa, och `contrast.ts` tar inte den formen. Och det är målningen som är påståendet:
// ingen färglitteral i den här filen säger vad en grund är, utan varje siffra nedan är en
// skillnad mellan två uppmätta luminanser.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { chromium, type Browser, type Page } from 'playwright'
import { DataTable } from '../src/editor/DataTable.js'
import { deckValues, fitColumns, markValues } from '../src/editor/columns.js'
import { contrastRatio, cssDeclaredUnder, parseColor, relativeLuminance } from '../src/player/contrast.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { translate, type T } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

const sv: T = (key, params) => translate('sv', key, params)
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')

// Radens fem grunder, en rad var, i en och samma tabell — så att alla fem mäts mot samma
// målning, med samma text och i samma motor.
const GROUNDS = {
  vanlig: 'plain',
  markerad: 'marked',
  påtittad: 'previewed',
  'jämförelse · tillagd': 'added',
  'jämförelse · borttagen': 'removed',
} as const
type Ground = keyof typeof GROUNDS

// De fastnålade cellerna (#145, #53). De ska lyftas med resten av raden, var och en från sin egen
// vila: `byd-data-check` och `byd-data-id` ärver radens grund, `byd-data-remove` har en egen.
const PINNED = ['byd-data-check', 'byd-data-id', 'byd-data-remove'] as const

// Kortet som står kvar i den äldre versionen är det som blir `data-change='removed'`; det som bara
// finns nu blir `added`. De tre första rörs inte, så de bär sin grund av andra skäl än jämförelsen.
function now_(): ProjectDoc {
  return {
    ...projectDoc(),
    rows: [
      { id: 'plain', fields: { title: 'Drake', body: 'Flygande.', antal: 2 } },
      { id: 'marked', fields: { title: 'Riddare', body: 'Sköld 1.', antal: 1 } },
      { id: 'previewed', fields: { title: 'Trollkarl', body: 'Dra ett kort.', antal: 1 } },
      { id: 'added', fields: { title: 'Alv', body: 'Snabb.', antal: 1 } },
    ],
  }
}
function before(): ProjectDoc {
  const doc = now_()
  return { ...doc, rows: [...doc.rows.slice(0, 3), { id: 'removed', fields: { title: 'Troll', body: 'Stor.', antal: 1 } }] }
}

// Tabellen som editorn ritar den: ett kort på förhandsvisningen, ett bockat, och en jämförelse
// med en äldre version i gång.
function markup(): string {
  const { container, unmount } = render(
    <DataTable
      doc={now_()}
      selectedRow="previewed"
      onSelectRow={() => undefined}
      onCell={() => undefined}
      onAddRow={() => undefined}
      onRemoveRow={() => undefined}
      onReplaceRows={() => undefined}
      onAddField={() => undefined}
      onRemoveField={() => undefined}
      onMoveField={() => undefined}
      compareWith={{ rev: 1, doc: before() }}
    />,
  )
  try {
    fireEvent.click(container.querySelector('tr[data-card-ref="marked"] .byd-data-check input')!)
    // React håller en bocks tillstånd i egenskapen och inte i attributet, så en serialisering
    // skulle tappa den — och med den grunden `tr:has(input:checked)` målar. Bocken skrivs därför
    // ned i attributet innan markeringen tas ut, så sidan som mäts är den sidan som ritades.
    for (const box of container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) if (box.checked) box.setAttribute('checked', '')
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

// Editorns egna två beslut om bredd, körda på sidan i den ordning den fattar dem.
const FIT = `(box, deck) => { (${String(fitColumns)})(box, deck); (${String(markValues)})(box) }`

const WIDTH = 1280

/**
 * Vad de utpekade elementen faktiskt är *målade* i: den vanligaste färgen inne i vart och ett av
 * deras rutor, läst ur en skärmbild av sidan som den står just nu.
 *
 * Grannen `painted.ts` svarar i percentiler, vilket är rätt svar om grunden är en gradient. Här är
 * grunden en flat färg med en bokstav eller en bock ovanpå, och då är den vanligaste färgen precis
 * grunden och ingenting annat. En cell där grunden inte är i majoritet faller i stället för att
 * svara med kanten på ett tecken.
 *
 * Med en tolerans på ett steg per kanal, och det är inte slarv: Chromium ditherar en gradient, så
 * en slöja som är samma färg i båda ändar kan ändå landa på två grannvärden i stället för ett. En
 * mätning som krävde ett enda tripplettvärde skulle rapportera en minoritet — den föll på 39 % —
 * och den skulle dessutom vara en mätning av vilken maskin som målade, vilket inget prov här får
 * vara (#325). Grunden är därför klungan runt det vanligaste värdet, vägt medelvärde och allt.
 */
async function groundsOf(page: Page, where: Record<string, string>): Promise<Record<string, string>> {
  const shot = (await page.screenshot()).toString('base64')
  return page.evaluate(
    async ({ shot, where }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${shot}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      // Bilden är skärmen i den skala webbläsaren tog den i; rutorna nedan är i CSS-pixlar.
      const scale = image.naturalWidth / window.innerWidth
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data

      const out: Record<string, string> = {}
      for (const [what, selector] of Object.entries(where)) {
        const el = document.querySelector(selector)
        if (!el) throw new Error(`inget matchar ${selector}, så «${what}» mäter ingenting`)
        const box = el.getBoundingClientRect()
        const counts = new Map<string, number>()
        let total = 0
        // Två pixlar in från varje kant: cellens egen linje under sig är inte dess grund.
        for (let y = Math.ceil(box.top + 2); y < box.bottom - 2; y++)
          for (let x = Math.ceil(box.left + 2); x < box.right - 2; x++) {
            const px = Math.round(x * scale)
            const py = Math.round(y * scale)
            if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue
            const i = (py * canvas.width + px) * 4
            const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`
            counts.set(key, (counts.get(key) ?? 0) + 1)
            total++
          }
        if (total < 200) throw new Error(`«${what}» lästes på ${total} bildpunkter; det är ingen grund`)
        const mode = [...counts].sort((a, b) => b[1] - a[1])[0]![0].split(',').map(Number)
        const cluster = [...counts].filter(([key]) => key.split(',').every((v, i) => Math.abs(Number(v) - mode[i]!) <= 1))
        const seen = cluster.reduce((sum, [, n]) => sum + n, 0)
        if (seen / total < 0.4) throw new Error(`«${what}» har ingen färg i majoritet (${Math.round((100 * seen) / total)} %); det är ingen grund`)
        const mean = [0, 1, 2].map((i) => cluster.reduce((sum, [key, n]) => sum + Number(key.split(',')[i]) * n, 0) / seen)
        out[what] = `rgb(${mean.map((v) => v.toFixed(3)).join(', ')})`
      }
      return out
    },
    { shot, where },
  )
}

/** Var en grunds egen ruta står: en vanlig cell för raden, och de tre fastnålade. */
const cellsOf = (ground: Ground): Record<string, string> => {
  const row = `.byd-data tbody tr[data-card-ref="${GROUNDS[ground]}"]`
  return Object.fromEntries([[ground, `${row} td[data-col="title"]`], ...PINNED.map((pin) => [`${ground} · ${pin}`, `${row} .${pin}`])])
}

const EVERY_CELL: Record<string, string> = Object.assign({}, ...Object.keys(GROUNDS).map((g) => cellsOf(g as Ground)))

type Readings = {
  /** Varje rutas vila och samma ruta under pekaren, som målad färg. */
  rest: Record<string, string>
  hover: Record<string, string>
  /** Den text raden faktiskt bär, som motorn räknar fram den. */
  ink: Record<Ground, string>
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// Sex skärmbilder och en uppslagning: dyrt nog att göra en gång och dela, och ingenting i sviten
// skriver till sidan, så delningen är säker.
let taken: Promise<Readings> | null = null
const readings = () => (taken ??= measure())

async function measure(): Promise<Readings> {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } })
  try {
    await page.setContent(shellOf(markup()), { waitUntil: 'load' })
    await page.evaluate(({ deck, fit }) => new Function('box', 'deck', `(${fit})(box, deck)`)(document.querySelector('.byd-data-scroll'), deck), {
      deck: deckValues(now_(), sv),
      fit: FIT,
    })

    // Pekaren ur vägen, och alla fem grunder i vila på en och samma målning.
    await page.mouse.move(0, 0)
    const rest = await groundsOf(page, EVERY_CELL)

    // Och en målning per grund, med pekaren över just den radens cell.
    const hover: Record<string, string> = {}
    for (const ground of Object.keys(GROUNDS) as Ground[]) {
      await page.hover(`.byd-data tbody tr[data-card-ref="${GROUNDS[ground]}"] td[data-col="title"]`)
      Object.assign(hover, await groundsOf(page, cellsOf(ground)))
    }

    const ink = await page.evaluate(
      (rows) =>
        Object.fromEntries(
          Object.entries(rows).map(([ground, cardRef]) => {
            const field = document.querySelector(`.byd-data tbody tr[data-card-ref="${cardRef}"] td[data-col="title"] input`)
            if (!field) throw new Error(`raden ${cardRef} har inget fält att läsa texten ur`)
            return [ground, getComputedStyle(field).color]
          }),
        ),
      GROUNDS as Record<string, string>,
    )
    return { rest, hover, ink: ink as Record<Ground, string> }
  } finally {
    await page.close()
  }
}

const lift = (r: Readings, what: string) => relativeLuminance(r.hover[what]!) - relativeLuminance(r.rest[what]!)

// Det minsta lyft som är ett lyft. Prototypen mätte 5,2 på den vanligaste grunden och lade domens
// golv på 1,5; det är den siffran, uttryckt i samma enhet som allt annat här.
const VISIBLE = 0.0015

// Stegen mellan de grunder som betyder något om *samma* fråga: är raden bockad, och är den kortet
// på förhandsvisningen. Ett lyft lika stort som ett av de stegen gör hovringen omöjlig att skilja
// från ett byte av det tillståndet, och det är precis vad acceptanskriteriet förbjuder.
const LADDER = ['vanlig', 'markerad', 'påtittad'] as const
// «Inte närmare nästa grunds vila än tre fjärdedelar av steget dit.»
const ROOM = 0.75

describe('hovringen över en rad i tabellen (#400)', () => {
  it('mäter fem grunder och inte en, och läser grunden och inte en bokstav', async () => {
    const r = await readings()
    // Fem olika målningar: annars vore allt nedan ett påstående om en och samma rad fem gånger.
    expect(new Set(Object.keys(GROUNDS).map((g) => r.rest[g])).size).toBe(5)
    // Och den vanligaste färgen i en cell är den grund arket säger att raden har. Värdet läses ur
    // arket och står inte skrivet här, så en ommålad rad målar om det här provet med sig.
    const declared = /background:\s*(#[0-9a-f]{3,8})/i.exec(cssDeclaredUnder(read('src/editor/editor.css'), '.byd-data tbody tr'))?.[1]
    expect(declared, 'arket förklarar ingen grund för en rad i tabellen').toBeTruthy()
    expect(parseColor(r.rest['vanlig']!).map(Math.round)).toEqual(parseColor(declared!))
  }, 120_000)

  it('lyfter grunden på var och en av radens fem grunder, mätt i relativ luminans', async () => {
    const r = await readings()
    const flat = (Object.keys(GROUNDS) as Ground[]).filter((g) => !(lift(r, g) > VISIBLE)).map((g) => `${g} lyfts ${(lift(r, g) * 1000).toFixed(1)}, och ett lyft är minst ${(VISIBLE * 1000).toFixed(1)}`)
    expect(flat).toEqual([])
  }, 120_000)

  it('tar inte över någon av dem: ingen hovrad grund går tre fjärdedelar av steget till nästa', async () => {
    const r = await readings()
    const rung = LADDER.slice(0, -1).map((from, i) => ({ from, to: LADDER[i + 1]!, step: relativeLuminance(r.rest[LADDER[i + 1]!]!) - relativeLuminance(r.rest[from]!) }))
    // Stegen är verkliga steg och inte två mätningar av samma färg, annars vore taket noll och
    // varje lyft en överträdelse — eller, med ett tecken fel, ingen alls.
    expect(rung.filter((one) => one.step > 0).length).toBe(rung.length)
    const shortest = Math.min(...rung.map((one) => one.step))

    const tooFar = [
      // Var och en av de två grunder som *har* en nästa: hovrad, mot nästas vila.
      ...rung.filter((one) => lift(r, one.from) >= one.step * ROOM).map((one) => `${one.from} hovrad går ${(lift(r, one.from) * 1000).toFixed(1)} av ${(one.step * 1000).toFixed(1)} till ${one.to}`),
      // Och de tre som inte har någon: de får ändå inte lyftas ett helt steg, för då läses
      // hovringen som ett byte av tillstånd var den än ligger.
      ...(Object.keys(GROUNDS) as Ground[]).filter((g) => lift(r, g) >= shortest * ROOM).map((g) => `${g} hovrad lyfts ${(lift(r, g) * 1000).toFixed(1)}, vilket är ett helt steg (${(shortest * 1000).toFixed(1)})`),
    ]
    expect(tooFar).toEqual([])
  }, 120_000)

  it('håller textkontrasten mot den text raden faktiskt bär, den dämpade medräknad', async () => {
    const r = await readings()
    // Den borttagna raden bär sin egen dämpade text. Att den gör det är halva provet: en kopierad
    // form bär inte med sig sitt underlag (#372), och mätt mot fältets vanliga bläck hade den
    // svåraste kombinationen aldrig mätts.
    expect(new Set(Object.values(r.ink)).size).toBeGreaterThan(1)
    expect(r.ink['jämförelse · borttagen']).not.toBe(r.ink['vanlig'])
    const under = (Object.keys(GROUNDS) as Ground[])
      .map((g) => ({ g, ratio: contrastRatio(r.ink[g]!, r.hover[g]!) }))
      .filter(({ ratio }) => ratio < 4.5)
      .map(({ g, ratio }) => `${g} hovrad: ${ratio.toFixed(2)}:1`)
    expect(under).toEqual([])
  }, 120_000)

  it('lyfter de fastnålade cellerna med resten av raden, hela vägen ut till högerkanten', async () => {
    const r = await readings()
    const dead = (Object.keys(GROUNDS) as Ground[])
      .flatMap((g) => PINNED.map((pin) => `${g} · ${pin}`))
      .filter((what) => !(lift(r, what) > VISIBLE))
      .map((what) => `${what} lyfts ${(lift(r, what) * 1000).toFixed(1)}`)
    expect(dead).toEqual([])
  }, 120_000)
})
