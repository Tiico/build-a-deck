import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InferenceSession, Tensor } from 'onnxruntime-node'
import type { Classifier } from './classifier.js'
import { MODELS, modelsDir } from './models.js'
import { pdq } from './pdq.js'
import { onWhite, planar, resample, squareTiles } from './pictures.js'
import { checkPixels, type Pixels, type Screening } from './schema.js'

// The classifier the box screens with (F4, beslut 8; #1273), chosen by measuring against card art:
// two small models in onnxruntime, in the render worker, so that no picture leaves the house.
//
// - `sexual` is AdamCodd/vit-base-nsfw-detector (Apache-2.0), a ViT-B/16 trained on drawings as
//   well as photos: the probability it gives `nsfw`. Against 296 pictures of card-like art, fantasy,
//   violence, nudes in art, playing cards and ordinary pictures, no fantasy or violent picture
//   reached 0.5, and its highest were nudes in art.
// - `violence` is OpenAI's CLIP ViT-B/32 (MIT), its image encoder alone, read zero-shot against
//   prompts embedded once (`clip-prompts.json`): the share the violent prompts take of a softmax
//   over them and a dozen ordinary kinds of picture, the highest of the picture's squares. Violence
//   is allowed in print and online (beslut 7), so the score is kept and used for nothing.
// - The hash is PDQ (`pdq.ts`), with its quality.
//
// Both models are int8, ~89 MB each on disk, loaded the first time a picture is screened and kept,
// so a worker that screens nothing loads nothing and an app that imports this package never does.

export const BOX_CLASSIFIER = { id: 'vit-nsfw.clip-violence', version: '1' } as const

const NSFW_SIDE = 384
const NSFW_MEAN = [0.5, 0.5, 0.5]
const NSFW_STD = [0.5, 0.5, 0.5]
const CLIP_SIDE = 224
const CLIP_MEAN = [0.48145466, 0.4578275, 0.40821073]
const CLIP_STD = [0.26862954, 0.26130258, 0.27577711]

type Prompts = { model: string; dims: number; logitScale: number; neutral: string[]; violence: string[]; vectors: string }
const PROMPTS_FILE = new URL('./clip-prompts.json', import.meta.url)
const prompts = JSON.parse(readFileSync(PROMPTS_FILE, 'utf8')) as Prompts
const promptVectors = (() => {
  const bytes = Buffer.from(prompts.vectors, 'base64')
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
  const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => all.subarray((from + i) * prompts.dims, (from + i + 1) * prompts.dims))
  return { neutral: rows(0, prompts.neutral.length), violence: rows(prompts.neutral.length, prompts.violence.length) }
})()

// What version 1 is made of: both models and every prompt. Changing any of them changes what a
// score means, which is a new version, so that an old result is never read as a new one's (F4).
export const boxClassifierIngredients = (): string =>
  createHash('sha256')
    .update(`${MODELS.nsfw.sha256}\n${MODELS.clip.sha256}\n`)
    .update(readFileSync(PROMPTS_FILE))
    .digest('hex')

function softmax(xs: readonly number[]): number[] {
  const max = Math.max(...xs)
  const e = xs.map((x) => Math.exp(x - max))
  const sum = e.reduce((a, b) => a + b, 0)
  return e.map((x) => x / sum)
}

// The violent prompts' share of a softmax over them and the ordinary kinds of picture.
function violenceOf(embedding: Float32Array): number {
  const norm = Math.hypot(...embedding) || 1
  const logit = (v: Float32Array) => {
    let dot = 0
    for (let i = 0; i < v.length; i++) dot += (v[i] ?? 0) * (embedding[i] ?? 0)
    return (prompts.logitScale * dot) / norm
  }
  const violent = promptVectors.violence.map(logit)
  const p = softmax([...violent, ...promptVectors.neutral.map(logit)])
  return Math.min(1, p.slice(0, violent.length).reduce((a, b) => a + b, 0))
}

type Sessions = { ort: typeof import('onnxruntime-node'); nsfw: InferenceSession; clip: InferenceSession }
// One pair of sessions per directory and process: a model is ~90 MB in memory, and a worker that
// asks for the classifier twice must not hold it twice.
const loaded = new Map<string, Promise<Sessions>>()

async function load(dir: string): Promise<Sessions> {
  for (const m of Object.values(MODELS))
    if (!existsSync(join(dir, m.file))) throw new Error(`the model ${m.file} is not in ${dir}; fetch it with \`pnpm --filter @byd/screening fetch-models\``)
  const ort = await import('onnxruntime-node')
  // One thread each: the worker screens one picture at a time, last in its queue (DRIFT §6), on a
  // box it shares, and a screening that takes a second longer keeps nobody waiting. No memory arena
  // and no pre-packed weights: measured in the render image, the two sessions then hold ~255 MiB
  // and stay there, where the arena grew by ~85 MiB with the first pictures and the pre-packing
  // kept another ~35 MiB, for some 5 % faster pictures (DRIFT §1).
  const options: InferenceSession.SessionOptions = {
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
    graphOptimizationLevel: 'all',
    enableCpuMemArena: false,
    extra: { session: { disable_prepacking: '1' } },
  }
  const [nsfw, clip] = await Promise.all([ort.InferenceSession.create(join(dir, MODELS.nsfw.file), options), ort.InferenceSession.create(join(dir, MODELS.clip.file), options)])
  return { ort, nsfw, clip }
}

function sessionsIn(dir: string): Promise<Sessions> {
  let sessions = loaded.get(dir)
  if (!sessions) {
    sessions = load(dir)
    // A failed load is not kept: the next picture tries again, once the model is there.
    sessions.catch(() => loaded.delete(dir))
    loaded.set(dir, sessions)
  }
  return sessions
}

const output = (out: InferenceSession.ReturnType, name: string): Float32Array => {
  const tensor = out[name] as Tensor | undefined
  if (!tensor) throw new Error(`the model gave no ${name}`)
  return tensor.data as Float32Array
}

export function createBoxClassifier(opts: { dir?: string } = {}): Classifier {
  const dir = opts.dir ?? modelsDir()
  return {
    ...BOX_CLASSIFIER,
    async classify(pixels: Pixels): Promise<Screening> {
      const { width, height } = checkPixels(pixels)
      const { ort, nsfw, clip } = await sessionsIn(dir)
      const rgb = onWhite(pixels)

      // The NSFW model was trained on pictures squeezed to its square, so it is shown the whole.
      const squeezed = planar(resample(rgb, width, height, NSFW_SIDE, NSFW_SIDE), NSFW_SIDE * NSFW_SIDE, NSFW_MEAN, NSFW_STD)
      const logits = output(await nsfw.run({ pixel_values: new ort.Tensor('float32', squeezed, [1, 3, NSFW_SIDE, NSFW_SIDE]) }), 'logits')
      const sexual = softmax(Array.from(logits))[1] ?? 0

      let violence = 0
      for (const tile of squareTiles(rgb, width, height, CLIP_SIDE)) {
        const input = new ort.Tensor('float32', planar(tile, CLIP_SIDE * CLIP_SIDE, CLIP_MEAN, CLIP_STD), [1, 3, CLIP_SIDE, CLIP_SIDE])
        violence = Math.max(violence, violenceOf(output(await clip.run({ pixel_values: input }), 'image_embeds')))
      }

      const { hash, quality } = pdq(pixels)
      return { scores: { sexual, violence }, imageHash: { ...hash, quality } }
    },
  }
}
