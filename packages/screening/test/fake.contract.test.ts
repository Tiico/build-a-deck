import { classifierContract } from '../contract/suite.js'
import { createFakeClassifier } from '../src/index.js'

// The fake stands where a real classifier will (slice 4, #1273): the same suite every classifier
// is held to, so the suite is proven to be one a classifier can pass.
classifierContract('fake-klassificeraren', { classifier: () => createFakeClassifier() })
