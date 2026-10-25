import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fetchModel, MODELS, modelsDir, type ModelFile } from '../src/index.js'

// The models are not in git (#1273): they are fetched where they run — at the build of the render
// image, and once per machine for the tests — from a pinned revision, and nothing is kept that
// does not have the checksum written here.

const bytes = new TextEncoder().encode('a model, as far as this test cares')
const sha256 = createHash('sha256').update(bytes).digest('hex')
let server: Server
let base = ''
let served = 0
beforeAll(async () => {
  server = createServer((req, res) => {
    served++
    if (req.url === '/model.onnx') res.end(bytes)
    else res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  base = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : ''
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const model = (over: Partial<ModelFile> = {}): ModelFile => ({ file: 'test.onnx', url: `${base}/model.onnx`, sha256, bytes: bytes.byteLength, licence: 'test', source: 'test', ...over })

describe('modellerna', () => {
  it('är var och en fäst vid en revision, med kontrollsumma, storlek och licens', () => {
    for (const m of Object.values(MODELS)) {
      expect(m.url, m.file).toMatch(/^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/[0-9a-f]{40}\//)
      expect(m.sha256, m.file).toMatch(/^[0-9a-f]{64}$/)
      expect(m.bytes, m.file).toBeGreaterThan(0)
      expect(m.licence, m.file).toMatch(/^(MIT|Apache-2\.0)$/)
    }
  })

  it('ligger i BYD_MODELS_DIR, och annars i användarens cache', () => {
    expect(modelsDir({ BYD_MODELS_DIR: '/app/models' })).toBe('/app/models')
    expect(modelsDir({ HOME: '/home/u' })).toBe('/home/u/.cache/byd/models')
    expect(modelsDir({ HOME: '/home/u', XDG_CACHE_HOME: '/c' })).toBe('/c/byd/models')
  })
})

describe('fetchModel', () => {
  it('hämtar filen och behåller den när kontrollsumman stämmer, och hämtar den inte igen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byd-models-'))
    try {
      served = 0
      expect(await fetchModel(model(), dir)).toBe(join(dir, 'test.onnx'))
      expect(await readFile(join(dir, 'test.onnx'))).toEqual(Buffer.from(bytes))
      await fetchModel(model(), dir)
      expect(served).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('kastar och lämnar ingenting efter sig när kontrollsumman inte stämmer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byd-models-'))
    try {
      await expect(fetchModel(model({ sha256: 'f'.repeat(64) }), dir)).rejects.toThrow(/sha256/)
      expect(await readdir(dir)).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('hämtar om en fil som ligger där men inte är den', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byd-models-'))
    try {
      await writeFile(join(dir, 'test.onnx'), 'something else')
      served = 0
      await fetchModel(model(), dir)
      expect(served).toBe(1)
      expect(await readFile(join(dir, 'test.onnx'))).toEqual(Buffer.from(bytes))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('kastar för ett svar som inte är 200', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byd-models-'))
    try {
      await expect(fetchModel(model({ url: `${base}/nothing` }), dir)).rejects.toThrow(/404/)
      expect(await readdir(dir)).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
