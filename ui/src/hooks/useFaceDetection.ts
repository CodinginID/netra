import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

// Singleton — shared across re-mounts so model loads only once per page session
let detectorPromise: Promise<unknown> | null = null

async function getDetector(): Promise<unknown> {
  if (detectorPromise) return detectorPromise
  detectorPromise = (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
    return FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
      minSuppressionThreshold: 0.3,
    })
  })().catch((err) => {
    console.warn('[FaceDetector] load failed — detection disabled:', err)
    detectorPromise = null
    return null
  })
  return detectorPromise
}

interface BBox { originX: number; originY: number; width: number; height: number }
interface Keypoint { x: number; y: number }
interface Detection { boundingBox?: BBox; keypoints?: Keypoint[]; categories?: { score: number }[] }

function draw(ctx: CanvasRenderingContext2D, detections: Detection[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h)
  for (const det of detections) {
    if (!det.boundingBox) continue
    const { originX, originY, width: bw, height: bh } = det.boundingBox
    const pad = 18
    const x  = Math.max(0, originX - pad)
    const y  = Math.max(0, originY - pad)
    const rw = Math.min(w - x, bw + pad * 2)
    const rh = Math.min(h - y, bh + pad * 2)
    const cs = 22 // corner arm length

    // Subtle rect fill
    ctx.fillStyle = 'rgba(107,216,203,0.04)'
    ctx.fillRect(x, y, rw, rh)

    // Rect border
    ctx.strokeStyle = 'rgba(107,216,203,0.45)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, rw, rh)

    // Corner brackets
    ctx.strokeStyle = 'rgba(107,216,203,0.95)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    const corners: [number, number, number, number, number, number][] = [
      [x,      y + cs, x,      y,      x + cs, y     ],
      [x+rw-cs,y,      x+rw,   y,      x+rw,   y+cs  ],
      [x,      y+rh-cs,x,      y+rh,   x+cs,   y+rh  ],
      [x+rw-cs,y+rh,   x+rw,   y+rh,   x+rw,   y+rh-cs],
    ]
    for (const [ax, ay, bx, by, cx, cy] of corners) {
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.lineTo(cx, cy)
      ctx.stroke()
    }

    // Landmark dots (eyes, nose, mouth corners, ears)
    ctx.fillStyle = 'rgba(107,216,203,0.9)'
    for (const kp of det.keypoints ?? []) {
      ctx.beginPath()
      ctx.arc(kp.x * w, kp.y * h, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Score badge
    const score = Math.round((det.categories?.[0]?.score ?? 0) * 100)
    const label = `${score}%`
    ctx.font = '600 11px system-ui'
    const tw = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(13,148,136,0.88)'
    ctx.fillRect(x, y - 22, tw + 12, 20)
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + 6, y - 12)
  }
}

export function useFaceDetection(
  videoRef: RefObject<HTMLVideoElement>,
  overlayRef: RefObject<HTMLCanvasElement>,
  active: boolean,
): { hasFace: boolean; detectorReady: boolean } {
  const rafRef      = useRef(0)
  const [hasFace, setHasFace]           = useState(false)
  const [detectorReady, setDetectorReady] = useState(false)
  const hadFaceRef  = useRef(false)

  useEffect(() => {
    const canvas = overlayRef.current
    if (!active) {
      cancelAnimationFrame(rafRef.current)
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      if (hadFaceRef.current) { hadFaceRef.current = false; setHasFace(false) }
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let detector: any = null
    let cancelled = false

    void getDetector().then((d) => {
      if (!cancelled) {
        detector = d
        if (d) setDetectorReady(true)
      }
    })

    function loop(ts: number) {
      if (cancelled) return
      rafRef.current = requestAnimationFrame(loop)

      const video  = videoRef.current
      const canvas = overlayRef.current
      if (!video || !canvas || !detector || video.readyState < 2) return

      const vw = video.videoWidth  || 640
      const vh = video.videoHeight || 480
      if (canvas.width !== vw)  canvas.width  = vw
      if (canvas.height !== vh) canvas.height = vh

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (detector as any).detectForVideo(video, ts) as { detections: Detection[] }
        const ctx = canvas.getContext('2d')
        if (ctx) draw(ctx, result.detections ?? [], vw, vh)

        const now = (result.detections ?? []).length > 0
        if (now !== hadFaceRef.current) {
          hadFaceRef.current = now
          setHasFace(now)
        }
      } catch {
        // non-fatal; GPU context loss, etc.
      }
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [active, videoRef, overlayRef])

  return { hasFace, detectorReady }
}
