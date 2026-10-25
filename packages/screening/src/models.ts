import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// The models the box's classifier runs (F4, beslut 8; #1273), and where they are kept. They are
// not in git: each is fetched from a pinned revision and kept only with the checksum written here,
// at the build of the render image (Dockerfile.render) and once per machine for the tests.
//
// This file imports nothing but Node, so the render image can copy it and the fetch script alone,
// before the rest of the sources, and the layer that holds the models is rebuilt only when this
// list changes.

export type ModelFile = {
  // The name it is kept under in the models directory.
  file: string
  url: string
  sha256: string
  bytes: number
  licence: string
  // Who made it, from what, in a line.
  source: string
}

export const MODELS = {
  // Sexual content: a ViT-B/16 at 384 px fine-tuned on ~25 000 drawings and photos, sfw against
  // nsfw, quantized to int8 for onnxruntime by its author.
  nsfw: {
    file: 'vit-base-nsfw-detector.int8.onnx',
    url: 'https://huggingface.co/AdamCodd/vit-base-nsfw-detector/resolve/8587de998f441aac03fdd57a85d2e4cb808c7d64/onnx/model_quantized.onnx',
    sha256: '432763a6899ebc418c55f784b98f90565e5fc694c778d2ffcb0294b12f6a7404',
    bytes: 88_500_985,
    licence: 'Apache-2.0',
    source: 'AdamCodd/vit-base-nsfw-detector, fine-tuned from google/vit-base-patch16-384',
  },
  // Violence: OpenAI's CLIP ViT-B/32, the image encoder alone, as Xenova's int8 ONNX export. The
  // text side is not run: the prompts are embedded once, and the vectors are in `clip-prompts.json`.
  clip: {
    file: 'clip-vit-base-patch32.vision.int8.onnx',
    url: 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/d15189d7028b43f1d3e65039190477f6af591c2a/onnx/vision_model_quantized.onnx',
    sha256: '583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299',
    bytes: 89_117_001,
    licence: 'MIT',
    source: 'openai/clip-vit-base-patch32, exported to ONNX by Xenova/clip-vit-base-patch32',
  },
} as const satisfies Record<string, ModelFile>

// `BYD_MODELS_DIR` where it is set (the render image sets it), and otherwise the user's cache, so
// that every worktree on a machine shares one copy.
export function modelsDir(env: Record<string, string | undefined> = process.env): string {
  if (env['BYD_MODELS_DIR']) return env['BYD_MODELS_DIR']
  const cache = env['XDG_CACHE_HOME'] || join(env['HOME'] ?? '.', '.cache')
  return join(cache, 'byd', 'models')
}

async function sha256Of(path: string): Promise<string | null> {
  try {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
    return hash.digest('hex')
  } catch {
    return null
  }
}

// The model in `dir`, fetched when it is not there or is not the file the checksum names. Written
// beside itself first and moved into place only once it is right, so a fetch cut short leaves
// nothing a classifier could load. Returns the path.
export async function fetchModel(model: ModelFile, dir: string = modelsDir()): Promise<string> {
  const path = join(dir, model.file)
  if ((await stat(path).catch(() => null))?.size === model.bytes && (await sha256Of(path)) === model.sha256) return path
  await mkdir(dir, { recursive: true })
  const part = `${path}.${process.pid}.part`
  try {
    const res = await fetch(model.url)
    if (!res.ok) throw new Error(`${model.url} answered ${res.status}`)
    await writeFile(part, Buffer.from(await res.arrayBuffer()))
    const got = await sha256Of(part)
    if (got !== model.sha256) throw new Error(`${model.file}: the sha256 is ${got}, not ${model.sha256}`)
    await rename(part, path)
    return path
  } finally {
    await rm(part, { force: true })
  }
}
