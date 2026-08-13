import { useCallback, useRef } from 'react'

const VOICE_PHRASES: Record<string, string> = {
  front:   'Lihat lurus ke kamera',
  left:    'Putar kepala ke kiri',
  right:   'Putar kepala ke kanan',
  done:    'Rekaman wajah selesai. Bagus sekali.',
  ready:   'Bersiap',
}

export function useVoiceGuide() {
  const enabledRef = useRef(true)

  const speak = useCallback((text: string, delayMs = 0) => {
    if (!enabledRef.current) return
    const synth = window.speechSynthesis
    if (!synth) return
    const go = () => {
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang   = 'id-ID'
      u.rate   = 0.9
      u.pitch  = 1.05
      u.volume = 1
      synth.speak(u)
    }
    if (delayMs > 0) setTimeout(go, delayMs)
    else go()
  }, [])

  const announcePhase = useCallback((phase: 'front' | 'left' | 'right') => {
    speak(VOICE_PHRASES[phase])
  }, [speak])

  const announceCountdown = useCallback((n: number) => {
    if (n > 0) speak(String(n))
  }, [speak])

  const announceDone = useCallback(() => {
    speak(VOICE_PHRASES.done)
  }, [speak])

  const setEnabled = useCallback((v: boolean) => { enabledRef.current = v }, [])

  return { speak, announcePhase, announceCountdown, announceDone, setEnabled }
}
