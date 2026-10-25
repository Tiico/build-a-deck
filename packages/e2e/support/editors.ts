import type { APIRequestContext, Browser, Page } from '@playwright/test'
import type { ProjectDoc, RuleDoc } from '@byd/server'
import { logIn, mailTo, makeProjectOf } from './api.js'
import { DESK } from './devices.js'
import { gameDoc } from './game.js'
import { expect } from './test.js'

// Två som redigerar samma spel (D3): Ada äger det och Bo är medredigerare, inbjuden genom mejlet
// produkten skickar honom, var och en i en egen webbläsare och inloggad som sig själv. Delas av de
// resor som handlar om samredigering (#1053, #1056).

// Regelboken spelet börjar med: en rubrik och två stycken att skriva i.
export const RULES: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
    { kind: 'text', id: 't1', text: 'Första stycket.' },
    { kind: 'text', id: 't2', text: 'Andra stycket.' },
  ],
}

// Bos linje till projektets aktör, med en hand på den: det aktören säger till honom kan hållas
// kvar (en långsam linje), och linjen kan kapas som ett tappat nät kapar den, utan stängningsram,
// och hållas nere tills den släpps upp igen.
export type Line = { hold(): void; release(): void; held(): string[]; cut(): Promise<void>; restore(): void }
async function lineOf(page: Page): Promise<Line> {
  let holding = false
  let down = false
  const waiting: { frame: string; send(): void }[] = []
  const open: { close(): Promise<void> }[] = []
  await page.routeWebSocket('**/projects/**/edit**', (ws) => {
    if (down) return void ws.close({ code: 1006 })
    const server = ws.connectToServer()
    ws.onMessage((message) => server.send(message))
    server.onMessage((message) => {
      if (holding) waiting.push({ frame: String(message), send: () => ws.send(message) })
      else ws.send(message)
    })
    open.push({ close: () => ws.close({ code: 1006 }) })
  })
  return {
    hold: () => {
      holding = true
    },
    release: () => {
      holding = false
      for (const frame of waiting.splice(0)) frame.send()
    },
    held: () => waiting.map((w) => w.frame),
    cut: async () => {
      down = true
      for (const ws of open.splice(0)) await ws.close()
    },
    restore: () => {
      down = false
    },
  }
}

// Spelet, med Bo insläppt som medredigerare genom inbjudan (D3). `doc` är spelet; utan det är det
// ett provspel för två med regelboken ovan.
export async function twoEditors(
  browser: Browser,
  baseURL: string | undefined,
  page: Page,
  doc: ProjectDoc = { ...gameDoc({ name: 'Skogens herrar', players: 2 }), rules: RULES },
): Promise<{ id: string; editorUrl: string; bo: Page; line: Line; close(): Promise<void> }> {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, doc)
  const email = `e2e-${crypto.randomUUID()}@example.com`
  const invited = await page.request.post(`/projects/${encodeURIComponent(project.id)}/invites`, { data: { email, role: 'editor' } })
  expect(invited.status()).toBe(201)
  const token = /\/invites\/([A-Za-z0-9_-]+)/.exec((await mailTo(email)).text)?.[1]
  expect(token, 'the mail carries the invitation').toBeTruthy()

  const context = await browser.newContext({ viewport: DESK.viewport, locale: 'sv-SE', ...(baseURL ? { baseURL } : {}) })
  const bo = await context.newPage()
  await logIn(bo.request, email)
  const accepted = await bo.request.post(`/invites/${token}`)
  expect(accepted.ok()).toBe(true)
  const line = await lineOf(bo)
  return { ...project, bo, line, close: () => context.close() }
}

// Båda redaktörerna i spelet, och båda huvudena säger att båda är här (#1231). Huvudet står still när
// Bo kommer in sedan #1250 (L63: de andra hänger från huvudets kant), men resorna väntar ändå tills
// båda vet om varandra, så att det de gör sedan sker med båda inne.
export async function openTogether(ada: Page, bo: Page, url: string): Promise<void> {
  await ada.goto(url)
  await bo.goto(url)
  for (const page of [ada, bo]) await expect(page.locator('[data-here]')).toHaveAccessibleName(/, 2 online$/)
}

// Fler som har spelet öppet (D3), utan att var och en behöver en editor: varje person är ett eget
// konto, inbjudet som medredigerare genom mejlet, i en egen webbläsare med en linje till projektets
// aktör. Aktören räknar personer och inte flikar, så det är så många fler som huvudet visar (#1321).
export async function alsoHere(browser: Browser, baseURL: string | undefined, owner: APIRequestContext, projectId: string, n: number): Promise<{ close(): Promise<void> }> {
  const contexts = await Promise.all(
    Array.from({ length: n }, async () => {
      const email = `e2e-${crypto.randomUUID()}@example.com`
      const invited = await owner.post(`/projects/${encodeURIComponent(projectId)}/invites`, { data: { email, role: 'editor' } })
      expect(invited.status()).toBe(201)
      const token = /\/invites\/([A-Za-z0-9_-]+)/.exec((await mailTo(email)).text)?.[1]
      expect(token, 'the mail carries the invitation').toBeTruthy()
      const context = await browser.newContext(baseURL ? { baseURL } : {})
      const page = await context.newPage()
      await logIn(page.request, email)
      expect((await page.request.post(`/invites/${token}`)).ok()).toBe(true)
      await page.goto('/health')
      await page.evaluate((id) => {
        const socket = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/projects/${encodeURIComponent(id)}/edit`)
        return new Promise<void>((resolve, reject) => {
          socket.onopen = () => resolve()
          socket.onerror = () => reject(new Error('the line to the actor did not open'))
          Object.assign(window, { line: socket })
        })
      }, projectId)
      return context
    }),
  )
  return { close: async () => void (await Promise.all(contexts.map((c) => c.close()))) }
}
