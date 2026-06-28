import type { CSSProperties } from 'react'
import '@/styles/charts.css'

export interface HeatmapDay {
  /** ISO date YYYY-MM-DD */
  date: string
  count: number
}

interface AttendanceHeatmapProps {
  /** Daily counts; any month days not present are treated as 0. */
  data: HeatmapDay[]
  /** Month to render (any date within it). Defaults to current month. */
  month?: Date
}

const DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

/** Monday-first weekday index (0 = Mon ... 6 = Sun). */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

/**
 * Month-grid heatmap. Cell color intensity scales with the attendance count
 * for that day. Days outside the month render as blank placeholders to keep
 * the calendar aligned. Gracefully handles an empty data array.
 */
export function AttendanceHeatmap({ data, month = new Date() }: AttendanceHeatmapProps) {
  const year = month.getFullYear()
  const mon = month.getMonth()

  const counts = new Map<string, number>()
  for (const d of data) counts.set(d.date, d.count)

  const maxCount = data.reduce((m, d) => Math.max(m, d.count), 0)

  const daysInMonth = new Date(year, mon + 1, 0).getDate()
  const firstDay = new Date(year, mon, 1)
  const leadingBlanks = mondayIndex(firstDay)

  type Cell = { key: string; day: number | null; count: number; iso: string }
  const cells: Cell[] = []
  for (let i = 0; i < leadingBlanks; i++) {
    cells.push({ key: `blank-${i}`, day: null, count: 0, iso: '' })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ key: iso, day, count: counts.get(iso) ?? 0, iso })
  }

  function cellStyle(count: number): CSSProperties {
    if (count <= 0) return {}
    // Intensity 0.25 → 1.0 mapped onto the brand color via rgba.
    const intensity = maxCount > 0 ? 0.25 + 0.75 * (count / maxCount) : 0.25
    return { background: `rgba(13, 148, 136, ${intensity.toFixed(2)})` }
  }

  const monthLabel = firstDay.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

  return (
    <div className="heatmap">
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{monthLabel}</div>
      <div className="heatmap__grid" role="grid" aria-label={`Heatmap kehadiran ${monthLabel}`}>
        {DOW.map((d) => (
          <div key={d} className="heatmap__dow">
            {d}
          </div>
        ))}
        {cells.map((c) => {
          if (c.day === null) {
            return <div key={c.key} className="heatmap__cell heatmap__cell--blank" />
          }
          const filled = c.count > 0
          return (
            <div
              key={c.key}
              className={`heatmap__cell ${filled ? 'heatmap__cell--filled' : 'heatmap__cell--empty'}`}
              style={cellStyle(c.count)}
              title={`${c.iso}: ${c.count} kehadiran`}
              role="gridcell"
              aria-label={`${c.iso}: ${c.count} kehadiran`}
            >
              {c.day}
            </div>
          )
        })}
      </div>
      <div className="heatmap__legend">
        <span>Sedikit</span>
        <span className="heatmap__legend-swatch heatmap__cell--empty" />
        <span className="heatmap__legend-swatch" style={{ background: 'rgba(13, 148, 136, 0.45)' }} />
        <span className="heatmap__legend-swatch" style={{ background: 'rgba(13, 148, 136, 0.75)' }} />
        <span className="heatmap__legend-swatch" style={{ background: 'rgba(13, 148, 136, 1)' }} />
        <span>Banyak</span>
      </div>
    </div>
  )
}
