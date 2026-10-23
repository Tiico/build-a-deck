// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { plansFromEnv } from '../../server/src/quotas.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// An edit over the owner's ceiling on the game's cards (#1195) is refused on the editor's line with
// `why: 'quota'` and the ceiling's numbers in a field of their own. The field is an addition, as
// `to` and `ask` were (#991, #993): this editor knows nothing of it yet — how a met ceiling is said is
// slice 6 (#1198) — and reads the refusal by `why`, as any other, and takes the edit back.
let run: Running
let client: ProjectClient | null = null
afterEach(async () => {
  client?.close()
  client = null
  await run.stop()
})

describe('an edit the owner’s ceiling refuses (#1195)', () => {
  it('is a refusal like any other to an editor from before the field, and the edit comes off', async () => {
    // Three rows in the game, and a ceiling of three on the default tier.
    run = await startServer({ auth: true, plans: plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { cardRowsPerProject: 3 } } }) }) })
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    await fetch(`${run.http}${link}`, { redirect: 'manual' })
    expect((await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...projectDoc() }) })).status).toBe(201)

    const opened = await ProjectClient.open({ http: run.http, id: run.projectId })
    client = opened
    await vi.waitFor(() => expect(opened.connected).toBe(true))
    const rows = opened.doc.rows.map((r) => r.id)
    expect(rows).toHaveLength(3)
    opened.addRow('kort-4', { title: 'Fjärde', antal: 1 })
    // The editor applies its own edit at once, as it always does …
    expect(opened.doc.rows).toHaveLength(4)
    // … and takes it off when the actor refuses it, holding nothing that waits.
    await vi.waitFor(() => expect(opened.refusedEdits).toBe(1))
    await vi.waitFor(() => expect(opened.doc.rows.map((r) => r.id)).toEqual(rows))
    expect(opened.dirty).toBe(false)
    // An edit that adds nothing goes through as before, and is saved without the refused card.
    opened.setCell('dragon', 'title', 'Drakhona')
    expect(await opened.save()).toEqual({ ok: true, rev: 2 })
    const saved = await run.projects.load(run.projectId)
    expect(saved?.rows.map((r) => r.id)).toEqual(rows)
    expect(saved?.rows[0]?.fields['title']).toBe('Drakhona')
  })
})
