// @vitest-environment jsdom
// What is drawn inside each of a deck's pictures (E1). A file is measured once for everyone,
// because the measurement is of the bytes: so the server is asked first, whatever it does not
// know is measured here where the browser has the pixels, and the answer is told back. That last
// half is what lets a deck made before there was anything to measure catch up by being opened.
// The measuring itself needs real pixels and is tested where there are some; what is asked here
// is who asks whom, and how often.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const MOTIF = { w: 40, h: 40, trim: { left: 8, top: 8, right: 8, bottom: 8 } }

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A measurer standing in for the browser's canvas, which jsdom does not have. What it is handed
// is asserted on, so the URL a picture is fetched from is part of what is tested here.
const measures = (answer: typeof MOTIF | null) => {
  const asked: string[] = []
  return {
    asked,
    measure: async (url: string) => {
      asked.push(url)
      return answer
    },
  }
}

describe('the motifs of a deck (E1)', () => {
  it('measures a picture nobody has measured, tells the server, and asks rather than measures the next time', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: run.projectId })
    const hash = await client.uploadAsset(new Blob([PNG], { type: 'image/png' }), 'image')
    const first = measures(MOTIF)

    expect(await client.motifs([hash], first.measure)).toEqual({ [hash]: MOTIF })
    expect(first.asked).toEqual([`${run.http}/assets/${hash}`])
    // Told back, so the render worker and the print draw the card the same way the editor does.
    expect(await (await fetch(`${run.http}/assets/motifs?of=${hash}`)).json()).toEqual({ [hash]: MOTIF })

    const again = await ProjectClient.open({ http: run.http, id: run.projectId })
    const second = measures(MOTIF)
    expect(await again.motifs([hash], second.measure)).toEqual({ [hash]: MOTIF })
    expect(second.asked).toEqual([])
  })

  it('leaves out a picture it cannot measure, so such a card is drawn by its file rather than not at all', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: run.projectId })
    const hash = await client.uploadAsset(new Blob([PNG], { type: 'image/png' }), 'image')

    expect(await client.motifs([hash], measures(null).measure)).toEqual({})
    expect(await (await fetch(`${run.http}/assets/motifs?of=${hash}`)).json()).toEqual({})
  })

  it('asks nothing at all when the deck holds no pictures', async () => {
    await run.projects.create(run.projectId, projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: run.projectId })
    const none = measures(MOTIF)

    expect(await client.motifs([], none.measure)).toEqual({})
    expect(none.asked).toEqual([])
  })
})
