import {
  useId,
  useState,
  type ComponentPropsWithRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { Chip } from './Badge'

const control =
  'w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-3 ' +
  'transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ' +
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3'

function Shell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label?: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-critical">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-3">{hint}</p>
      )}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  leading?: ReactNode
}

export function Input({ label, hint, error, leading, className = '', id, ...props }: InputProps) {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <Shell id={fieldId} label={label} hint={hint} error={error}>
      <div className="relative">
        {leading && (
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
            {leading}
          </span>
        )}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={`${control} h-9.5 ${error ? 'border-critical' : 'border-line-strong'} ${leading ? 'pl-9' : ''} ${className}`}
          {...props}
        />
      </div>
    </Shell>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
}

export function Select({ label, hint, error, className = '', id, children, ...props }: SelectProps) {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <Shell id={fieldId} label={label} hint={hint} error={error}>
      <select
        id={fieldId}
        className={`${control} h-9.5 appearance-none bg-[length:10px] bg-[right_0.75rem_center] bg-no-repeat pr-8 ${error ? 'border-critical' : 'border-line-strong'} ${className}`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2379818f' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {children}
      </select>
    </Shell>
  )
}

/** ComponentPropsWithRef rather than TextareaHTMLAttributes so callers can pass a
 *  ref straight through — in React 19 it arrives as an ordinary prop. */
interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
  label?: string
  hint?: string
  error?: string
}

export function Textarea({ label, hint, error, className = '', id, ...props }: TextareaProps) {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <Shell id={fieldId} label={label} hint={hint} error={error}>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={`${control} resize-y py-2 leading-relaxed ${error ? 'border-critical' : 'border-line-strong'} ${className}`}
        {...props}
      />
    </Shell>
  )
}

/** Skills, domains — anything that is a set of short strings.
 *  A comma-separated text box makes the user guess the format; this doesn't. */
export function ChipInput({
  label,
  hint,
  error,
  value,
  onChange,
  placeholder = 'Type and press Enter',
  suggestions = [],
}: {
  label?: string
  hint?: string
  error?: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  suggestions?: string[]
}) {
  const fieldId = useId()
  const [draft, setDraft] = useState('')

  function add(raw: string) {
    const entry = raw.trim().replace(/,$/, '')
    if (!entry) return
    if (!value.some((v) => v.toLowerCase() === entry.toLowerCase())) onChange([...value, entry])
    setDraft('')
  }

  const unused = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 6)

  return (
    <Shell id={fieldId} label={label} hint={hint} error={error}>
      <div
        className={`flex min-h-9.5 flex-wrap items-center gap-1.5 rounded-md border bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 ${error ? 'border-critical' : 'border-line-strong'}`}
      >
        {value.map((entry) => (
          <Chip
            key={entry}
            tone="accent"
            onRemove={() => onChange(value.filter((v) => v !== entry))}
            removeLabel={`Remove ${entry}`}
          >
            {entry}
          </Chip>
        ))}
        <input
          id={fieldId}
          value={draft}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => add(draft)}
          className="min-w-[7rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-3">Common:</span>
          {unused.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded border border-dashed border-line-strong px-1.5 py-0.5 text-[11px] text-ink-3 transition-colors hover:border-accent hover:text-accent"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </Shell>
  )
}
