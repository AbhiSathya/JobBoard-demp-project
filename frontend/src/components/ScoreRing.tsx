/** The score as a ring: shape carries the magnitude, the number carries the precision. */
export function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, score))

  const tone = clamped >= 70 ? 'var(--good)' : clamped >= 50 ? 'var(--accent)' : 'var(--warn)'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[13px] font-medium tabular-nums text-ink">
        {Math.round(clamped)}
      </span>
      <span className="sr-only">Match score {Math.round(clamped)} out of 100</span>
    </div>
  )
}
