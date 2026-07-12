import { useEffect, useRef } from 'react'

/**
 * 3D particle head with a biometric scan sweep, rendered on a plain 2D
 * canvas (no WebGL, no deps). ~620 points on a fibonacci sphere, slightly
 * egg-shaped so it reads as a head. Follows the pointer vertically, pauses
 * while the tab is hidden, and renders a single static frame for
 * prefers-reduced-motion users.
 */
export function FaceOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0
    let H = 0
    let rafId = 0

    function resize() {
      if (!canvas || !ctx) return
      const dpr = window.devicePixelRatio || 1
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = Math.max(1, W * dpr)
      canvas.height = Math.max(1, H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    // Fibonacci sphere point cloud
    const N = 620
    const pts: { x: number; y: number; z: number }[] = []
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const th = i * 2.39996323
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r })
    }

    let rot = 0
    let tilt = 0
    let targetTilt = 0
    let scanY = -1
    let scanDir = 1
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function onPointerMove(e: PointerEvent) {
      if (!canvas) return
      const b = canvas.getBoundingClientRect()
      targetTilt = ((e.clientY - b.top) / b.height - 0.5) * 0.5
    }
    function onPointerLeave() {
      targetTilt = 0
    }

    function draw() {
      if (!ctx) return
      ctx.clearRect(0, 0, W, H)
      const cx = W / 2
      const cy = H / 2
      const R = Math.min(W, H) * 0.36

      const glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.35)
      glow.addColorStop(0, 'rgba(45, 212, 191, 0.10)')
      glow.addColorStop(1, 'rgba(45, 212, 191, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, W, H)

      const cosR = Math.cos(rot)
      const sinR = Math.sin(rot)
      const cosT = Math.cos(tilt)
      const sinT = Math.sin(tilt)

      for (const p of pts) {
        const x = p.x * cosR + p.z * sinR
        const z = -p.x * sinR + p.z * cosR
        const y2 = p.y * cosT - z * sinT
        const z2 = p.y * sinT + z * cosT
        const persp = 1 / (1.65 - z2 * 0.5)
        const sx = cx + x * R * persp * 0.88
        const sy = cy + y2 * R * persp * 1.06
        const depth = (z2 + 1) / 2 // 0 = back, 1 = front
        const nearScan = Math.abs(p.y - scanY) < 0.055
        ctx.beginPath()
        if (nearScan) {
          ctx.fillStyle = `rgba(94, 234, 212, ${(0.55 + 0.45 * depth).toFixed(3)})`
          ctx.arc(sx, sy, 2.1 * (0.5 + depth), 0, Math.PI * 2)
        } else {
          ctx.fillStyle = `rgba(45, 212, 191, ${(0.06 + 0.5 * depth).toFixed(3)})`
          ctx.arc(sx, sy, 1.35 * (0.45 + depth * 0.9), 0, Math.PI * 2)
        }
        ctx.fill()
      }

      // scan ring
      const ry = Math.sqrt(Math.max(0, 1 - scanY * scanY))
      const ringY = cy + scanY * cosT * R * 1.06 * (1 / (1.65 - scanY * sinT * 0.5))
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(94, 234, 212, 0.28)'
      ctx.lineWidth = 1
      ctx.ellipse(cx, ringY, ry * R * 0.88, Math.max(0.01, ry * R * 0.16 * Math.abs(cosT)), 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    function frame() {
      rot += 0.0042
      tilt += (targetTilt - tilt) * 0.06
      scanY += 0.0085 * scanDir
      if (scanY > 1 || scanY < -1) scanDir *= -1
      draw()
      if (!reduced && !document.hidden) rafId = requestAnimationFrame(frame)
    }

    function onVisibility() {
      if (!document.hidden && !reduced) {
        cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(frame)
      }
    }

    const parent = canvas.parentElement
    parent?.addEventListener('pointermove', onPointerMove)
    parent?.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    frame() // reduced-motion users get this single static render

    return () => {
      cancelAnimationFrame(rafId)
      parent?.removeEventListener('pointermove', onPointerMove)
      parent?.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className="lp-orb" role="img" aria-label="Rotating 3D particle head with biometric scan effect" />
}
