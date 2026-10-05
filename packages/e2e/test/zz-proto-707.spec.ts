// PROTOTYP #707 — kastas. Regelfliken: hur ＋ erbjuder en lista; bara på prototypgrenen.
import { logIn, makeProjectOf } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

test.use({ locale: 'sv-SE', viewport: { width: 1280, height: 800 } })
const OUT = new URL('../../../docs/ux-audits/2026-10-05-regellistor/prototyper/707/', import.meta.url).pathname

test('regellistor', async ({ page }) => {
  test.setTimeout(240_000)
  await logIn(page.request)
  const doc = gameDoc({ name: "Sal's Saloon", players: 4 }) as ReturnType<typeof gameDoc> & { rules?: unknown }
  doc.rules = { title: "Sal's Saloon", blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Den som senast var på en saloon börjar. Turen går medsols.' },
    { kind: 'heading', id: 'h2', level: 2, text: 'En tur' },
    { kind: 'text', id: 't2', text: 'Varje tur har tre steg.' },
  ] }
  await page.waitForTimeout(800)
  const CSS = `
    .proto-hint { margin: 8px 0 0; font: 12px/1.5 system-ui, sans-serif; color: #b8bfcc; }
    .proto-hint kbd { font: 700 12px ui-monospace, monospace; color: #e8eaf0; background: #2a2f3c; border-radius: 4px; padding: 0 4px; }
    .proto-plus2 { position: absolute; right: 6px; top: 8px; display: grid; gap: 6px; }
    .proto-plus2 button { min-height: 44px; min-width: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid #cbbf9f; background: #efe7d6; color: #2b2a26; font: 600 13px system-ui, sans-serif; white-space: nowrap; }
    .proto-kinds { display: flex; gap: 4px; margin: 0 0 10px; }
    .proto-kinds .byd-choice { min-height: 36px; font: 600 13px system-ui, sans-serif; }
    .proto-items { display: grid; gap: 6px; }
    .proto-items input { min-height: 40px; border-radius: 8px; border: 1px solid #3a4050; background: #15171d; color: #e8eaf0; padding: 0 10px; font: 14px system-ui, sans-serif; }
    .proto-items .byd-secondary { justify-self: start; min-height: 40px; padding: 0 12px; border-radius: 8px; }
    .proto-list { margin: 0 0 0 1.2em; padding: 0; font: inherit; }
  `
  const open = async () => {
    await page.locator('.byd-rules-block').nth(3).hover()
    await page.locator('.byd-rules-add').click()
    await page.waitForTimeout(400)
  }
  const shot = async (name: string) => {
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}bilder/${name}.png`, clip: { x: 160, y: 120, width: 960, height: 600 } })
  }
  const fresh = async () => {
    const project = await makeProjectOf(page.request, doc)
    await page.goto(project.editorUrl)
    await expect(page.getByText("Sal's Saloon").first()).toBeVisible()
    await page.getByRole('tab', { name: 'Regler' }).click()
    await page.waitForTimeout(800)
    await page.addStyleTag({ content: CSS })
  }
  const lines = '- Dra ett kort.\n- Spela ett kort.\n- Kasta ned till sju.'

  // I dag: ＋ ger text, och strecken blir ett stycke.
  await fresh(); await open()
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type(lines)
  await shot('idag-1')
  await page.keyboard.press('Escape'); await shot('idag-2')

  // A: inga nya knappar — «- » och «1. » i början av raderna blir en lista, och fältet säger det.
  await fresh(); await open()
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type(lines)
  await page.evaluate(`(() => { const f = document.querySelector('.byd-rules-edit .byd-rules-field'); const p = document.createElement('p'); p.className = 'proto-hint'; p.innerHTML = 'Rader som börjar med <kbd>-</kbd> blir en punktlista, med <kbd>1.</kbd> en numrerad.'; f.after(p) })()`)
  await shot('A-1')
  await page.keyboard.press('Escape')
  await page.evaluate(`(() => { const b = document.querySelectorAll('.byd-rules-block')[4]; const t = b.firstElementChild; t.innerHTML = '<ul class="proto-list"><li>Dra ett kort.</li><li>Spela ett kort.</li><li>Kasta ned till sju.</li></ul>' })()`)
  await shot('A-2')

  // B: två ＋ i marginalen, text eller lista.
  await fresh()
  await page.locator('.byd-rules-block').nth(3).hover()
  await page.waitForTimeout(300)
  await page.evaluate(`(() => { const add = document.querySelector('.byd-rules-add'); const pair = document.createElement('div'); pair.className = 'proto-plus2'; pair.innerHTML = '<button>＋ Text</button><button>＋ Lista</button>'; add.style.visibility = 'hidden'; add.parentElement.append(pair) })()`)
  await shot('B-1')
  await page.evaluate(`(() => { document.querySelector('.proto-plus2').remove(); document.querySelector('.byd-rules-add').style.visibility = '' })()`)
  await open()
  await page.evaluate(`(() => { const f = document.querySelector('.byd-rules-edit .byd-rules-field'); f.style.cssText = 'position:absolute;opacity:0;pointer-events:none;height:0;overflow:hidden'; f.insertAdjacentHTML('afterend', '<div class="proto-items"><input value="Dra ett kort."><input value="Spela ett kort."><input value="Kasta ned till sju."><button class="byd-secondary">＋ Punkt</button></div>') })()`)
  await shot('B-2')

  // C: ＋ ger text som i dag, och det öppna blocket väljer sitt slag: stycke, punktlista, numrerad.
  await fresh(); await open()
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Varje tur har tre steg.')
  await page.evaluate(`(() => { const e = document.querySelector('.byd-rules-edit'); const g = document.createElement('div'); g.className = 'proto-kinds'; g.setAttribute('role', 'group'); g.innerHTML = '<button class="byd-choice" aria-pressed="true">Stycke</button><button class="byd-choice" aria-pressed="false">Punktlista</button><button class="byd-choice" aria-pressed="false">Numrerad lista</button>'; e.prepend(g) })()`)
  await shot('C-1')
  await page.evaluate(`(() => { const g = document.querySelector('.proto-kinds'); g.children[0].setAttribute('aria-pressed', 'false'); g.children[2].setAttribute('aria-pressed', 'true'); const f = document.querySelector('.byd-rules-edit .byd-rules-field'); f.style.cssText = 'position:absolute;opacity:0;pointer-events:none;height:0;overflow:hidden'; f.insertAdjacentHTML('afterend', '<div class="proto-items"><input value="Dra ett kort."><input value="Spela ett kort."><input value="Kasta ned till sju."><button class="byd-secondary">＋ Punkt</button></div>') })()`)
  await shot('C-2')
})
