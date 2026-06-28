import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import id from '@/locales/id.json'
import en from '@/locales/en.json'

export type Locale = 'id' | 'en'

const dictionaries: Record<Locale, Record<string, string>> = { id, en }

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'id',
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'netra-i18n',
    }
  )
)

/**
 * Resolve a dot-separated key against the current locale dictionary.
 * Supports `{{var}}` interpolation via an optional second arg.
 * Falls back to the key itself if missing.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const locale = useI18nStore.getState().locale
  const dict = dictionaries[locale] ?? dictionaries.id
  let value = dict[key] ?? key

  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      value = value.split(`{{${k}}}`).join(String(v))
    })
  }
  return value
}

/** Hook that returns `{ t, locale, setLocale }` for component use. */
export function useI18n() {
  const locale = useI18nStore((s) => s.locale)
  const setLocale = useI18nStore((s) => s.setLocale)

  const translate = (key: string, vars?: Record<string, string | number>) => {
    const dict = dictionaries[locale] ?? dictionaries.id
    let value = dict[key] ?? key
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        value = value.split(`{{${k}}}`).join(String(v))
      })
    }
    return value
  }

  return { t: translate, locale, setLocale }
}
