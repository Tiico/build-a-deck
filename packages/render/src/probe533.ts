// BENCH ONLY (#533): what Chromium's screenshot refusal looks like from the outside, and whether
// it passes. Never merged.
import type { Page } from 'playwright'

type Clip = { x: number; y: number; width: number; height: number }

export async function probedShot(page: Page, where: string, opts: Parameters<Page['screenshot']>[0] & { clip?: Clip }): Promise<Buffer> {
  const t0 = Date.now()
  try {
    return await page.screenshot(opts)
  } catch (err) {
    const failedAfter = Date.now() - t0
    const state = await page
      .evaluate(() => ({ vis: document.visibilityState, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, focus: document.hasFocus(), sx: scrollX, sy: scrollY }))
      .catch((e: unknown) => ({ evalError: String(e) }))
    const raf = await page
      .evaluate(() => new Promise<number>((r) => { const s = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now() - s))) }))
      .catch(() => -1)
    const attempts: { i: number; ms: number; ok: boolean; err?: string }[] = []
    let shot: Buffer | null = null
    for (let i = 0; i < 40 && !shot; i++) {
      const t = Date.now()
      try {
        shot = await page.screenshot(opts)
        attempts.push({ i, ms: Date.now() - t, ok: true })
      } catch (e) {
        attempts.push({ i, ms: Date.now() - t, ok: false, err: String(e).split('\n')[0] })
        await new Promise((r) => setTimeout(r, 25 * (i + 1)))
      }
    }
    console.error(`[probe533] ${where} ${JSON.stringify({ failedAfter, clip: opts.clip, state, rafMs: raf, attempts, at: new Date(t0).toISOString(), pid: process.pid })}`)
    if (!shot) throw err
    return shot
  }
}
