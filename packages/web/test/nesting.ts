import { format } from 'node:util'

// What React says when the markup it was given is not what an HTML parser would build (#1401).
//
// React checks the nesting as it creates elements and says so on `console.error` — «In HTML, <div>
// cannot be a descendant of <p>», «… cannot be a child of <table>» — and goes on drawing. jsdom
// builds the tree React asks for, so every query in the test still finds what it looks for. A
// browser parsing the same markup does not: it closes the `<p>` before the `<div>`, and the page a
// reader gets is not the one the code wrote. Nothing listened to the warning, so it stood in the
// suite's output four times a run while every test passed.
//
// `test/setup.ts` fails the test that drew it. React says each pair once per module, so it is the
// first test in a file to draw the markup that fails, which is the one to look at.
const NESTING = /^In HTML, .+ cannot be a (?:child|descendant) of </

const heard: string[] = []

export const listenForNesting = (): void => {
  const said = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    const line = format(...args)
    if (NESTING.test(line)) heard.push(line)
    said(...args)
  }
}

// The warnings since the last time anyone asked, and none left behind for the next to find.
export const takeNestingWarnings = (): string[] => heard.splice(0)
