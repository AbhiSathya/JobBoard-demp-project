import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const fieldClasses =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-slate-500 focus:outline focus:outline-2 focus:outline-slate-200 ' +
  'disabled:bg-slate-50 disabled:text-slate-400'

interface WrapperProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
  required?: boolean
}

export function FieldWrapper({ label, htmlFor, error, hint, children, required }: WrapperProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, id, required, className = '', ...props }: InputProps) {
  const fieldId = id ?? props.name ?? label
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <input id={fieldId} className={`${fieldClasses} ${className}`} {...props} />
    </FieldWrapper>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  hint?: string
}

export function Textarea({ label, error, hint, id, required, className = '', ...props }: TextareaProps) {
  const fieldId = id ?? props.name ?? label
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <textarea id={fieldId} className={`${fieldClasses} ${className}`} {...props} />
    </FieldWrapper>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  hint?: string
}

export function Select({ label, error, hint, id, required, className = '', children, ...props }: SelectProps) {
  const fieldId = id ?? props.name ?? label
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint} required={required}>
      <select id={fieldId} className={`${fieldClasses} ${className}`} {...props}>
        {children}
      </select>
    </FieldWrapper>
  )
}
