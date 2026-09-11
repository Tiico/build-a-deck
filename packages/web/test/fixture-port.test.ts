import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { describe, expect, it } from 'vitest'
import { startServer } from './fixture.js'

// The lowest port this machine hands out to a `listen(0)`. Everything at or above it can be
// given to any process on the box that asks for "any port"; everything below it can only be had
// by asking for it by number.
function ephemeralFloor(): number {
  if (process.platform === 'linux') return Number(readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim().split(/\s+/)[0])
  if (process.platform === 'darwin') return Number(execFileSync('sysctl', ['-n', 'net.inet.ip.portrange.first']).toString().trim())
  return 49_152 // The IANA range, which is what Windows uses.
}

const hold = async (port: number): Promise<Server> => {
  const s = createServer()
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject)
    s.listen(port, '127.0.0.1', resolve)
  })
  return s
}

// A restart keeps the port it had, which is the whole point of it: from the client's side it
// looks like a deploy on the box, and the client reconnects to the address it already has. That
// only works if nothing else can take the port while the fixture is between servers (#58).
describe('the port a test server listens on', () => {
  it('is one no other worker can be handed by asking for any port', async () => {
    const run = await startServer()
    expect(Number(new URL(run.http).port)).toBeLessThan(ephemeralFloor())
    await run.stop()
  })

  it('is the same one after a restart, so a client finds the address it already had', async () => {
    const run = await startServer()
    const address = run.http
    expect((await fetch(`${address}/health`)).status).toBe(200)
    await run.restart()
    // Nothing was told a new address, and the server is answering at the old one.
    expect(run.http).toBe(address)
    expect((await fetch(`${address}/health`)).status).toBe(200)
    await run.stop()
  })

  it('is named in a plain error when something else holds it, rather than felling a test', async () => {
    const run = await startServer()
    const port = Number(new URL(run.http).port)
    await run.stop()
    const squatter = await hold(port)
    await expect(run.restart()).rejects.toThrow(new RegExp(`127\\.0\\.0\\.1:${port}`))
    await new Promise<void>((resolve) => squatter.close(() => resolve()))
  })
})
