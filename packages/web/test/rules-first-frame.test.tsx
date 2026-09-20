// @vitest-environment jsdom
// Vad första bildrutan visar av regelboken (#346).
//
// Boken låg i den blockerande stilmallen för en lucka ingen hade öppnat. Sedan den flytten är
// luckans insida ett ark som reser med sin egen modul, och två saker måste hålla för att flytten
// ska vara värd något — de två villkor issuet ställer och som ingenting annat mäter:
//
//  * `Regler`-knappen ritas *färdig* på första bildrutan. Den hör till bordet och inte till
//    boken, så den får inte vänta på något.
//  * Luckan öppnas aldrig ostilad. Det som väntar är luckan, och medan den väntar finns den
//    inte alls — en oklädd ruta i en halv sekund vore dyrare än de kilobyte flytten sparade.
//
// De två är av olika slag och mäts därför olika. Det första är en fråga om vad en riktig motor
// ritar av ett ark, så det ställs till Chromium mot de ark rummet har i sin blockerande stilmall
// — rummets egna plus `rules-open.css`, och uttryckligen *inte* `rules.css`. Det gick att ställa
// i e2e mot det byggda arket i stället, men den mätningen hade svarat på en annan fråga: e2e vet
// vilka ark som blockerar, vilket `felt-font.spec.ts` redan grindar, medan det som är osäkert
// här är om knappen är *färdigritad* utan luckans ark. Det svaret kräver att man ritar knappen
// två gånger, med och utan arket, och jämför — och det är billigare och exaktare här.
//
// Det andra är en fråga om React och inte om CSS: finns luckan i DOM:en innan dess modul är
// hämtad? Den ställs därför i jsdom, med hämtningen hållen i handen.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { chromium, type Browser } from 'playwright'
import { Language } from '../src/i18n/index.js'
import { RuleShelf } from '../src/rules/RuleDrawer.js'
import { contrastRatio } from '../src/player/contrast.js'
import { TOUCH_PX } from '../src/table/fit.js'

// Luckans modul hålls i handen, så att «medan den hämtas» blir ett tillstånd provet kan mäta i
// stället för ett ögonblick det får hoppas på. Grinden öppnas först när påståendet om den tomma
// reserven är ställt.
const gate = vi.hoisted(() => {
  let open!: () => void
  const held = new Promise<void>((resolve) => {
    open = resolve
  })
  return { held, open }
})

vi.mock('../src/rules/RulePanel.js', async (importOriginal) => {
  await gate.held
  return await importOriginal<typeof import('../src/rules/RulePanel.js')>()
})

const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const shell = read('index.html')

// De ark som står i dokumentet före första målningen, oavsett vilken skärm det är: knappspråket,
// tillgängligheten och vägen in i boken. `rules.css` är med flit inte med någonstans — det är
// hela saken som ska bevisas.
const FIRST_FRAME = ['src/a11y.css', 'src/buttons.css', 'src/rules/rules-open.css']

// Knappen som den står på sin yta, ritad av produktens egen komponent. Boken är ännu inte hämtad,
// vilket är precis vad den är på första bildrutan.
function buttonMarkup(placement: Placement): string {
  const { container, unmount } = render(
    <Language lang="sv">
      <RuleShelf rules={null} placement={placement} />
    </Language>,
  )
  try {
    return container.innerHTML
  } finally {
    unmount()
  }
}

let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser.close()
}, 60_000)

// Knappen står på alla tre ytorna och är olika stor på telefonen, så alla tre mäts. Det är den
// enda platsen ett ark kan gömma sig på: en knapp som ser rätt ut vid bordet kan ha sin telefon-
// form i luckans ark, och då är den oritad på första bildrutan just där måtten är minst.
type Placement = 'table' | 'tv' | 'phone'
const PLACEMENTS: readonly Placement[] = ['table', 'tv', 'phone']

