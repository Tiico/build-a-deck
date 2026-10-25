import { BOX_CLASSIFIER, createBoxClassifier } from './box-classifier.js'
import type { Classifier } from './classifier.js'
import { createFakeClassifier } from './fake.js'
import type { ClassifierRef } from './schema.js'

// The classifiers the render worker on the box has (F4, beslut 8: on the box, in the render
// worker, so that no picture leaves the house), and the one screening asks for now.
//
// The one screening asks for is the box classifier (#1273), chosen by measuring against card art.
// The fake stays beside it: its results say `fake@1`, so they are never read as a model's, and the
// operator can still try the whole path with it. A new version of the box classifier is added here
// beside the old one and made the current one; the old one's results stay under their own name.
export const CURRENT_CLASSIFIER: ClassifierRef = BOX_CLASSIFIER

export const boxClassifiers = (): Classifier[] => [createFakeClassifier(), createBoxClassifier()]
