import { createI18n } from 'vue-i18n'

import de from '@/locales/de.json'
import en from '@/locales/en.json'

const STORAGE_KEY = 'apt-locale'

export type Locale = 'de' | 'en'

function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'de' || stored === 'en') return stored
  // German-speaking visitors are the primary audience, so German is the default
  // for anything that is not explicitly an English browser.
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'de'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'de',
  messages: { de, en },
})

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale
}
