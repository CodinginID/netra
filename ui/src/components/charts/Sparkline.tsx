import '@/styles/charts.css'

interface SparklineProps {
  data: number[]
  /** Stroke / fill accent. Defaults to the brand color. */
  color?: string
  width?: number
  height?: number
  showDot?: boolean
}

/**
 * Tiny inline-SVG trend line for stat cards (7-day trend). Renders nothing
 * meaningful for empty/flat data but never crashes.
 */
export function Sparkline({
  data,
  color = 'var(--color-brand)',
  width = 100,
  height = 28,
  showDot = true,
}: SparklineProps) {
  if (!data || data.length === 0) {
    return null
  }

  const pad = 2
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const n = data.length

  const xFor = (i: number) =>
    n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2)
  const yFor = (v: number) =>
    height - pad - ((v - min) / range) * (height - pad * 2)

  const points = data.map((v, i) => [xFor(i), yFor(v)] as const)
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${xFor(n - 1).toFixed(1)},${height} L${xFor(0).toFixed(1)},${height} Z`

  const last = points[points.length - 1]

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Tren 7 hari"
      style={{ width, maxWidth: '100%' }}
    >
      <path className="sparkline__area" d={areaPath} fill={color} />
      <path className="sparkline__line" d={linePath} stroke={color} />
      {showDot && (
        <circle className="sparkline__dot" cx={last[0]} cy={last[1]} r={2.5} fill={color} />
      )}
    </svg>
  )
}
