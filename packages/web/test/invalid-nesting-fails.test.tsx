// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { takeNestingWarnings } from './nesting.js'

// A test that draws markup the HTML parser would rewrite fails (#1401). React says so on
// `console.error` and nothing else listened: `<p class="byd-help-row">` round the phone's help box
// stood in the suite's output four times per run while every test passed. A browser lifts a `<div>`
// or a `<p>` out of a `<p>`, so the page it builds is not the one the code wrote.
// `test/setup.ts` fails every test that draws such markup; the warnings taken here are the ones it
// would have failed this file with.
describe('invalid nesting fails the test that drew it', () => {
  it('takes a block inside a paragraph', () => {
    render(<p><div>inside</div></p>)
    expect(takeNestingWarnings()).toEqual([expect.stringMatching(/<div> cannot be a descendant of <p>/)])
  })

  it('takes a paragraph inside a paragraph, however deep', () => {
    render(<p><span><p>inside</p></span></p>)
    expect(takeNestingWarnings()).toEqual([expect.stringMatching(/<p> cannot be a descendant of <p>/)])
  })

  it('takes a child its parent may not hold', () => {
    render(<table><tr><td>cell</td></tr></table>)
    expect(takeNestingWarnings()).toEqual([expect.stringMatching(/<tr> cannot be a child of <table>/)])
  })

  it('takes nothing from markup a parser keeps as written', () => {
    render(<div><p>fine</p><ul><li>fine</li></ul></div>)
    expect(takeNestingWarnings()).toEqual([])
  })
})
