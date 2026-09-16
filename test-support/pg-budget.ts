// What a test is given to finish its work in, when its work is a real Postgres.
//
// Vitest's five seconds is the wrong number for this class the same way it was the wrong number
// for the jsdom class (#92, `packages/web/test/budget.ts`), and for the same reason: the default
// was chosen against no particular work, and this work is particular. A suite in this class opens
// a connection, runs `CREATE SCHEMA`, migrates it, does a dozen round trips against it and drops
// it again — all of it in another process, which has to be given a core before any of it can
// begin. The test itself computes almost nothing. What it spends is waiting.
//
// On this machine, against a local Postgres, that waiting is nothing at all. The body that fell
// — `history`'s `keeps every save and hands an older one back whole`, which connects, migrates
// and drops inside the `it` rather than around it — measured 288, 467, 389 and 511 ms over four
// runs of the server suite (#139), 254 ms in a run of the four Postgres suites alone, and 736 ms
// in a run of the whole workspace on 2026-09-16. The heaviest in the class is `render`'s
// `puts the output in the object store with its content type` at 768 ms in that same run. Every
// other body is a fraction of those: 321, 272, 220, 154, 153, 113, 33, 29 ms. Six times under the
// default at worst and twenty for most of them, which is exactly the margin that looks like
// enough and is not.
//
// It was not enough. That same body failed in CI as `Test timed out in 5000ms.` on a pull request
// that had not touched the server at all (run 35060252946, PR #134). Nothing was wrong with a
// value; the test did not get to the end. So the one loaded observation this class has says the
// body took more than five seconds, which is more than six times its worst idle measurement and
// ten times its median — and five seconds is a floor on it, not a figure, because a timeout only
// ever says "at least".
//
// That factor is not a surprise here. In CI the suites share a couple of cores with the Postgres
// service container in the very same job, and the web suite has just finished driving Chromium
// through them. The repo has measured that kind of contention twice already and written both
// down: the web suite took 1153 seconds against 145 with the machine to itself, and `felt-names`
// was cut off at sixty on a body that takes ten (`test-support/one-suite-at-a-time.ts`). A
// database waiting for a core behind a browser is the same arithmetic, and a test that spends its
// time waiting is the test that feels it most.
//
// Fifteen seconds, then. It is three times the only loaded observation the class has, which is
// the discipline `jsdom-suite-budget` already applies to its own worst hour, and it is twenty
// times the heaviest measurement from an idle machine. A runner would have to be slower again by
// half than the one that already failed before this number ran out.
//
// It is deliberately smaller than the twenty a jsdom test is given, and far inside the sixty a
// suite gets for opening a browser. Those classes do seconds of real work; this one does
// milliseconds of it and then waits, so a body here that has passed fifteen seconds is not a
// contended runner but a hang — a lock never granted, a claim waiting on a row, a connection to a
// database that is not there — and a hang has to keep failing the run, promptly and by name. That
// is the whole trade: large enough to carry the worst hardware the suite has ever run on, small
// enough that it still tells you when nothing is coming.
//
// It lives here, beside the machine lock and the report writer, because two packages need it and
// neither may reach into the other's tests for it. `@byd/server` depends on `@byd/render`, not the
// other way round, and putting a test-only constant in `@byd/render`'s export map to make the
// dependency usable would be paying in the shipped package for a convenience in the test one.
// `test-support/` is where the things every package's tests share already live, reachable from
// both by a relative path and owing nothing to either. `pg-suite-budget.test.ts` is what carries
// this number to every suite it is for, including the next one written.
export const PG_TEST_BUDGET = 15_000
