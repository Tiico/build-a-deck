import { describe, expect, it } from 'vitest'
import { BOX_CLASSIFIER, boxClassifiers, CURRENT_CLASSIFIER, FAKE_CLASSIFIER } from '../src/index.js'

// The render worker on the box runs the classifiers (F4, beslut 8), and the operator's script and
// the upload ask for one of them by id and version. A version asked for that no worker has would
// fail every job it queued.
describe('klassificerarna på lådan', () => {
  it('har den klassificerare och version som screeningen ber om, en gång', () => {
    const matching = boxClassifiers().filter((c) => c.id === CURRENT_CLASSIFIER.id && c.version === CURRENT_CLASSIFIER.version)
    expect(matching).toHaveLength(1)
  })

  // Chosen by measuring against card art (#1273). The fake stays, so that a result under `fake@1`
  // from before can still be read for what it is, and the operator can try the path without a model.
  it('screenar med den riktiga klassificeraren, och har kvar fake-klassificeraren', () => {
    expect(CURRENT_CLASSIFIER).toEqual(BOX_CLASSIFIER)
    expect(boxClassifiers().map((c) => ({ id: c.id, version: c.version }))).toContainEqual(FAKE_CLASSIFIER)
  })

  it('har aldrig två med samma id och version', () => {
    const keys = boxClassifiers().map((c) => `${c.id}@${c.version}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
