import { useState } from 'react'

export default function TagEditor({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[]
  suggestions: string[]
  onChange: (tags: string[]) => void
}) {
  const [input, setInput] = useState('')

  function add(raw: string) {
    const tag = raw.trim().toLocaleLowerCase('nl')
    setInput('')
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
  }

  const options = suggestions.filter((s) => !tags.includes(s))

  return (
    <div className="flex max-w-xl flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-accent/15 py-1 pr-1.5 pl-3 text-sm text-accent-hover">
          {tag}
          <button
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`Label ${tag} verwijderen`}
            className="rounded-full px-1 text-accent-hover/70 hover:text-white"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        list="tag-suggestions"
        onChange={(e) => {
          // Kiezen uit de suggesties of een komma typen voegt het label toe
          const value = e.target.value
          if (value.endsWith(',')) add(value.slice(0, -1))
          else if (options.includes(value)) add(value)
          else setInput(value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(input)
          }
        }}
        onBlur={() => input && add(input)}
        placeholder={tags.length ? 'Nog een label…' : 'Label toevoegen, bijv. favoriet'}
        className="min-w-36 flex-1 rounded-md border border-line bg-panel px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <datalist id="tag-suggestions">
        {options.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}
