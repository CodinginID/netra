import { useCallback, useEffect, useRef, useState } from 'react'

export interface CapturePhaseConfig {
  label: string
  hint: string
  arrow?: string
  duration: number
}

export type GuidedCapturePhase = 'front' | 'left' | 'right' | 'preview'

export const GUIDED_CAPTURE_PHASE_ORDER: Exclude<GuidedCapturePhase, 'preview'>[] = ['front', 'left', 'right']

interface UseGuidedCaptureArgs {
  /** Sequence auto-starts (after a short delay) once true, unless a capture is already in progress or done. */
  active: boolean
  phases: Record<Exclude<GuidedCapturePhase, 'preview'>, CapturePhaseConfig>
  captureFrame: () => Promise<Blob | null>
}

interface UseGuidedCaptureResult {
  capturePhase: GuidedCapturePhase | null
  countdown: number
  capturedBlobs: Blob[]
  previewUrls: string[]
  phaseIdx: number
  phaseConfig: CapturePhaseConfig | null
  progressPct: number
  retake: () => void
}

/** Guided multi-angle face capture: front -> left -> right, each on a fixed countdown, then preview. */
export function useGuidedCapture({ active, phases, captureFrame }: UseGuidedCaptureArgs): UseGuidedCaptureResult {
  const [capturePhase, setCapturePhase] = useState<GuidedCapturePhase | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [capturedBlobs, setCapturedBlobs] = useState<Blob[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  const captureFrameRef = useRef(captureFrame)
  captureFrameRef.current = captureFrame

  const runSequence = useCallback(async () => {
    const blobs: Blob[] = []
    const urls: string[] = []

    for (const phase of GUIDED_CAPTURE_PHASE_ORDER) {
      const { duration } = phases[phase]
      setCapturePhase(phase)

      await new Promise<void>((resolve) => {
        let remaining = duration
        setCountdown(remaining)
        const id = setInterval(() => {
          remaining -= 1
          setCountdown(remaining)
          if (remaining <= 0) {
            clearInterval(id)
            resolve()
          }
        }, 1000)
      })

      const blob = await captureFrameRef.current()
      if (!blob) continue
      blobs.push(blob)
      urls.push(URL.createObjectURL(blob))
    }

    setCapturedBlobs(blobs)
    setPreviewUrls(urls)
    setCapturePhase('preview')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases])

  // Auto-start 1.2s after `active` flips true, unless a sequence already ran/is running.
  useEffect(() => {
    if (!active || capturePhase !== null) return
    const t = setTimeout(() => { void runSequence() }, 1200)
    return () => clearTimeout(t)
  }, [active, capturePhase, runSequence])

  // Revoke any outstanding object URLs on unmount only.
  const previewUrlsRef = useRef(previewUrls)
  previewUrlsRef.current = previewUrls
  useEffect(() => {
    return () => { previewUrlsRef.current.forEach(URL.revokeObjectURL) }
  }, [])

  const retake = useCallback(() => {
    previewUrls.forEach(URL.revokeObjectURL)
    setCapturedBlobs([])
    setPreviewUrls([])
    setCapturePhase(null)
  }, [previewUrls])

  const phaseIdx = capturePhase && capturePhase !== 'preview' ? GUIDED_CAPTURE_PHASE_ORDER.indexOf(capturePhase) : -1
  const phaseConfig = capturePhase && capturePhase !== 'preview' ? phases[capturePhase] : null
  const progressPct = phaseConfig ? (1 - countdown / phaseConfig.duration) * 100 : 0

  return { capturePhase, countdown, capturedBlobs, previewUrls, phaseIdx, phaseConfig, progressPct, retake }
}
