import { useId, useState } from 'react'
import { FIELD_KINDS, suggestFieldKey, type FieldKind } from './fields.js'
import { useT, type Key } from '../i18n/index.js'

const KIND_WORD: Record<FieldKind, Key> = {
  text: 'table.field.kind.text',
  number: 'table.field.kind.number',
  image: 'table.field.kind.image',
}

export type NewFieldProps = {
  // Every name the table already answers to: the fields, `antal`, and the card's own `id`. A
  // name that is one of them is not a new column but a collision, and is said so.
  taken: readonly string[]
  onCreate(field: string): void
  onCancel(): void
}

// One form, two doors (#32): the table head opens it where the column will stand, and the
// template's binding opens it where the designer noticed the field was missing. It is the same
// component either way, so the designer never has to leave what she is doing to make a field
// possible.
export function NewField({ taken, onCreate, onCancel }: NewFieldProps) {
  const t = useT()
  const group = useId()
  const [kind, setKind] = useState<FieldKind>('text')
  // What the tool suggests follows the kind until the designer writes her own word over it;
  // after that the box is hers and changing the kind no longer touches it.
  const [name, setName] = useState(() => suggestFieldKey('text', taken))
  const [own, setOwn] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const pick = (next: FieldKind) => {
    setKind(next)
    if (!own) setName(suggestFieldKey(next, taken))
  }
  const submit = () => {
    const field = name.trim()
    if (field === '') return setRefused(t('table.field.needsName'))
    if (taken.includes(field)) return setRefused(t('table.field.taken', { field }))
    onCreate(field)
  }
  return (
    <form
      className="byd-newfield"
      aria-label={t('table.field.new')}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <label>
        {t('table.field.name')}
        <input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setOwn(true)
            setRefused(null)
          }}
        />
      </label>
      <fieldset>
        <legend>{t('table.field.kind')}</legend>
        {FIELD_KINDS.map((k) => (
          <label key={k}>
            <input type="radio" name={group} checked={kind === k} onChange={() => pick(k)} />
            {t(KIND_WORD[k])}
          </label>
        ))}
      </fieldset>
      {refused !== null && <p role="alert">{refused}</p>}
      <div className="byd-newfield-do">
        <button type="submit">{t('table.field.create')}</button>
        <button type="button" data-kind="quiet" onClick={onCancel}>
          {t('editor.cancel')}
        </button>
      </div>
    </form>
  )
}
