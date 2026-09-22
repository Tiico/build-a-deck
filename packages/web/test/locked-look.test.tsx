// @vitest-environment jsdom
// Hur de två skärmarna målar ett tillstånd (#416): en låst kontroll, och beskedet som säger varför
// en väg inte går.
//
// En låst knapp ska se låst ut — och ändå gå att läsa.
//
// Issuet läste `Sätt dig` som `opacity: 1` och drog slutsatsen att den ser tryckbar ut. Mätt på det
// *målade* är det värre: `join.css` målade om den låsta första handlingen till `#242938`, vilket
// mot sidans egen botten `#14161c` är 1,25:1 — pillret försvann i sidan i stället för att låsas.
// De två under det tonades samtidigt till 35 % (kant 1,56:1, bläck 2,77:1), och wizarden gjorde sin
// egen variant med `opacity: .4` (kant 1,61:1, bläck 2,38:1). Tre låsta kontroller, låsta tre olika
// mycket, och ingen av dem läsbar.
//
// Prototypen (`docs/ux-audits/2026-09-21/prototyper/05-namnet-wizarden.html`, `06-…anslutningen`)
// gav ett låst utseende för båda ytorna: fyllningen tas bort, för fyllningen är affordansen, men
// linjen står kvar så att kontrollen fortfarande är ett piller — rummets egen sekundärlinje som
// kant och ett dämpat bläck över den grund den faktiskt står på.
//
// Mätt här, efter rättelsen: `Sätt dig` kant 4,19:1 och bläck 4,71:1, «Spela på den här skärmen»
// kant 4,19:1 och bläck 5,87:1, «Ta bort valt kort» på papperet kant 3,78:1 och bläck 5,52:1 —
// samma siffror prototypen gav. Golven nedan är 3:1 för en grafisk linje och 4,5:1 för text, så
// siffrorna får röra sig med en palett; det som inte får röra sig är att de tre är låsta lika.
//
// Frågan «ser den låst ut?» besvaras inte av ett attribut, så ingenting här läser en deklaration:
// varje färg räknas fram ur det som målas, med `opacity` invägd hela vägen upp genom förfäderna —
// och Chromium svarar `color(srgb …)` på allt framräknat, vilket är den fälla `contrast.ts` faller
// i om den får läsa svaret rått (#372). Därför normaliseras varje färg i sidan innan den mäts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { JoinPage } from '../src/join/JoinPage.js'
import { NewProjectPage } from '../src/wizard/NewProjectPage.js'
import { TableClient } from '../src/client.js'
import { contrastRatio, flatten, parseColor } from '../src/player/contrast.js'
import { asTable, createSession, roomOf, startServer, twoSeatSetup, type Running } from './fixture.js'
import { fireEvent } from '@testing-library/react'

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')
// Båda ytorna i ett och samma dokument-bygge: varje yta bär sin egen rot, och knappspråket ligger
// över dem båda, som det gör i appen.
const css = `${read('src/join/join.css')}\n${read('src/wizard/wizard.css')}\n${read('src/buttons.css')}\n${read('src/a11y.css')}`

const document_ = (body: string) =>
  shell
    .replace('<script type="module" src="/src/main.tsx"></script>', '')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)

/** En låst kontroll, som den målas. Varje färg är normaliserad till `rgba(…)` i sidan. */
type Locked = {
  /** Orden på knappen, så att ett fall säger vilken kontroll som inte gick att läsa. */
  text: string
  /** Att den verkligen är låst — en mätning av en öppen knapp bevisar ingenting. */
  disabled: boolean
  /** Grunderna under knappen, ytterst först, var och en tonad av sin egen genomskinlighet. */
  under: string[]
  fill: string
  line: string
  ink: string
  /** Den sammanlagda genomskinligheten över kontrollen: 1 betyder att den inte tonas bort. */
  opacity: number
}

