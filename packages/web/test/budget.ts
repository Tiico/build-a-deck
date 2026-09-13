// What a test in this suite is given to finish its work in, when its work is a page.
//
// Vitest's five seconds is the wrong number for a whole class of test here. A suite in that class
// stands the real app up: React renders into jsdom, a server runs in this very process, a socket
// carries real frames, and a person is simulated clicking through all of it. On an idle machine
// the heaviest of those tests already takes between 3.3 and 3.65 seconds — the symbol library
// narrowing to a category took 3651 ms, a Ctrl+Z and a Shift+Ctrl+Z 3564 ms, a saving that changed
// nothing 3323 ms. Against five seconds that is thirty per cent of margin, and thirty per cent is
// nothing: another suite, a parallel session, a Chromium opening beside it, and the test is cut
// off in the middle of work it was doing correctly. That is exactly what it looked like — four
// runs of one commit gave four failures, then none, then one, then none, always
// `Test timed out in 5000ms.`, never a value that was wrong, and a different set of suites each
// time (#92). Measured again while this machine carried a load average of 288, the heaviest body
// in the class took 5830 ms and the run failed on it. The heaviest ever seen is 5898 ms, and it
// belongs to `data-table-bulk`, which stands up no server at all — a deck rendered into a document
// and driven by simulated keystrokes is heavy for its own reasons, which is why the class is drawn
// around the work a test does and not around the server it happens to need.
//
// Twenty seconds, then. It is five and a half times the heaviest idle measurement and three and a
// half times the heaviest loaded one, and it is five times over the four seconds a `waitFor` is
// given in `setup.ts`: a test that waits three or four times can afford every one of those waits
// at full patience and the work between them, which five seconds never could.
//
// It is deliberately not larger than that. A test that hangs must still fail the run, and it does.
// The common hang — waiting for something that never happens — fails after four seconds whatever
// this number is, because that is all the patience a wait has. Everything else fails here, twenty
// seconds in, which is a third of the sixty a suite is given to open a browser and far inside the
// time a person will sit in front of a run. `browser-suite-budget.test.ts` holds the other end of
// that pair; `jsdom-suite-budget.test.ts` is what carries this one to every suite it is for.
export const JSDOM_TEST_BUDGET = 20_000
