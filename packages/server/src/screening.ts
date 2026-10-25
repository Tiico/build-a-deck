import { screenRequest, type EnqueueResult, type RenderStore, type ScreeningFailure } from '@byd/render/queue'
import { classifierKey, highestScore, matchReference, PDQ_ALGORITHM, SCREEN_CATEGORIES, ScreeningReference, type ClassifierRef, type PerceptualHash, type ScreenCategory, type Scores } from '@byd/screening'
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
export const isPicture = (contentType: string): boolean => contentType.startsWith('image/')

// Shadow mode at upload (F4, beslut 10; #1273): which classifier a new picture is queued for.
export type ScreeningOnUpload = { classifier: ClassifierRef }

// Queues a screening of a picture just uploaded, and returns before the queue has answered: the
// upload is never slower for it, and a queue that refuses or is down stops nothing and says so in
// the log, where the operator reads it. A typeface is not queued. The queue keys the job by the
// picture and the classifier's version, so the same bytes uploaded again are not queued twice,
// and a picture already screened in this version is not queued at all.
export function screenOnUpload(renders: Pick<RenderStore, 'enqueue'>, screening: ScreeningOnUpload, asset: string, contentType: string, now: number): void {
  if (!isPicture(contentType)) return
  const said = (err: unknown) => console.error(JSON.stringify({ msg: 'screening', asset, classifier: classifierKey(screening.classifier), error: err instanceof Error ? err.message : String(err) }))
  try {
    renders.enqueue(screenRequest(asset, screening.classifier, now)).catch(said)
  } catch (err) {
    said(err)
  }
}

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

export type QueuedAll = { classifier: string; pictures: number; queued: number; queuedAlready: number; cached: number }

// Queues a screening of every picture on the box, once: `screening run --alla`, for the pictures
// uploaded before screening was at the upload (#1268, fråga 10). Run again, it queues only what
// has neither a result in the version nor a job already.
export async function queueAllScreenings(stores: { assets: Pick<AssetStore, 'pictures'>; renders: Pick<RenderStore, 'enqueue'> }, classifier: ClassifierRef, now: number = Date.now()): Promise<QueuedAll> {
  const pictures = await stores.assets.pictures()
  const answers: Record<EnqueueResult, number> = { queued: 0, 'queued-already': 0, cached: 0 }
  for (const hash of pictures) answers[await stores.renders.enqueue(screenRequest(hash, classifier, now))]++
  return { classifier: classifierKey(classifier), pictures: pictures.length, queued: answers.queued, queuedAlready: answers['queued-already'], cached: answers.cached }
}

export type ReachedScreening = { asset: string; category: ScreenCategory; score: number; scores: Scores; imageHash: PerceptualHash; screenedAt: number }
// A screened picture whose hash is near one on the reference list (F4, beslut 9).
export type ReferencedScreening = { asset: string; source: string; distance: number; imageHash: PerceptualHash; screenedAt: number }
export type ScreeningReport = {
  summary: {
    classifier: string
    threshold: number
    classified: number
    failed: number
    reached: number
    byCategory: Record<ScreenCategory, number>
    // The share of the classified pictures that reach the threshold, per category.
    shareByCategory: Record<ScreenCategory, number>
    // How long the reference list is, and how many pictures are near something on it.
    references: number
    referenced: number
  }
  // Every picture with a score at or over the threshold, its highest score first.
  reached: ReachedScreening[]
  // Every picture near a reference, nearest first.
  referenced: ReferencedScreening[]
  failed: ScreeningFailure[]
}

