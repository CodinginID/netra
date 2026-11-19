import { useEffect, useState } from 'react'
import { Camera, CameraOff, Eye, Settings, ShieldAlert, Volume2, VolumeX, WifiOff, XCircle } from 'lucide-react'
import type { AttendanceResult } from '@/api/kioskApi'
import { useI18n } from '@/store/i18nStore'

type T = (key: string, vars?: Record<string, string | number>) => string

export type KioskErrorCode = 'not_recognized' | 'liveness_failed' | 'duplicate' | 'server_error'
export type RingTone = 'idle' | 'face' | 'busy' | 'ok' | 'warn' | 'bad'

const dateLocale = (locale: string) => (locale === 'en' ? 'en-GB' : 'id-ID')

/** Wall clock for the kiosk header — HH:MM plus the long date, ticking every second. */
export function useKioskClock() {
  const { locale } = useI18n()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const loc = dateLocale(locale)
  return {
    time: now.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

function greetingKey(hour: number): string {
  if (hour < 11) return 'kiosk.greet_morning'
  if (hour < 15) return 'kiosk.greet_day'
  if (hour < 19) return 'kiosk.greet_afternoon'
  return 'kiosk.greet_evening'
}

/** Ring colour around the face guide follows the result: green on time, amber late, red rejected. */
export function ringToneFor(result: AttendanceResult | undefined, status: string, hasFace: boolean): RingTone {
  if (status === 'processing') return 'busy'
  if (status === 'error') return 'bad'
  if (status === 'success' && result) return result.attendance.status === 'on_time' ? 'ok' : 'warn'
  return hasFace ? 'face' : 'idle'
}

export function KioskTopBar({ time, date, onSetup, t }: { time: string; date: string; onSetup: () => void; t: T }) {
  return (
    <header className="kiosk-top">
      <div className="kiosk-top-brand">
        <span className="kiosk-top-logo" aria-hidden="true"><Eye size={22} strokeWidth={2.4} /></span>
        <div>
          <div className="kiosk-top-name">Netra</div>
          <div className="kiosk-top-sub">{t('kiosk.subtitle')}</div>
        </div>
      </div>
      <div className="kiosk-top-right">
        <div className="kiosk-top-clock">
          <div className="kiosk-top-time">{time}</div>
          <div className="kiosk-top-date">{date}</div>
        </div>
        <button type="button" className="kiosk-setup-btn" onClick={onSetup} aria-label={t('kiosk.setup')} title={t('kiosk.setup')}>
          <Settings size={18} />
        </button>
      </div>
    </header>
  )
}

interface SetupProps {
  t: T
  tokenInput: string
  setTokenInput: (v: string) => void
  savedToken: string
  onSave: () => void
  voiceMuted: boolean
  toggleVoice: () => void
}

export function KioskSetupPanel({ t, tokenInput, setTokenInput, savedToken, onSave, voiceMuted, toggleVoice }: SetupProps) {
  return (
    <div className="kiosk-setup-panel" role="dialog" aria-label={t('kiosk.setup_title')}>
      <h3>{t('kiosk.setup_title')}</h3>
      <p>{t('kiosk.setup_desc')}</p>
      <div className="kiosk-token-row">
        <input
          type="text"
          className="kiosk-token-input"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder={t('kiosk.token_placeholder')}
          spellCheck={false}
          aria-label={t('kiosk.setup')}
        />
        <button type="button" className="kiosk-token-save-btn" onClick={onSave}>{t('kiosk.save_token')}</button>
      </div>
      <p className={`kiosk-token-status ${savedToken ? 'ok' : 'missing'}`}>
        {savedToken ? `${t('kiosk.token_active')}: ${savedToken.slice(0, 12)}…` : t('kiosk.no_token_stored')}
      </p>
      <button type="button" className="kiosk-setup-voice" onClick={toggleVoice}
        aria-label={voiceMuted ? t('kiosk.enable_voice') : t('kiosk.disable_voice')}>
        {voiceMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        {voiceMuted ? t('kiosk.voice_off') : t('kiosk.voice_on')}
      </button>
    </div>
  )
}

function Pill({ on, children, onClick, label }: { on: boolean; children: React.ReactNode; onClick?: () => void; label?: string }) {
  const body = <><span className={`kiosk-pill-dot ${on ? 'on' : 'off'}`} />{children}</>
  return onClick
    ? <button type="button" className="kiosk-pill kiosk-pill--btn" onClick={onClick} aria-label={label}>{body}</button>
    : <span className="kiosk-pill">{body}</span>
}

interface PillsProps { t: T; autoScan: boolean; tokenOk: boolean; offline: boolean; voiceMuted: boolean; toggleVoice: () => void }

export function KioskPills({ t, autoScan, tokenOk, offline, voiceMuted, toggleVoice }: PillsProps) {
  return (
    <div className="kiosk-pills">
      <Pill on={autoScan}>{autoScan ? t('kiosk.auto_scan') : t('kiosk.manual_mode')}</Pill>
      <Pill on={tokenOk && !offline}>
        {offline ? t('kiosk.offline_pill') : tokenOk ? t('kiosk.token_active_status') : t('kiosk.no_token_status')}
      </Pill>
      <Pill on={!voiceMuted} onClick={toggleVoice} label={voiceMuted ? t('kiosk.enable_voice') : t('kiosk.disable_voice')}>
        {voiceMuted ? t('kiosk.voice_off') : t('kiosk.voice_on')}
      </Pill>
    </div>
  )
}

export function KioskCameraPlaceholder({ t, state }: { t: T; state: string }) {
  return (
    <div className="kiosk-camera-placeholder">
      {state === 'idle'
        ? <Camera size={44} strokeWidth={1.6} aria-hidden="true" />
        : <CameraOff size={44} strokeWidth={1.6} aria-hidden="true" />}
      <p>
        {state === 'denied' ? t('kiosk.camera_denied')
          : state === 'unavailable' ? t('kiosk.camera_unavailable')
          : t('kiosk.camera_loading')}
      </p>
    </div>
  )
}

export function KioskSuccessCard({ t, result }: { t: T; result: AttendanceResult }) {
  const { locale } = useI18n()
  const at = new Date(result.attendance.occurred_at)
  const time = at.toLocaleTimeString(dateLocale(locale), { hour: '2-digit', minute: '2-digit' })
  const isIn = result.attendance.type === 'check_in'
  const st = result.attendance.status
  const tone = st === 'on_time' ? 'ok' : 'warn'
  const chip = st === 'late' ? t('kiosk.late') : st === 'early_leave' ? t('kiosk.early_leave')
    : isIn ? t('kiosk.on_time') : t('kiosk.chip_recorded')
  const title = isIn ? t(greetingKey(at.getHours()), { name: result.full_name }) : t('kiosk.greet_bye', { name: result.full_name })
  return (
    <div className="kiosk-card" role="alert" aria-live="assertive">
      <span className="kiosk-card-avatar" aria-hidden="true">{initials(result.full_name)}</span>
      <div className="kiosk-card-body">
        <div className="kiosk-card-title">{title}</div>
        <div className="kiosk-card-meta">
          <span className={`kiosk-card-type ${isIn ? 'in' : 'out'}`}>{isIn ? t('kiosk.badge_in') : t('kiosk.badge_out')}</span>
          <span className="kiosk-card-time">{t('kiosk.recorded_at', { time })}</span>
          <span className={`kiosk-card-chip ${tone}`}>{chip}</span>
        </div>
      </div>
    </div>
  )
}

export function KioskRejectCard({ t, code, msg }: { t: T; code?: KioskErrorCode; msg?: string }) {
  const Icon = code === 'liveness_failed' ? ShieldAlert : code === 'server_error' ? WifiOff : XCircle
  const title = code === 'duplicate' ? t('kiosk.rejected_title')
    : code === 'liveness_failed' ? t('kiosk.liveness_title')
    : code === 'not_recognized' ? t('kiosk.not_recognized_title')
    : t('kiosk.failed_title')
  return (
    <div className="kiosk-card kiosk-card--bad" role="alert" aria-live="assertive">
      <span className="kiosk-card-avatar" aria-hidden="true"><Icon size={30} /></span>
      <div className="kiosk-card-body">
        <div className="kiosk-card-title">{title}</div>
        <div className="kiosk-card-meta">
          <span className="kiosk-card-type bad">{code === 'duplicate' ? t('kiosk.badge_rejected') : t('kiosk.badge_failed')}</span>
          {msg && <span className="kiosk-card-msg">{msg}</span>}
        </div>
      </div>
    </div>
  )
}
