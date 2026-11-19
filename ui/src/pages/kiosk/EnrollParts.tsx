import type { ReactNode, RefObject } from 'react'
import { Check, Eye } from 'lucide-react'

/** Shared visual pieces for self-enrolment (phone) and the embedded enrol widget (mockup cbafa81a). */

type Angle = 'front' | 'left' | 'right'
const ANGLES: Angle[] = ['front', 'left', 'right']

export function EnrollBrand({ title }: { title: string }) {
  return (
    <div className="se-brand">
      <span className="se-brand-logo" aria-hidden="true"><Eye size={15} strokeWidth={2.6} /></span>
      <span className="se-brand-name">{title}</span>
    </div>
  )
}

export function EnrollSteps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <ol className="se-steps">
      {labels.map((label, i) => (
        <li key={label} className={`se-step ${i <= current ? 'is-done' : ''} ${i === current ? 'is-current' : ''}`}
          aria-current={i === current ? 'step' : undefined}>
          <span className="se-step-bar" />
          <span className="se-step-label">{i + 1}. {label}</span>
        </li>
      ))}
    </ol>
  )
}

interface CameraProps {
  videoRef: RefObject<HTMLVideoElement>
  overlayRef: RefObject<HTMLCanvasElement>
  /** Render the <video> element (stream attaches to it). */
  showVideo: boolean
  /** Camera is streaming and capture is not in preview — show detection + guide ring. */
  guiding: boolean
  hasFace: boolean
  /** Big instruction at the bottom of the frame. */
  instruction?: ReactNode
  hint?: string
  countdown?: number
  progressPct?: number
  placeholder?: ReactNode
  compact?: boolean
}

export function EnrollCamera({
  videoRef, overlayRef, showVideo, guiding, hasFace, instruction, hint, countdown, progressPct, placeholder, compact,
}: CameraProps) {
  return (
    <div className={`se-cam ${compact ? 'se-cam--compact' : ''}`}>
      {showVideo && <video ref={videoRef} className="se-cam-video" autoPlay playsInline muted />}
      {showVideo && guiding && <canvas ref={overlayRef} className="se-cam-overlay" />}
      {!showVideo && placeholder && <div className="se-cam-placeholder">{placeholder}</div>}
      {(guiding || !showVideo) && (
        <div className={`se-cam-ring ${guiding && hasFace ? 'is-locked' : ''}`} aria-hidden="true" />
      )}
      {instruction && (
        <div className="se-cam-caption" aria-live="polite">
          <div className="se-cam-instruction">{instruction}</div>
          {hint && <div className="se-cam-hint">{hint}</div>}
          {progressPct !== undefined && countdown !== undefined && (
            <div className="se-cam-count">
              <span className="se-cam-count-bar"><span style={{ width: `${progressPct}%` }} /></span>
              <span className="se-cam-count-num">{countdown}s</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Depan / Kiri / Kanan chips: green with a check once captured, outlined brand while active. */
export function AngleChips({ labels, phaseIdx, allDone }: { labels: Record<Angle, string>; phaseIdx: number; allDone: boolean }) {
  return (
    <div className="se-angles">
      {ANGLES.map((a, i) => {
        const done = allDone || phaseIdx > i
        const active = !done && phaseIdx === i
        return (
          <span key={a} className={`se-angle ${done ? 'is-done' : active ? 'is-active' : ''}`}>
            {done && <Check size={13} strokeWidth={3} aria-hidden="true" />}
            {labels[a]}
          </span>
        )
      })}
    </div>
  )
}

export function EnrollPreviews({ urls, labels }: { urls: string[]; labels: string[] }) {
  return (
    <div className="se-previews">
      {urls.map((url, i) => (
        <figure key={url} className="se-preview">
          <img src={url} alt={labels[i]} />
          <figcaption>{labels[i]}</figcaption>
        </figure>
      ))}
    </div>
  )
}

export function EnrollResult({ tone, icon, title, text, children }: {
  tone: 'ok' | 'bad'
  icon: ReactNode
  title: string
  text?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="se-result" role={tone === 'bad' ? 'alert' : 'status'} aria-live="assertive">
      <span className={`se-result-icon ${tone}`} aria-hidden="true">{icon}</span>
      <div className="se-result-title">{title}</div>
      {text && <div className="se-result-text">{text}</div>}
      {children}
    </div>
  )
}
