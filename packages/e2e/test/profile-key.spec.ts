import { logIn } from '../support/api.js'
import { DESK, PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The AI key on the profile page, the whole way (#999): from Mina spel's line to the profile, a key
// the provider refuses, one it accepts, described by its provider and last four, a model chosen, and
// the key removed after a question. The provider is the stack's fake (`support/stack.ts`), never
// Anthropic or OpenAI, and the key never comes back over the wire.
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefx7Qd'

test('a designer saves her key, sees it described, chooses a model and removes it', async ({ open }) => {
  const desk = await open(DESK, '/')
  await logIn(desk.page.request)
  const { page } = desk
  await page.goto('/')

  // The way in is a word in the account's line.
  await page.locator('.byd-who').getByRole('link', { name: 'Profile' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
  const box = page.getByRole('region', { name: 'AI key' })

  // The provider's own page for making a key, in a new tab, following the choice.
  const make = box.getByRole('link', { name: /Create one at/ })
  await expect(make).toHaveAttribute('href', 'https://platform.claude.com/settings/keys')
  await expect(make).toHaveAttribute('target', '_blank')
  await box.getByText('OpenAI', { exact: true }).click()
  await expect(make).toHaveAttribute('href', 'https://platform.openai.com/api-keys')
  await box.getByText('Anthropic', { exact: true }).click()

  // A key the provider refuses: said in words, nothing kept.
  await box.getByLabel('API key').fill('sk-ant-bad-0000000000')
  await box.getByRole('button', { name: 'Save and test' }).click()
  await expect(box.getByRole('alert')).toContainText('Anthropic did not accept the key')
  expect(((await (await page.request.get('/me/ai-key')).json()) as { key: unknown }).key).toBeNull()

  // A good one: proved, then described by its provider and last four, and never sent back.
  const answers: string[] = []
  page.on('response', (res) => {
    if (res.url().includes('/me/ai-key')) void res.text().then((text) => answers.push(text), () => undefined)
  })
  await box.getByLabel('API key').fill(KEY)
  await box.getByRole('button', { name: 'Save and test' }).click()
  await expect(box.getByText(/the key ending in/)).toHaveText(/^Anthropic · the key ending in …x7Qd · tested today \d{1,2}:\d\d( [AP]M)?$/)
  await expect(box.getByLabel('API key')).toHaveCount(0)
  // The focus has somewhere to be once the field it was in is gone.
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')

  const model = box.getByLabel('Model')
  await expect(model.locator('option')).toHaveText(['Claude Sonnet 5.5 (standard)', 'Claude Opus 5.5', 'Claude Haiku 4.5'])
  await model.selectOption('claude-opus-5-5')
  await expect.poll(async () => ((await (await page.request.get('/me/ai-key')).json()) as { key: { model: string } }).key.model).toBe('claude-opus-5-5')

  // Described again after a reload, from the server, with the model it was given.
  await page.reload()
  await expect(box.getByText(/the key ending in/)).toContainText('…x7Qd')
  await expect(model).toHaveValue('claude-opus-5-5')
  for (const text of answers) expect(text).not.toContain(KEY.slice(0, 24))

  // Removed after a question that opens on the answer that keeps it.
  await box.getByRole('button', { name: 'Remove' }).click()
  const question = page.getByRole('alertdialog', { name: /Remove the key\?/ })
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await question.getByRole('button', { name: 'Yes, remove' }).click()
  await expect(box.getByLabel('API key')).toBeVisible()
  expect(((await (await page.request.get('/me/ai-key')).json()) as { key: unknown }).key).toBeNull()
})

// The nit the prototype left (#999): the model picker stretched the card's whole width for a short
// name. It is as wide as what it says, and the page never scrolls sideways on a phone.
for (const device of [DESK, PHONE]) {
  test(`the profile keeps its picker to its words and the page inside the window at ${device.viewport.width} px`, async ({ open }) => {
    const desk = await open(device, '/')
    await logIn(desk.page.request)
    const { page } = desk
    await page.goto('/profile')
    const box = page.getByRole('region', { name: 'AI key' })
    await box.getByLabel('API key').fill(KEY)
    await box.getByRole('button', { name: 'Save and test' }).click()
    const model = box.getByLabel('Model')
    await expect(model.locator('option')).toHaveCount(3)
    const card = (await box.boundingBox())!
    const picker = (await model.boundingBox())!
    expect(picker.width).toBeLessThan(card.width * 0.75)
    expect(picker.height).toBeGreaterThanOrEqual(44)
    for (const name of ['Change key', 'Remove']) expect((await box.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    // The last four stay on one line with their «…».
    const code = (await box.locator('code').boundingBox())!
    expect(code.height).toBeLessThan(30)
  })
}
