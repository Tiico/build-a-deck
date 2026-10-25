import { ClassifierRef, MAX_SCREEN_PX, Sha256 } from '@byd/screening'
import { ASSET_PREFIX } from './assets.js'
import { contentHash, type CompiledLike, type RenderKind } from './hash.js'
import type { RenderRequest } from './store.js'

// Screening as a job of the render queue (F4, #1271, DRIFT §6). The worker already reads an
// asset's bytes itself (DRIFT §4, #1028) and already has Chromium, so a screening is a page that
// names one picture by its hash, as a card names its pictures: the worker reads the bytes, draws
// the picture at most MAX_SCREEN_PX across, svg too, and hands the pixels to the classifier.

// The page a screening draws: the picture, by the hash of its bytes, and nothing else.
export const screenPage = (asset: string): CompiledLike => ({ html: `<img data-screen src="${ASSET_PREFIX}${Sha256.parse(asset)}">`, css: '' })

// The job that screens `asset` with a classifier, keyed by the picture, the classifier and its
// version: one job, and one result, for each.
export function screenRequest(asset: string, classifier: ClassifierRef, requestedAt: number): RenderRequest {
  const { id, version } = ClassifierRef.parse(classifier)
  const kind: RenderKind = { kind: 'screen', asset: Sha256.parse(asset), classifier: { id, version }, maxPx: MAX_SCREEN_PX }
  const compiled = screenPage(asset)
  return { hash: contentHash(compiled, kind), kind, priority: 'screen', compiled, requestedAt }
}
