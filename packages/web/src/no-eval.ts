import { config } from 'zod'

// The page's policy allows no `eval` (#1008, DRIFT §14), and zod asks whether it may compile a
// fast path for an object schema by trying `new Function('')` once. The throw is caught and zod
// goes on without it — but the browser has already reported the attempt as a refusal of the
// policy, on every page, which would leave the policy's reports with nothing in them but this.
// `jitless` skips the question; in the browser the answer is no either way, so nothing is slower.
//
// Imported first by `main.tsx`, before anything that could parse.
config({ jitless: true })
