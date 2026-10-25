import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifierContract, picture, scene, shrink } from '../contract/suite.js'
import { BOX_CLASSIFIER, boxClassifierIngredients, createBoxClassifier, hammingDistance, PDQ_MATCH_DISTANCE, Screening } from '../src/index.js'

// The box's classifier (#1273) is held to the suite every classifier is held to, with its models
// loaded: the global setup has fetched them, as the render image's build does.
classifierContract('lådans klassificerare', { classifier: () => createBoxClassifier() })

describe('lådans klassificerare', () => {
  it('heter vit-nsfw.clip-violence, och version 1 är just de modellerna och de prompterna', () => {
    expect(BOX_CLASSIFIER).toEqual({ id: 'vit-nsfw.clip-violence', version: '1' })
    // Changing a model or a prompt changes what a score means. That is a new version: change the
    // version above and the fingerprint here in the same commit.
    expect(boxClassifierIngredients()).toBe('cfd0bafa54a630f01663b89f22545c46112cf316922b9ef07f2744b87dba26b2')
  })

  it('hashar med PDQ och säger kvaliteten, och samma bild i halva storleken är samma bild', async () => {
    const c = createBoxClassifier()
    const big = Screening.parse(await c.classify(scene(512, 512)))
    const half = Screening.parse(await c.classify(shrink(scene(512, 512), 2)))
    expect(big.imageHash.algorithm).toBe('pdq-256')
    expect(big.imageHash.quality).toBeGreaterThanOrEqual(50)
    expect(hammingDistance(big.imageHash, half.imageHash)).toBeLessThanOrEqual(PDQ_MATCH_DISTANCE)
  })

  it('ger en vanlig bild låga poäng i båda kategorierna', async () => {
    const { scores } = await createBoxClassifier().classify(scene(512, 384))
    expect(scores.sexual).toBeLessThan(0.5)
    expect(scores.violence).toBeLessThan(0.5)
  })

  it('säger var modellen ska ligga och hur den hämtas, när den inte finns', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'byd-no-models-'))
    try {
      await expect(createBoxClassifier({ dir: empty }).classify(picture(8, 8, () => [0, 0, 0, 255]))).rejects.toThrow(/fetch-models/)
    } finally {
      await rm(empty, { recursive: true, force: true })
    }
  })
})
