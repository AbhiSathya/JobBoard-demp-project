import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState, ErrorBanner, Skeleton } from '../../components/ui/Feedback'
import { Card, PageHeader } from '../../components/ui/Surface'
import { useAnalytics } from '../../hooks/useAnalytics'
import { formatDate } from '../../lib/format'
import type { AnalyticsResponse } from '../../types'

/* Series colours come from the theme tokens, so every chart re-steps itself in
   dark mode instead of keeping a light-mode hue on a dark ground. */
const S1 = 'var(--series-1)'
const S2 = 'var(--series-2)'
const AXIS = { stroke: 'var(--ink-3)', fontSize: 11, tickLine: false }

const TOOLTIP_STYLE = {
  background: 'var(--raised)',
  border: '1px solid var(--line-strong)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--ink)',
  boxShadow: 'var(--shadow-overlay)',
}

export function AdminDashboardPage() {
  const { data, isLoading, isError, refetch } = useAnalytics()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-52" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return <ErrorBanner message="Could not load analytics." onRetry={() => refetch()} />
  }

  return (
    <div>
      <PageHeader
        eyebrow="Employer"
        title="Dashboard"
        description="Counted live from your postings and their applications — nothing here is cached or estimated."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Postings" value={data.total_jobs} detail={`${data.open_jobs} open`} />
        <StatTile label="Applications" value={data.total_applications} detail="across all postings" />
        <StatTile
          label="Shortlisted"
          value={data.pipeline_counts.shortlisted}
          detail={rate(data.pipeline_counts.shortlisted, data.total_applications)}
        />
        <StatTile
          label="Awaiting review"
          value={data.pipeline_counts.applied}
          detail={data.pipeline_counts.applied > 0 ? 'needs a decision' : 'all reviewed'}
          emphasis={data.pipeline_counts.applied > 0}
        />
      </div>

      {data.total_jobs === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="Nothing to chart yet"
            description="Post your first role — applications, pipeline and skill demand all start filling in from there."
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Pipeline data={data} />
          <PerJob data={data} />
          <SkillDemand data={data} />
          <OverTime data={data} />
        </div>
      )}
    </div>
  )
}

function rate(part: number, whole: number): string {
  if (!whole) return 'no applications yet'
  return `${Math.round((part / whole) * 100)}% of applications`
}

/** The number is the point, so it gets the size; the label and the derived
 *  figure sit around it in smaller type. It counts up once on mount — motion
 *  that says "this was just measured", not decoration. */
function StatTile({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string
  value: number
  detail?: string
  emphasis?: boolean
}) {
  const shown = useCountUp(value)
  return (
    <Card className="p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{label}</p>
      <p
        className={`mt-2 font-mono text-3xl font-medium tabular-nums ${emphasis ? 'text-accent' : 'text-ink'}`}
      >
        {shown}
      </p>
      {detail && <p className="mt-1 text-xs text-ink-3">{detail}</p>}
    </Card>
  )
}

function useCountUp(target: number, duration = 500) {
  const [value, setValue] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) {
      setValue(target)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration])

  return value
}

/** Panel with a chart/table switch. The table is not a fallback — it is the
 *  accessible reading of the same numbers, one click away on every chart. */
