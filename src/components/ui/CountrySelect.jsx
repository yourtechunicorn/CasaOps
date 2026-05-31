import { useState, useRef } from 'react'
import { COUNTRIES, countryFlag } from '../../data/countries'

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition'

export default function CountrySelect({ value, onChange, required, placeholder = 'Search country…' }) {
  const [query,   setQuery]   = useState('')
  const [open,    setOpen]    = useState(false)
  const [focused, setFocused] = useState(false)
  const containerRef = useRef(null)

  const selected = COUNTRIES.find(c => c.code === value)

  const results = (() => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES.slice(0, 8)
    return COUNTRIES.filter(
      c => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q
    ).slice(0, 10)
  })()

  function handleFocus() {
    setFocused(true)
    setQuery('')
    setOpen(true)
  }

  function handleBlur() {
    // Delay so mouseDown on an option fires before the dropdown closes
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setFocused(false)
        setOpen(false)
        setQuery('')
      }
    }, 150)
  }

  function handleSelect(country) {
    onChange(country.code)
    setQuery('')
    setOpen(false)
    setFocused(false)
  }

  function handleInput(e) {
    setQuery(e.target.value)
    setOpen(true)
    if (!e.target.value) onChange('')
  }

  const displayValue = focused
    ? query
    : selected
      ? `${countryFlag(selected.code)} ${selected.name}`
      : ''

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        className={inputCls}
      />
      {/* Hidden field carries the ISO code for form submission */}
      {required && !value && (
        <input
          tabIndex={-1}
          required
          value=""
          onChange={() => {}}
          style={{ opacity: 0, height: 0, position: 'absolute', pointerEvents: 'none' }}
        />
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto py-1">
          {results.map(c => (
            <li key={c.code}>
              <button
                type="button"
                onMouseDown={() => handleSelect(c)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-brand-50 transition-colors ${
                  c.code === value ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'
                }`}
              >
                <span className="text-base leading-none">{countryFlag(c.code)}</span>
                <span className="flex-1">{c.name}</span>
                <span className="text-gray-400 text-xs font-mono">{c.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
