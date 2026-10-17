import { holdTestsToOwnTime } from '../../../../test-support/own-time-guard.js'
import { FIXTURE_BUDGET, FIXTURE_CEILING } from './numbers.js'

holdTestsToOwnTime(FIXTURE_BUDGET, FIXTURE_CEILING)
