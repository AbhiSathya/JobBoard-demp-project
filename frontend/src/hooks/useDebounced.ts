import { useEffect, useState } from 'react'

/**
 * Lag a value behind its source by `delay` ms.
 *
 * Used so the search box stays instant to type in while the query key — and
 * therefore the network request — only changes once the user pauses. A 12-line
 * hook rather than a dependency, because that is all a setTimeout with a cleanup is.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
