/* Penampil mockup: daftar layar di kiri, layar terpilih di kanan dalam bingkai
   Desktop / HP / Tablet. Layar terpilih disimpan di state (dan di #<id> bila
   browser mengizinkan); setiap bingkai adalah iframe srcdoc berisi halaman ini
   sendiri, sehingga media query HP
   berlaku seperti di perangkat asli. Tanpa link #: di iframe srcdoc sebuah link
   # menavigasi ke URL induk dan isinya hilang. */
import { useEffect, useRef, useState } from 'react'
import { DEVICE_SIZE, FRAME_NAME_PREFIX, SCREENS, findScreen, type Device, type Screen } from './screens'
import '@/mockup/mockup.css'

const CANVAS_URL = 'https://claude.ai/artifact/M2ASo2yAwbw8LNa5ZMoKa7'
const GROUPS = [...new Set(SCREENS.map((s) => s.group))]

interface FrameProps { screen: Screen; device: Device; sourceHtml: string }

function DeviceFrame({ screen, device, sourceHtml }: FrameProps) {
  const size = DEVICE_SIZE[device]
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const obs = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / size.w)))
    obs.observe(box)
    return () => obs.disconnect()
  }, [size.w])

  return (
    <figure className="mk-device" style={{ flex: `${size.w} 1 0`, maxWidth: size.w }}>
      <figcaption>{size.label} · {size.w}×{size.h}</figcaption>
      <div ref={boxRef} className={`mk-screen mk-screen--${device}`} style={{ height: size.h * scale }}>
        <iframe
          title={`${screen.title} · ${size.label}`}
          srcDoc={sourceHtml}
          name={`${FRAME_NAME_PREFIX}${screen.id}`}
          style={{ width: size.w, height: size.h, transform: `scale(${scale})` }}
        />
      </div>
    </figure>
  )
}

/** Simpan pilihan di #<id> bila bisa; di srcdoc / origin "null" ini ditolak, abaikan. */
function rememberInHash(id: string): void {
  try {
    window.history.replaceState(null, '', `#${id}`)
  } catch {
    // Preview sandbox: pilihan tetap jalan lewat state, hanya tidak tersimpan di URL.
  }
}

function Viewer({ screen, sourceHtml }: { screen: Screen; sourceHtml: string }) {
  const [hidden, setHidden] = useState<Device[]>([])
  const [reload, setReload] = useState(0)
  const shown = screen.devices.filter((d) => !hidden.includes(d))
  const toggle = (d: Device) => setHidden((h) => (h.includes(d) ? h.filter((x) => x !== d) : [...h, d]))

  return (
    <main className="mk-main">
      <header className="mk-head">
        <div className="mk-head-text">
          <span className="mk-group">{screen.group}</span>
          <h1>{screen.title}</h1>
          <p>{screen.note}</p>
        </div>
        <div className="mk-tools">
          {screen.devices.map((d) => (
            <button key={d} type="button" aria-pressed={!hidden.includes(d)} onClick={() => toggle(d)}>
              {DEVICE_SIZE[d].label}
            </button>
          ))}
          <button type="button" onClick={() => setReload((n) => n + 1)}>Muat ulang</button>
        </div>
      </header>
      <div className="mk-stage">
        {shown.map((d) => <DeviceFrame key={`${screen.id}-${d}-${reload}`} screen={screen} device={d} sourceHtml={sourceHtml} />)}
        {shown.length === 0 && <p className="mk-empty">Pilih minimal satu ukuran layar.</p>}
      </div>
    </main>
  )
}

function Sidebar({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  return (
    <aside className="mk-side">
      <div className="mk-brand">
        <strong>Netra</strong>
        <span>Mockup revamp UI</span>
      </div>
      <nav>
        {GROUPS.map((g) => (
          <section key={g}>
            <h2>{g}</h2>
            {SCREENS.filter((s) => s.group === g).map((s) => (
              <button key={s.id} type="button" className={s.id === current ? 'active' : undefined} onClick={() => onPick(s.id)}>
                {s.title}
              </button>
            ))}
          </section>
        ))}
      </nav>
      <p className="mk-foot">
        Halaman asli aplikasi dengan data contoh; tidak ada data atau sesi yang tersentuh.{' '}
        <a href={CANVAS_URL} target="_blank" rel="noreferrer">Canvas desain ↗</a>
      </p>
    </aside>
  )
}

export function MockupGallery({ sourceHtml }: { sourceHtml: string }) {
  const [id, setId] = useState(() => window.location.hash.slice(1))
  useEffect(() => {
    const onHash = () => setId(window.location.hash.slice(1))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const screen = findScreen(id) ?? SCREENS[0]
  const pick = (next: string) => {
    setId(next)
    rememberInHash(next)
  }
  return (
    <div className="mk">
      <Sidebar current={screen.id} onPick={pick} />
      <Viewer key={screen.id} screen={screen} sourceHtml={sourceHtml} />
    </div>
  )
}
