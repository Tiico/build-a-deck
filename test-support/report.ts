// What a run leaves behind when it falls (#111).
//
// The console is the one thing that gets piped away. A gate run is read by a person or by an
// agent, and both of them reach for `tail`, `grep` or `head` when the output is long — at which
// point a failing suite has said its name into a closed pipe. That is not a hypothetical: it is
// what #111 *is*. The suite fell on the merge commit for #110, the output went through
// `tail -12`, and the only thing left was `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`. Nobody could say
// whether it was the code or the machine, so the issue had to be opened about the missing detail
// instead of about the failure. It happened again on 2026-09-15 through a `grep`: five test names
// survived by luck and not one assertion message.
//
// So the run writes its own account to a file as well. A file is not pipeable, so the account
// survives whatever anyone puts after the command — and the next failure is a diagnosis rather
// than another issue about not having one.
//
// This is not a fix for a flaky test. It is the other half of what a gate is for: a gate that
// fails without saying why has only told you to run it again.

/** Where a package leaves its account, beside the package it is an account of. */
export const REPORT_FILE = '.vitest-report.json'

/**
 * The reporters every package asks for: the one a person reads while it runs, and the one that
 * is still there afterwards. Spread into a vitest `test` block.
 *
 * `default` stays first and unchanged, because the file is an addition and never a replacement:
 * a run that says nothing while it works is worse to sit through than one whose tail gets cut.
 */
export const reporting = () =>
  ({
    reporters: ['default', ['json', { outputFile: REPORT_FILE }]],
  }) satisfies { reporters: unknown[] }

/** Where a Playwright package leaves its account. The same idea, in the other runner's spelling. */
export const PLAYWRIGHT_REPORT_FILE = '.playwright-report.json'

/**
 * The reporters a Playwright package asks for, for the same reason `reporting()` exists: the
 * console is the one thing that gets piped away, and a gate read through `tail` has said its
 * failure into a closed pipe (#111). Spread into a `defineConfig`'s `reporter`.
 *
 * `list` stays first and unchanged — a run that says nothing while it works is worse to sit
 * through than one whose tail gets cut.
 */
export const playwrightReporting = () => [['list'], ['json', { outputFile: PLAYWRIGHT_REPORT_FILE }]] as const