// What has come of the screening in a classifier version, against a threshold given on the
// command line: `screening report <tröskel>`. A threshold is the operator's to try (F4: the
// thresholds are calibrated against real card art before anything is stopped), so it is asked for
// every time rather than kept anywhere.
//
// The reference list is read as it stands now, not as it stood when a picture was screened, so a
// reference added today finds a picture uploaded last month without screening it again.
export async function screeningReport(renders: Pick<RenderStore, 'screenings' | 'screeningFailures' | 'screeningReferences'>, classifier: ClassifierRef, threshold: number): Promise<ScreeningReport> {
  if (!(threshold >= 0 && threshold <= 1)) throw new Error(`a threshold is a score between 0 and 1, not ${threshold}`)
  const results = await renders.screenings(classifier)
  const failed = await renders.screeningFailures(classifier)
  const references = await renders.screeningReferences()
  const byCategory = Object.fromEntries(SCREEN_CATEGORIES.map((c) => [c, results.filter((r) => r.scores[c] >= threshold).length])) as Record<ScreenCategory, number>
  const shareByCategory = Object.fromEntries(SCREEN_CATEGORIES.map((c) => [c, results.length ? Math.round((byCategory[c] / results.length) * 10_000) / 10_000 : 0])) as Record<ScreenCategory, number>
  const referenced = results
    .flatMap((r) => {
      const match = matchReference(r.imageHash, references)
      return match ? [{ asset: r.asset, source: match.reference.source, distance: match.distance, imageHash: r.imageHash, screenedAt: r.screenedAt }] : []
    })
    .sort((a, b) => a.distance - b.distance || a.asset.localeCompare(b.asset))
  const reached = results
    .map((r) => ({ ...highestScore(r.scores), asset: r.asset, scores: r.scores, imageHash: r.imageHash, screenedAt: r.screenedAt }))
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score || a.asset.localeCompare(b.asset))
    .map(({ asset, category, score, scores, imageHash, screenedAt }) => ({ asset, category, score, scores, imageHash, screenedAt }))
  return {
    summary: { classifier: classifierKey(classifier), threshold, classified: results.length, failed: failed.length, reached: reached.length, byCategory, shareByCategory, references: references.length, referenced: referenced.length },
    reached,
    referenced,
    failed,
  }
}

export type AddedReference = { ok: true; added: boolean; reference: ScreeningReference } | { ok: false; reason: 'not-screened' | 'not-pdq' }

// A picture on the box onto the reference list, by its asset hash (#1273): what is taken down is
// listed by the PDQ hash its screening gave, so a copy of it uploaded again, at another size or
// saved again, is found. A picture not yet screened in the classifier version cannot be listed
// until it is. `screening reference add <asset> <källa>`.
export async function addReferenceFromAsset(renders: Pick<RenderStore, 'screeningOf' | 'addScreeningReference'>, classifier: ClassifierRef, asset: string, source: string, now: number = Date.now()): Promise<AddedReference> {
  const screened = await renders.screeningOf(asset, classifier)
  if (!screened) return { ok: false, reason: 'not-screened' }
  if (screened.imageHash.algorithm !== PDQ_ALGORITHM) return { ok: false, reason: 'not-pdq' }
  const reference = ScreeningReference.parse({ imageHash: screened.imageHash, source, addedAt: now })
  return { ok: true, added: (await renders.addScreeningReference(reference)) === 'added', reference }
}

export type ImportedReferences = { added: number; known: number; refused: { line: number; error: string }[] }

// Hashes from a list someone else keeps in PDQ, one JSON object a line, `{"bits": "<64 hex>",
// "quality": 0–100?, "source": "…"?}` (#1273): no picture is fetched and none comes with them. A
// line without its own source takes the one given for the file. `screening reference import <fil>
// <källa>`.
export async function importReferences(renders: Pick<RenderStore, 'addScreeningReference'>, text: string, source: string, now: number = Date.now()): Promise<ImportedReferences> {
  const out: ImportedReferences = { added: 0, known: 0, refused: [] }
  const lines = text.split('\n')
  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue
    try {
      const raw = JSON.parse(line) as { bits?: unknown; quality?: unknown; source?: unknown }
      const reference = ScreeningReference.parse({ imageHash: { algorithm: PDQ_ALGORITHM, bits: raw.bits, ...(raw.quality === undefined ? {} : { quality: raw.quality }) }, source: raw.source ?? source, addedAt: now })
      out[(await renders.addScreeningReference(reference)) === 'added' ? 'added' : 'known']++
    } catch (err) {
      out.refused.push({ line: i + 1, error: err instanceof Error ? err.message.split('\n')[0] ?? '' : String(err) })
    }
  }
  return out
}
