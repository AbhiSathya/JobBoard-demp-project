import { useEffect, useState } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'jobboard_theme'

function apply(choice: ThemeChoice) {
  const root = document.documentElement
  // "system" deliberately stamps nothing, leaving prefers-color-scheme in charge.
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(
    () => (localStorage.getItem(KEY) as ThemeChoice | null) ?? 'system',
  )

  useEffect(() => {
    apply(choice)
    localStorage.setItem(KEY, choice)
  }, [choice])

  return { choice, setChoice }
}
