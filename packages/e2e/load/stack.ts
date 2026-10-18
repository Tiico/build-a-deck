import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { CONTAINERS, readSample, type Container, type Kernel, type Reading } from './memory.js'

const run = promisify(execFile)
const ROOT = join(import.meta.dirname, '..', '..', '..')
const CGROUP = '/sys/fs/cgroup'

/**
 * The box's own compose stack, under a project name of its own (#1012).
 *
 * It is the root `docker-compose.yml` with its memory limits untouched — they are what is being
 * measured — and `compose.yml` beside this file, which only moves the ports off the ones a
 * development machine is already using. Nothing is started that is not this project's, and
 * nothing is stopped that is not this project's either.
 */
export class Compose {
  constructor(
    readonly project: string,
    readonly port: number,
    readonly tag: string,
  ) {}

  get origin(): string {
    return `http://127.0.0.1:${this.port}`
  }

  private async compose(...args: string[]): Promise<string> {
    const { stdout } = await run('docker', ['compose', '-p', this.project, '-f', join(ROOT, 'docker-compose.yml'), '-f', join(import.meta.dirname, 'compose.yml'), ...args], {
      cwd: ROOT,
      env: { ...process.env, BYD_LOAD_PORT: String(this.port), BYD_TAG: this.tag },
      maxBuffer: 256 * 2 ** 20,
    })
    return stdout
  }

  build(): Promise<string> {
    return this.compose('build', ...CONTAINERS)
  }

  /** Up from nothing: a fresh volume, so every scenario starts where the box starts after a deploy. */
  async fresh(): Promise<void> {
    await this.down()
    await this.compose('up', '-d', '--wait', ...CONTAINERS)
  }

  async down(): Promise<void> {
    await this.compose('down', '-v', '--remove-orphans')
  }

  async id(container: Container): Promise<string> {
    const id = (await this.compose('ps', '-q', container)).trim()
    if (!id) throw new Error(`${container} is not running in ${this.project}`)
    return id
  }

  /** What the app has logged — where a login link goes when no mail service is configured. */
  logs(container: Container): Promise<string> {
    return this.compose('logs', '--no-log-prefix', container)
  }

  /** The kernel's account of one container, read once the scenario is over. */
  async kernel(container: Container): Promise<Kernel> {
    const id = await this.id(container)
    const read = async (file: string) => (await run('docker', ['exec', id, 'cat', `${CGROUP}/${file}`])).stdout
    const { stdout: restarts } = await run('docker', ['inspect', '-f', '{{.RestartCount}}', id])
    return { limit: Number(await read('memory.max')), peak: Number(await read('memory.peak')), events: await read('memory.events'), restarts: Number(restarts.trim()) }
  }

  /**
   * Reads every container's memory twice a second until stopped, each reading tagged with the
   * phase the scenario was in when it arrived.
   *
   * The loop runs inside the container, in the shell every one of these images has, so a reading
   * costs a `cat` and not a `docker exec`; its own share of the cgroup is a shell and nothing more.
   * It ends itself when told to through a file, so no process outside this run is ever signalled.
   */
  async sample(phase: () => string): Promise<{ readings: Reading[]; stop: () => Promise<void> }> {
    const readings: Reading[] = []
    const children: { id: string; child: ChildProcess; done: Promise<void> }[] = []
    for (const container of CONTAINERS) {
      const id = await this.id(container)
      await run('docker', ['exec', id, 'rm', '-f', '/tmp/byd-load-stop'])
      const loop = `while [ ! -e /tmp/byd-load-stop ]; do cat ${CGROUP}/memory.current ${CGROUP}/memory.stat; echo ---; sleep 0.5; done`
      const child = spawn('docker', ['exec', id, 'sh', '-c', loop], { stdio: ['ignore', 'pipe', 'inherit'] })
      let buffer = ''
      child.stdout?.on('data', (b: Buffer) => {
        buffer += String(b)
        const blocks = buffer.split('---\n')
        buffer = blocks.pop() ?? ''
        for (const block of blocks) if (block.trim()) readings.push({ container, phase: phase(), sample: readSample(block) })
      })
      children.push({ id, child, done: new Promise((resolve) => child.once('exit', () => resolve())) })
    }
    return {
      readings,
      stop: async () => {
        for (const { id } of children) await run('docker', ['exec', id, 'touch', '/tmp/byd-load-stop']).catch(() => undefined)
        await Promise.all(children.map((c) => c.done))
      },
    }
  }
}
