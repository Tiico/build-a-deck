import type { Classifier } from './classifier.js'
import { createFakeClassifier, FAKE_CLASSIFIER } from './fake.js'
import type { ClassifierRef } from './schema.js'

// The classifiers the render worker on the box has (F4, beslut 8: on the box, in the render
// worker, so that no picture leaves the house), and the one screening asks for now.
//
// Until a real classifier is chosen (#1273) the only one is the fake: it lets the operator run the
// whole path on the box — the job, the bytes, Chromium's drawing and the result — and its results
// say `fake@1`, so they are never read as a model's. Choosing a real one adds it here and makes it
// the current one; the fake's results stay under their own name.
export const CURRENT_CLASSIFIER: ClassifierRef = FAKE_CLASSIFIER

export const boxClassifiers = (): Classifier[] => [createFakeClassifier()]
