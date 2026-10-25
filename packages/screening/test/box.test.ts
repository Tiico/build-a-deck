import { describe, expect, it } from 'vitest'
import { boxClassifiers, CURRENT_CLASSIFIER } from '../src/index.js'

// The render worker on the box runs the classifiers (F4, beslut 8), and the operator's script and
// the upload ask for one of them by id and version. A version asked for that no worker has would
// fail every job it queued.
describe('klassificerarna på lådan', () => {
  it('har den klassificerare och version som screeningen ber om, en gång', () => {
    const matching = boxClassifiers().filter((c) => c.id === CURRENT_CLASSIFIER.id && c.version === CURRENT_CLASSIFIER.version)
    expect(matching).toHaveLength(1)
  })

  it('har aldrig två med samma id och version', () => {
    const keys = boxClassifiers().map((c) => `${c.id}@${c.version}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