// Rummet varje placering faktiskt rider i, och de ark det rummet har före första målningen.
//
// Knappen mäts i sitt rum och inte i en tom ruta, för träffytan är inte knappens ensam: filten
// låter knappen hänga i ett hörn av egen kraft, medan TV:ns huvud och telefonens rad lägger ut
// den — och telefonens rad håller varje kontroll i sig till en tumme (`player.css`). En knapp
// mätt utan sitt rum svarar därför på fel fråga just där svaret är som mest värt: telefonens
// knapp är sin lilla form i en tom ruta och en tumme i den rad den står i (#348).
const ROOMS: Record<Placement, { sheets: readonly string[]; wrap: (button: string) => string }> = {
  table: { sheets: [...FIRST_FRAME, 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css'], wrap: (button) => `<div class="probe byd-table">${button}</div>` },
  tv: {
    sheets: [...FIRST_FRAME, 'src/table/table.css', 'src/table/texture.css', 'src/table/keyboard.css'],
    wrap: (button) => `<div class="probe"><div data-tv><main></main><aside><div class="byd-tv-head"><h1>Spelet</h1>${button}</div></aside></div></div>`,
  },
  phone: { sheets: [...FIRST_FRAME, 'src/player/player.css'], wrap: (button) => `<div class="probe"><div class="byd-player"><header><strong>Ada</strong><span>5 kort</span>${button}</header></div></div>` },
}

type Reading = { style: Record<string, string>; drawer: string; box: { width: number; height: number; fromTop: number; fromRight: number }; meets: string }

// Knappen läst i sitt eget rum, med exakt de ark rummet har före första målningen plus dem
// anroparen lägger till. Hela den beräknade stilen plockas och inte ett urval: det som ska hålla
// är att luckans ark inte rör knappen *alls*, och ett urval hade bara sagt att det inte rör de
// egenskaper någon kom att tänka på.
async function lookAt(placement: Placement, extra: readonly string[] = []): Promise<Reading> {
  const room = ROOMS[placement]
  const css = [...room.sheets, ...extra].map(read).join('\n')
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
  try {
    const document_ = shell
      .replace('<script type="module" src="/src/main.tsx"></script>', '')
      .replace('</head>', `<style>${css}\nbody{margin:0}\n.probe{position:relative;width:1024px;height:768px}</style></head>`)
      .replace('<div id="root"></div>', `<div id="root">${room.wrap(buttonMarkup(placement))}</div>`)
    await page.setContent(document_, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    return await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.byd-rules-open')!
      const computed = getComputedStyle(el)
      const style: Record<string, string> = {}
      for (const name of computed) style[name] = computed.getPropertyValue(name)
      const box = el.getBoundingClientRect()
      const felt = el.closest<HTMLElement>('.probe')!.getBoundingClientRect()
      return {
        style,
        // Ramen runt knappen är också första bildrutans: på TV:n och på telefonen försvinner den
        // ur layouten så att knappen läggs ut av raden den rider i.
        drawer: getComputedStyle(document.querySelector<HTMLElement>('.byd-rules-drawer')!).display,
        box: { width: Math.round(box.width), height: Math.round(box.height), fromTop: Math.round(box.top - felt.top), fromRight: Math.round(felt.right - box.right) },
        // Träffytan: vad ett finger möter mitt i knappen. En knapp utan sin plats ligger inte
        // där, och en knapp som något annat täcker svarar med det andra.
        meets: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.className ?? 'ingenting',
      }
    })
  } finally {
    await page.close()
  }
}

describe('knappen in i boken står färdigritad på första bildrutan (#346)', () => {
  it('har sin ram, sin botten och sin träffyta på filten utan att luckans ark finns i rummet', async () => {
    const seen = await lookAt('table')
    // Ingen siffra som hör till en maskin: ramens bredd, bottnens färg och platsen på filten är
    // produktens egna tal, och storleken är ett förhållande — knappen har en yta, och det är den
    // ytan ett finger möter.
    expect({
      ram: `${seen.style['border-top-width']} ${seen.style['border-top-style']}`,
      hörn: seen.style['border-top-left-radius'],
      botten: seen.style['background-color'],
      vikt: seen.style['font-weight'],
      plats: `${seen.style.position} ${seen.box.fromTop}/${seen.box.fromRight}`,
      möter: seen.meets,
    }).toEqual({ ram: '1px solid', hörn: '10px', botten: 'rgba(11, 13, 18, 0.9)', vikt: '700', plats: 'absolute 16/16', möter: 'byd-rules-open' })
    expect(seen.box.width).toBeGreaterThan(0)
    expect(seen.box.height).toBeGreaterThan(0)
    // Och ordet står läsbart på sin egen botten redan här, vilket är skillnaden mellan en ritad
    // knapp och en knapp som bara råkar ha rätt mått (L11).
    expect(contrastRatio(seen.style.color as string, seen.style['background-color'] as string)).toBeGreaterThanOrEqual(4.5)
  }, 90_000)

  // Telefonens knapp är en mindre knapp, och TV:ns och telefonens ram lägger sig ur vägen så att
  // raden knappen rider i får lägga ut den. Bägge hör till första bildrutan: en knapp som får sin
  // form först när någon trycker är precis den halvritade knapp issuet förbjuder, och på telefonen
  // hade felet dessutom varit störst, eftersom formen där är den som skiljer sig mest.
  it('ger telefonen dess egen mindre form, och tar ramen ur vägen på TV:n och telefonen, redan där', async () => {
    const [table, tv, phone] = await Promise.all(PLACEMENTS.map((placement) => lookAt(placement)))
    const shape = (seen: Reading) => ({ hörn: seen.style['border-top-left-radius'], text: seen.style['font-size'], luft: `${seen.style['padding-top']} ${seen.style['padding-left']}` })
    expect({ ram: table!.drawer, form: shape(table!) }).toEqual({ ram: 'block', form: { hörn: '10px', text: '13px', luft: '8px 14px' } })
    expect({ ram: tv!.drawer, form: shape(tv!) }).toEqual({ ram: 'contents', form: { hörn: '10px', text: '13px', luft: '8px 14px' } })
    expect({ ram: phone!.drawer, form: shape(phone!) }).toEqual({ ram: 'contents', form: { hörn: '8px', text: '12px', luft: '6px 10px' } })
  }, 90_000)

  it.each(PLACEMENTS)('ritar knappen på %s likadant med luckans ark som utan det, ner till sista egenskapen', async (placement) => {
    const [firstFrame, withDrawer] = await Promise.all([lookAt(placement), lookAt(placement, ['src/rules/rules.css'])])
    // Det som kommer när någon trycker får inte vara det som gör knappen färdig. Hela den
    // beräknade stilen jämförs, så en regel som smugit sig tillbaka in i luckans ark och rör
    // knappen säger ifrån här — vilken egenskap det än är.
    expect(withDrawer.style).toEqual(firstFrame.style)
    expect({ ram: withDrawer.drawer, box: withDrawer.box }).toEqual({ ram: firstFrame.drawer, box: firstFrame.box })
  }, 90_000)
})

// Träffytan (L12, `docs/UX-KONTROLLER.md`): 44 × 44 där en yta pekas på, och tillgängligheten är
// inte förhandlad någonstans. Knappen mäts i sitt eget rum, eftersom det är där den pekas på, och
// avgörandet är per placering: två av de tre ytorna får ett finger på sig och den tredje får
// inget (#348).
describe('vägen in i boken är en tumme bred där någon pekar (#348)', () => {
  it('ger filten och telefonen 44 × 44, och låter TV:n vara textens storlek', async () => {
    const [table, tv, phone] = await Promise.all(PLACEMENTS.map((placement) => lookAt(placement)))
    // Två läsningar av samma krav: golvet ur stilen säger att måttet står skrivet, lådan ur
    // rummet att det också blev sant där knappen faktiskt hamnade. Inget absolut tal om text —
    // bredden på ordet «Regler» är maskinens typsnitt och inte produktens, så det som pinnas är
    // golvet och «minst en tumme», aldrig en uppmätt bredd.
    const thumb = (seen: Reading) => ({ golv: `${seen.style['min-height']}/${seen.style['min-width']}`, tumme: seen.box.height >= TOUCH_PX && seen.box.width >= TOUCH_PX, möter: seen.meets })
    // Filten är en pekskärm och knappen hänger där i ett hörn av egen kraft: ingen rad lägger ut
    // den, så golvet måste vara knappens eget.
    expect(thumb(table!)).toEqual({ golv: `${TOUCH_PX}px/${TOUCH_PX}px`, tumme: true, möter: 'byd-rules-open' })
    // Telefonen är också en pekskärm, och där håller raden knappen rider i varje kontroll i sig
    // till en tumme. Den mindre formen är mindre i hörn, luft och text — inte i yta.
    expect(thumb(phone!)).toEqual({ golv: `${TOUCH_PX}px/${TOUCH_PX}px`, tumme: true, möter: 'byd-rules-open' })
    // TV:n pekas inte på. Den läses från andra sidan rummet och styrs från telefonerna i händerna,
    // så det finns inget finger att ge yta åt; knappen står i en rad vars höjd andra ting delar,
    // och ett golv där hade tagit tio pixlar ur kolumnen bredvid filten för ingens skull. Därför
    // pinnas att den *inte* är en tumme hög: att TV:n står utanför kravet är ett avgörande och
    // inte något som råkar bli sant.
    expect(tv!.box.height).toBeLessThan(TOUCH_PX)
    expect(tv!.box.height).toBeLessThan(table!.box.height)
  }, 90_000)
})

// Villkoret som gör hela flytten försvarbar. `import()` blir klar först när både modulen och dess
// ark är hämtade, så det som står i DOM:en innan dess är reserven — och reserven är tom.
//
// Provet är pinnat och inte bara sant: en platshållare i reserven — en ruta, en skugga, ett
// «laddar…» — vore precis den oklädda blink issuet säger att flytten inte får kosta, och den
// skulle synas här som ett barn till luckans ram som inte är knappen.
describe('luckan finns inte förrän den är klädd (#346)', () => {
  it('håller luckan utanför DOM:en medan modulen hämtas, och ritar ingen platshållare under tiden', async () => {
    render(
      <Language lang="sv">
        <RuleShelf rules={null} placement="table" />
      </Language>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Regler' }))
    // Varje chans att rita något: mikroköerna tömda och en tur genom tidtabellen.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    const drawer = document.querySelector('.byd-rules-drawer')!
    expect(document.querySelector('.byd-rules-panel')).toBeNull()
    // Ramen håller knappen och ingenting annat — inte en tom ruta, inte ett skelett.
    expect([...drawer.children].map((child) => child.className)).toEqual(['byd-rules-open'])
    expect(drawer.textContent).toBe('Stäng reglerna')
    // Knappen har redan svarat: den säger «Stäng», så trycket tog, och det som väntar är luckan.
    expect(screen.getByRole('button', { name: 'Stäng reglerna' })).toBeTruthy()

    gate.open()
    const panel = await screen.findByRole('dialog', { name: 'Regler' })
    expect(panel.className).toContain('byd-rules-panel')
  }, 60_000)
})
