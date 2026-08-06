import { useI18n } from '@/store/i18nStore'
import '@/styles/charts.css'

export interface DonutSlice {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutSlice[]
  /** Label shown under the centered total (e.g. "Total") */
  centerLabel?: string
  /** Override the centered number; defaults to the sum of all values */
  centerValue?: number
  size?: number
  thickness?: number
}

/**
 * Inline-SVG donut chart for status breakdowns (hadir/terlambat/belum/pulang).
 * Responsive: the SVG scales to its wrapper; legend wraps below on narrow widths.
 */
export function DonutChart({
  data,
  centerLabel = 'Total',
  centerValue,
  size = 160,
  thickness = 18,
}: DonutChartProps) {
  const { t } = useI18n()
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  // Build cumulative offsets for each segment.
  let offset = 0
  const segments = data.map((d) => {
    const fraction = total > 0 ? d.value / total : 0
    const seg = {
      ...d,
      dash: fraction * circumference,
      gap: circumference - fraction * circumference,
      dashOffset: -offset,
    }
    offset += fraction * circumference
    return seg
  })

  const displayValue = centerValue ?? total

  if (total === 0) {
    return (
      <div className="donut-chart">
        <div className="donut-chart__svg-wrap" style={{ width: size, height: size }}>
          <svg className="donut-chart__svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t('donut.no_data_label')}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={thickness}
            />
          </svg>
          <div className="donut-chart__center">
            <span className="donut-chart__total">0</span>
            <span className="donut-chart__total-label">{centerLabel}</span>
          </div>
        </div>
        <div className="donut-chart__empty">{t('donut.no_data')}</div>
      </div>
    )
  }

  return (
    <div className="donut-chart">
      <div className="donut-chart__svg-wrap" style={{ width: size, height: size }}>
        <svg
          className="donut-chart__svg"
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={t('donut.chart_label', { total })}
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={thickness}
          />
          {segments.map((s) =>
            s.value > 0 ? (
              <circle
                key={s.label}
                className="donut-chart__seg"
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={`${s.dash} ${s.gap}`}
                strokeDashoffset={s.dashOffset}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            ) : null,
          )}
        </svg>
        <div className="donut-chart__center">
          <span className="donut-chart__total">{displayValue}</span>
          <span className="donut-chart__total-label">{centerLabel}</span>
        </div>
      </div>

      <ul className="donut-chart__legend">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return (
            <li key={d.label} className="donut-chart__legend-row">
              <span className="donut-chart__dot" style={{ background: d.color }} />
              <span className="donut-chart__legend-label">{d.label}</span>
              <span className="donut-chart__legend-value">{d.value}</span>
              <span className="donut-chart__legend-pct">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
