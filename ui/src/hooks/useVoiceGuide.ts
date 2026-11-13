import { useCallback, useRef } from 'react'
import { t, useI18nStore, type Locale } from '@/store/i18nStore'

// Speech-synthesis voice per UI language, so text is read with a matching accent.
const SPEECH_LANG: Record<Locale, string> = { id: 'id-ID', en: 'en-US' }

export function useVoiceGuide() {
  const enabledRef = useRef(true)

  const speak = useCallback((text: string, delayMs = 0) => {
    if (!enabledRef.current) return
    const synth = window.speechSynthesis
    if (!synth) return
    const go = () => {
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang   = SPEECH_LANG[useI18nStore.getState().locale] ?? 'id-ID'
      u.rate   = 0.9
      u.pitch  = 1.05
      u.volume = 1
      synth.speak(u)
    }
    if (delayMs > 0) setTimeout(go, delayMs)
    else go()
  }, [])

  const announcePhase = useCallback((phase: 'front' | 'left' | 'right') => {
    speak(t(`voice.${phase}`))
  }, [speak])

  const announceCountdown = useCallback((n: number) => {
    if (n > 0) speak(String(n))
  }, [speak])

  const announceDone = useCallback(() => {
    speak(t('voice.done'))
  }, [speak])

  const setEnabled = useCallback((v: boolean) => { enabledRef.current = v }, [])

  return { speak, announcePhase, announceCountdown, announceDone, setEnabled }
}
