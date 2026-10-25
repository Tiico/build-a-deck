import { screenRequest, type EnqueueResult, type RenderStore, type ScreeningFailure } from '@byd/render/queue'
import { classifierKey, highestScore, SCREEN_CATEGORIES, type ClassifierRef, type PerceptualHash, type ScreenCategory, type Scores } from '@byd/screening'
import { assetHashesOf } from './asset-refs.js'
import type { AssetStore } from './assets.js'
import type { ProjectStore } from './projects.js'

// Screening for the operator (F4, #1271, DRIFT §12): in the background, in shadow mode, and never
// shown to a designer (F4, beslut 10–11). The render worker on the box does the screening itself
// (beslut 8); what is here is which pictures to queue, and what has come of them.

// What is screened is an uploaded picture (#1268): an asset whose type is an image, svg included.
// A typeface is not, and neither is the card it is drawn on: every pixel of a card comes out of an
// asset, the curated library or text. A symbol taken from the curated library (E4) is an uploaded
// svg like any other here, and is screened once, for every game that uses it, since the cache is
// per hash.
const isPicture = (contentType: string) => contentType.startsWith('image/')

export type ScreeningStores = { projects: Pick<ProjectStore, 'load'>; assets: Pick<AssetStore, 'contentTypes'>; renders: Pick<RenderStore, 'enqueue'> }
export type QueuedScreening = { ok: true; game: string; rev: number; classifier: string; pictures: number; queued: number; queuedAlready: number; cached: number } | { ok: false; reason: 'no-such-game' }

// Queues a screening of every picture the game's saved version names, with the classifier and
// version asked for: `screening run <spel>`. A picture already screened in that version, or
// already queued, is not queued again. Nobody bears the jobs, so they are no rendering of anyone's
// (#1197): a designer does not notice them.
export async function queueScreening(stores: ScreeningStores, game: string, classifier: ClassifierRef, now: number = Date.now()): Promise<QueuedScreening> {
  const project = await stores.projects.load(game)
  if (!project) return { ok: false, reason: 'no-such-game' }
  const types = await stores.assets.contentTypes(assetHashesOf(project))
  const pictures = Object.keys(types)
    .filter((hash) => isPicture(types[hash] ?? ''))
    .sort()
  const answers: Record<EnqueueResult, number> = { queued: 0, 'queued-already': 0, cached: 0 }
  for (const hash of pictures) answers[await stores.renders.enqueue(screenRequest(hash, classifier, now))]++
  return { ok: true, game, rev: project.rev, classifier: classifierKey(classifier), pictures: pictures.length, queued: answers.queued, queuedAlready: answers['queued-already'], cached: answers.cached }
}

export type ReachedScreening = { asset: string; category: ScreenCategory; score: number; scores: Scores; imageHash: PerceptualHash; screenedAt: number }
export type ScreeningReport = {
  summary: { classifier: string; threshold: number; classified: number; failed: number; reached: number; byCategory: Record<ScreenCategory, number> }
  // Every picture with a score at or over the threshold, its highest score first.
  reached: ReachedScreening[]
  failed: ScreeningFailure[]
}

// What has come of the screening in a classifier version, against a threshold given on the
// command line: `screening report <tröskel>`. A threshold is the operator's to try (F4: the
// thresholds are calibrated against real card art before anything is stopped), so it is asked for
// every time rather than kept anywhere.
export async function screeningReport(renders: Pick<RenderStore, 'screenings' | 'screeningFailures'>, classifier: ClassifierRef, threshold: number): Promise<ScreeningReport> {
  if (!(threshold >= 0 && threshold <= 1)) throw new Error(`a threshold is a score between 0 and 1, not ${threshold}`)
  const results = await renders.screenings(classifier)
  const failed = await renders.screeningFailures(classifier)
  const byCategory = Object.fromEntries(SCREEN_CATEGORIES.map((c) => [c, results.filter((r) => r.scores[c] >= threshold).length])) as Record<ScreenCategory, number>
  const reached = results
    .map((r) => ({ ...highestScore(r.scores), asset: r.asset, scores: r.scores, imageHash: r.imageHash, screenedAt: r.screenedAt }))
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score || a.asset.localeCompare(b.asset))
    .map(({ asset, category, score, scores, imageHash, screenedAt }) => ({ asset, category, score, scores, imageHash, screenedAt }))
  return { summary: { classifier: classifierKey(classifier), threshold, classified: results.length, failed: failed.length, reached: reached.length, byCategory }, reached, failed }
}
