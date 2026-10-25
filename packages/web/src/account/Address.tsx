import { Fragment } from 'react'

// An email address in a sentence, laid so that it breaks where an address breaks (#1359): after the
// «@» and after a dot, and never inside a part that fits on its line. A beta tester's address can be
// sixty characters, a double name and a plus in it, and the card at 320 px is narrower than that. Each
// part stands whole (`account.css`, `.byd-address`) and gives way inside only when it alone is wider
// than the line, so the page never scrolls sideways. The text is the address as it was typed: nothing
// is added that a reader copying it would carry along.
export function Address({ email }: { email: string }) {
  const parts = email.split(/(?<=[@.])/)
  return (
    <span className="byd-address">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          <span>{part}</span>
        </Fragment>
      ))}
    </span>
  )
}