const lockedIn = (markup: string, root: string, width: number, height: number): Promise<Locked[]> =>
  browser.newPage({ viewport: { width, height } }).then(async (page) => {
    try {
      await page.setContent(document_(markup), { waitUntil: 'load' })
      return await page.evaluate((where) => {
        // Chromium svarar `color(srgb 0.1 0.1 0.1 / 0.4)` på allt framräknat; `contrast.ts` läser
        // `rgba()`. Tonen vägs in här, eftersom `opacity` inte ingår i den färg som svaras.
        const faded = (colour: string, by: number): string => {
          const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(colour.trim())
          const parts = srgb
            ? [...srgb.slice(1, 4).map((v) => String(Math.round(Number(v) * 255))), srgb[4]]
            : /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+))?\s*\)/.exec(colour)?.slice(1)
          if (!parts) throw new Error(`inte en färg sidan svarade med: ${colour}`)
          return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${(Number(parts[3] ?? 1) * by).toFixed(4)})`
        }
        const surface = document.querySelector(where)
        if (!surface) throw new Error(`ingen ${where} i den här vyn`)
        const out = []
        for (const el of surface.querySelectorAll('button')) {
          if (!el.disabled) continue
          // Var och en av knappens förfäder, ytterst först, med tonen buren neråt.
          const chain: Element[] = []
          for (let at: Element | null = el; at; at = at.parentElement) chain.push(at)
          chain.reverse()
          let carried = 1
          const under: string[] = []
          for (const step of chain) {
            const style = getComputedStyle(step)
            const own = parseFloat(style.opacity)
            carried *= Number.isFinite(own) ? own : 1
            if (style.backgroundImage !== 'none') throw new Error(`${step.tagName} målar en bild och inte en färg; bara pixlar kan svara för den`)
            if (step !== el) under.push(faded(style.backgroundColor, carried))
          }
          const own = getComputedStyle(el)
          out.push({
            text: (el.textContent ?? '').trim().slice(0, 40),
            disabled: el.disabled,
            under,
            fill: faded(own.backgroundColor, carried),
            line: faded(own.borderTopColor, carried),
            ink: faded(own.color, carried),
            opacity: carried,
          })
        }
        return out
      }, root)
    } finally {
      await page.close()
    }
  })

/** Vad en låst kontroll når: kanten mot rummet, och bläcket mot sin egen grund. */
type Reading = { text: string; edge: number; ink: number; opacity: number; fill: string }
function readingOf(one: Locked): Reading {
  // Duken under allt, så att en yta som inte målar något ogenomskinligt mäts mot något i stället
  // för att räknas som svart.
  const room = flatten(['rgb(255, 255, 255)', ...one.under])
  const fill = flatten([room, one.fill])
  const line = flatten([room, one.line])
  return {
    text: one.text,
    // Formen mot rummet: fyllningen om den syns, annars linjen. En grafisk linje hålls till 3:1.
    edge: Math.max(contrastRatio(fill, room), contrastRatio(line, room)),
    ink: contrastRatio(flatten([fill, one.ink]), fill),
    opacity: one.opacity,
    fill,
  }
}

let run: Running
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)
beforeEach(async () => {
  run = await startServer()
}, 60_000)
afterEach(async () => {
  await run.stop()
}, 60_000)

// Anslutningssidan med varje plats tagen: då är de två vägarna till en plats verkligen låsta, och
// det är i det läget `Sätt dig` målades om till en färg som inte syntes.
async function fullPicker(): Promise<string> {
  const id = await createSession(run, 's1', undefined, twoSeatSetup())
  const table = TableClient.connect(await asTable(run, id))
  await table.ready()
  for (const [seat, name] of [
    ['A', 'Ada'],
    ['B', 'Bo'],
  ])
    await table.send({ v: 'seat.claim', seat: seat!, name: name! })
  history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<JoinPage />)
  await screen.findByRole('button', { name: /Sätt dig/ })
  await screen.findByText('Bo')
  const html = container.innerHTML
  unmount()
  table.close()
  return html
}

// Samma två skärmar, i det läge där beskedet står: en utgång tryckt med tomt fält.
async function refusedPicker(): Promise<string> {
  const id = await createSession(run, 's2', undefined, twoSeatSetup())
  history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<JoinPage />)
  fireEvent.click(await screen.findByRole('button', { name: /Sätt dig/ }))
  await screen.findByRole('alert')
  const html = container.innerHTML
  unmount()
  return html
}

async function openPicker(): Promise<string> {
  const id = await createSession(run, 's3', undefined, twoSeatSetup())
  history.replaceState(null, '', `/join?code=${roomOf(id).code}&server=${encodeURIComponent(run.url)}`)
  const { container, unmount } = render(<JoinPage />)
  await screen.findByRole('button', { name: /Sätt dig/ })
  const html = container.innerHTML
  unmount()
  return html
}

// Wizarden som den öppnar: ett kort finns, så «Ta bort valt kort» är låst av sitt eget skäl och
// har aldrig haft med namnet att göra. Det är den kontroll som ska *förbli* låst — och som därför
// måste bära det låsta utseendet.
function guide(): string {
  history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
  const { container, unmount } = render(<NewProjectPage />)
  const html = container.innerHTML
  unmount()
  return html
}

function guideRefused(): string {
  history.replaceState(null, '', `/new?server=${encodeURIComponent(run.http)}`)
  const { container, unmount } = render(<NewProjectPage />)
  fireEvent.click(screen.getByRole('button', { name: /fortsätt i editorn/i }))
  const html = container.innerHTML
  unmount()
  return html
}

describe('en låst kontroll ser låst ut och går att läsa (#416)', () => {
  it('håller varje låst kontroll på de två skärmarna över 3:1 i kant och 4,5:1 i bläck', async () => {
    const picker = await lockedIn(await fullPicker(), '.byd-join', 390, 844)
    const wizard = await lockedIn(guide(), '.byd-wizard', 1440, 900)

    // Inte tomt: båda ytorna lämnade verkligen låsta kontroller att mäta, och de kontroller som
    // hela frågan gäller är bland dem. En mätning som inte hittade sitt ämne får aldrig se ut som
    // ett godkänt.
    expect(picker.map((one) => one.text)).toEqual(expect.arrayContaining([expect.stringMatching(/Sätt dig/), expect.stringMatching(/Spela på den här skärmen/)]))
    expect(wizard.map((one) => one.text)).toEqual(expect.arrayContaining([expect.stringMatching(/Ta bort valt kort/)]))
    expect([...picker, ...wizard].every((one) => one.disabled)).toBe(true)

    const measured = [...picker, ...wizard].map(readingOf)
    // Kanten: formen mot rummet, som varje annan grafisk linje.
    expect(measured.filter((one) => one.edge < 3).map((one) => `«${one.text}» kant ${one.edge.toFixed(2)}:1`)).toEqual([])
    // Bläcket: orden på knappen, som varje annan text.
    expect(measured.filter((one) => one.ink < 4.5).map((one) => `«${one.text}» bläck ${one.ink.toFixed(2)}:1`)).toEqual([])
    // Och ingen av dem tonas bort: `opacity` på en kontroll är precis det grepp som gjorde de tre
    // låsta kontrollerna låsta tre olika mycket.
    expect(measured.filter((one) => one.opacity !== 1).map((one) => `«${one.text}» tonad till ${one.opacity}`)).toEqual([])
  }, 120_000)

  it('låser kontrollerna på anslutningssidan lika mycket, i ett bläck och utan att tona bort något', async () => {
    const locked = await lockedIn(await fullPicker(), '.byd-join', 390, 844)
    expect(locked.length).toBeGreaterThan(1)
    // Ett bläck för hela ytan, vilket är hela rättelsen: en av dem målades om till något som inte
    // syntes medan de två under den tonades till 35 %, så de var låsta olika mycket.
    expect(new Set(locked.map((one) => JSON.stringify(parseColor(one.ink)))).size).toBe(1)
    expect(new Set(locked.map((one) => one.opacity))).toEqual(new Set([1]))
  }, 120_000)
})

// Beskedet som kommer vid tryck. Det ska läsas som ett svar och inte som en bildtext: en rad i
// samma ton som prosan omkring den är en rad ögat sorterar bort, och det är just den rad som ska
// fånga blicken när en väg framåt inte gick.
const saidIn = (markup: string, root: string, width: number, height: number): Promise<{ ink: string; prose: string; ground: string }> =>
  browser.newPage({ viewport: { width, height } }).then(async (page) => {
    try {
      await page.setContent(document_(markup), { waitUntil: 'load' })
      return await page.evaluate((where) => {
        const surface = document.querySelector(where)!
        const said = surface.querySelector('[role="alert"]')
        if (!said) throw new Error(`ingen ${where} med ett besked i; ingenting mättes`)
        // Prosan omkring: ytans eget stycke, som beskedet inte får vara en kopia av.
        const prose = surface.appendChild(document.createElement('p'))
        const proseInk = getComputedStyle(prose).color
        prose.remove()
        let ground = 'rgba(0, 0, 0, 0)'
        for (let at: Element | null = said; at; at = at.parentElement) {
          const paint = getComputedStyle(at).backgroundColor
          if (!/,\s*0\)$/.test(paint) && paint !== 'transparent') {
            ground = paint
            break
          }
        }
        return { ink: getComputedStyle(said).color, prose: proseInk, ground }
      }, root)
    } finally {
      await page.close()
    }
  })

describe('beskedet vid fältet syns som ett svar (#416)', () => {
  it('skriver det i en egen ton på båda skärmarna, och håller den läsbar', async () => {
    const said = {
      'anslutningssidan': await saidIn(await refusedPicker(), '.byd-join', 390, 844),
      'wizarden': await saidIn(guideRefused(), '.byd-wizard', 1440, 900),
    }
    // Inte ytans vanliga prosa: ett besked i samma ton som texten omkring läses som en bildtext.
    expect(Object.entries(said).filter(([, one]) => one.ink === one.prose).map(([where]) => where)).toEqual([])
    // Och läsbart där det står.
    const read = Object.entries(said).map(([where, one]) => [where, contrastRatio(flatten([one.ground, one.ink]), one.ground)] as const)
    expect(read.filter(([, ratio]) => ratio < 4.5).map(([where, ratio]) => `${where}: ${ratio.toFixed(2)}:1`)).toEqual([])
  }, 120_000)
})

// Fältet som beskedet handlar om bär `aria-invalid`, och det får inte bara stå i trädet: den som
// ser skärmen ska se vilket fält som pekas ut, utan att läsa raden under det.
const fieldMark = (markup: string, root: string, width: number, height: number): Promise<{ line: string; bg: string }> =>
  browser.newPage({ viewport: { width, height } }).then(async (page) => {
    try {
      await page.setContent(document_(markup), { waitUntil: 'load' })
      return await page.evaluate((where) => {
        const srgb = (colour: string): string => {
          const parts = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(colour.trim())
          if (!parts) return colour
          return `rgba(${parts.slice(1, 4).map((v) => Math.round(Number(v) * 255)).join(', ')}, ${parts[4] ?? 1})`
        }
        const field = document.querySelector(`${where} input:not([type='file']):not([type='number'])`)
        if (!field) throw new Error(`inget fält i ${where}; ingenting mättes`)
        const style = getComputedStyle(field)
        return { line: srgb(style.borderTopColor), bg: srgb(style.backgroundColor) }
      }, root)
    } finally {
      await page.close()
    }
  })

describe('fältet beskedet handlar om är utpekat på skärmen (#416)', () => {
  it('märker det med en linje av sin egen, som syns mot fältets egen botten', async () => {
    const marked = {
      'anslutningssidan': { rest: await fieldMark(await openPicker(), '.byd-join', 390, 844), said: await fieldMark(await refusedPicker(), '.byd-join', 390, 844) },
      'wizarden': { rest: await fieldMark(guide(), '.byd-wizard', 1440, 900), said: await fieldMark(guideRefused(), '.byd-wizard', 1440, 900) },
    }
    // Inte samma linje som i vila: ett fält som ser likadant ut utpekat som orört är inte utpekat.
    expect(Object.entries(marked).filter(([, one]) => one.said.line === one.rest.line).map(([where]) => where)).toEqual([])
    // Och linjen syns: en grafisk linje hålls till 3:1, här mot den botten fältet självt har.
    const read = Object.entries(marked).map(([where, one]) => [where, contrastRatio(flatten([one.said.bg, one.said.line]), one.said.bg)] as const)
    expect(read.filter(([, ratio]) => ratio < 3).map(([where, ratio]) => `${where}: ${ratio.toFixed(2)}:1`)).toEqual([])
  }, 120_000)
})