function ChartPanel({
  title,
  description,
  empty,
  table,
  children,
}: {
  title: string
  description?: string
  empty?: string
  table: ReactNode
  children: ReactNode
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')

  return (
    <Card as="section" className="flex flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
        </div>
        {!empty && (
          <div className="flex rounded border border-line p-0.5">
            {(['chart', 'table'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                aria-pressed={view === option}
                className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                  view === option ? 'bg-sunken text-ink' : 'text-ink-3 hover:text-ink'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="p-5">
        {empty ? (
          <p className="py-10 text-center text-sm text-ink-3">{empty}</p>
        ) : view === 'chart' ? (
          children
        ) : (
          <div className="overflow-x-auto">{table}</div>
        )}
      </div>
    </Card>
  )
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-[13px]">
      <thead>
        <tr className="border-b border-line">
          {head.map((cell) => (
            <th key={cell} scope="col" className="py-1.5 pr-3 font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-ink-3">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b border-line last:border-0">
            {row.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                className={`py-1.5 pr-3 ${cellIndex === 0 ? 'text-ink' : 'font-mono tabular-nums text-ink-2'}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** applied → shortlisted is a funnel, not three independent bars: every
 *  shortlisted application was an applied one first. Width carries the drop-off. */
function Pipeline({ data }: { data: AnalyticsResponse }) {
  const { applied, shortlisted, rejected } = data.pipeline_counts
  const total = applied + shortlisted + rejected
  const stages = [
    { label: 'Received', value: total, tone: 'bg-accent' },
    { label: 'Shortlisted', value: shortlisted, tone: 'bg-good' },
    { label: 'Rejected', value: rejected, tone: 'bg-critical' },
  ]

  return (
    <ChartPanel
      title="Pipeline"
      description="Where every application currently sits."
      empty={total === 0 ? 'No applications yet.' : undefined}
      table={
        <DataTable
          head={['Stage', 'Count', 'Share']}
          rows={stages.map((s) => [s.label, s.value, total ? `${Math.round((s.value / total) * 100)}%` : '—'])}
        />
      }
    >
      <ol className="flex flex-col gap-4">
        {stages.map((stage) => {
          const share = total ? stage.value / total : 0
          return (
            <li key={stage.label}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-ink-2">{stage.label}</span>
                <span className="font-mono tabular-nums text-ink">
                  {stage.value}
                  <span className="ml-1.5 text-ink-3">{Math.round(share * 100)}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-sunken">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${stage.tone}`}
                  style={{ width: `${Math.max(share * 100, stage.value > 0 ? 2 : 0)}%` }}
                />
              </div>
            </li>
          )
        })}
        <li className="border-t border-line pt-3 text-xs text-ink-3">
          {applied} still awaiting a decision.
        </li>
      </ol>
    </ChartPanel>
  )
}

function PerJob({ data }: { data: AnalyticsResponse }) {
  const rows = data.applications_per_job.slice(0, 8)

  return (
    <ChartPanel
      title="Applications per posting"
      description="Top 8 by volume."
      empty={rows.length === 0 ? 'No postings to chart yet.' : undefined}
      table={
        <DataTable
          head={['Posting', 'Applications', 'Status']}
          rows={data.applications_per_job.map((r) => [r.job_title, r.count, r.status])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 34)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 28 }}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS} />
          <YAxis type="category" dataKey="job_title" width={130} {...AXIS} />
          <Tooltip cursor={{ fill: 'var(--sunken)' }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" name="Applications" radius={[0, 4, 4, 0]} barSize={14}>
            {rows.map((row) => (
              // Closed postings recede — the same measure, a different state.
              <Cell key={row.job_id} fill={row.status === 'open' ? S1 : 'var(--line-strong)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-ink-3">Muted bars are closed postings.</p>
    </ChartPanel>
  )
}

/** The chart that answers a question nothing else here does: are you asking for
 *  skills your applicants actually have? Paired bars, one axis, same units. */
function SkillDemand({ data }: { data: AnalyticsResponse }) {
  const rows = data.skill_demand.slice(0, 8)

  return (
    <ChartPanel
      title="Skill demand vs. supply"
      description="Postings requiring a skill, against applicants who list it."
      empty={rows.length === 0 ? 'No required skills recorded yet.' : undefined}
      table={
        <DataTable
          head={['Skill', 'Required by', 'Applicants']}
          rows={data.skill_demand.map((r) => [r.skill, r.required_by_jobs, r.applicants_with_skill])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 38)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }} barGap={2}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS} />
          <YAxis type="category" dataKey="skill" width={100} {...AXIS} />
          <Tooltip cursor={{ fill: 'var(--sunken)' }} contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 11, color: 'var(--ink-2)' }} />
          <Bar dataKey="required_by_jobs" name="Postings requiring it" fill={S1} radius={[0, 4, 4, 0]} barSize={10} />
          <Bar dataKey="applicants_with_skill" name="Applicants with it" fill={S2} radius={[0, 4, 4, 0]} barSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}

function OverTime({ data }: { data: AnalyticsResponse }) {
  const rows = data.applications_over_time

  return (
    <ChartPanel
      title="Applications over time"
      description="Daily count since your first posting."
      empty={rows.length === 0 ? 'No applications yet.' : undefined}
      table={<DataTable head={['Date', 'Applications']} rows={rows.map((r) => [formatDate(r.date), r.count])} />}
    >
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={rows} margin={{ left: -16, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="over-time-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={S1} stopOpacity={0.28} />
              <stop offset="100%" stopColor={S1} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" {...AXIS} minTickGap={24} />
          <YAxis allowDecimals={false} {...AXIS} width={36} />
          <Tooltip cursor={{ stroke: 'var(--line-strong)' }} contentStyle={TOOLTIP_STYLE} />
          <Area
            type="monotone"
            dataKey="count"
            name="Applications"
            stroke={S1}
            strokeWidth={2}
            fill="url(#over-time-fill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}
