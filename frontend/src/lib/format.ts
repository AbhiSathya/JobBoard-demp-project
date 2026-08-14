import type { EmploymentType, ExperienceLevel } from '../types'

export const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  entry: 'Entry',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead',
}

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

/** "3 days ago" reads faster than a date when the only question is "is this fresh?". */
export function relativeTime(iso: string): string {
  const then = new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'

  // Largest unit that gives a count of at least 1.
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_557_600],
    ['month', 2_629_800],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ]

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, size] of steps) {
    if (seconds >= size) return formatter.format(-Math.floor(seconds / size), unit)
  }
  return 'just now'
}

/** Two-letter mark from a company name, used where a logo would be. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase()
}

export function formatDate(iso: string): string {
  const date = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
