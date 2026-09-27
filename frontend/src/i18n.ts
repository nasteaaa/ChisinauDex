import i18n, { type BackendModule } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import ro from './locales/ro.json'

export const languages = ['ro', 'ru', 'en'] as const

// Romanian ships with the app; Russian and English are separate files, downloaded only when used.
const lazyLocales: BackendModule = {
  type: 'backend',
  init() {},
  read(lng, _ns, done) {
    import(`./locales/${lng}.json`).then((m: { default: object }) => done(null, m.default)).catch((err: Error) => done(err, false))
  }
}

// https://react.i18next.com/latest/using-with-hooks
i18n
  .use(lazyLocales)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ro: { translation: ro } },
    partialBundledLanguages: true,
    supportedLngs: languages,
    fallbackLng: 'ro',
    interpolation: { escapeValue: false } // React already escapes
  })

// WCAG 3.1.1: keep <html lang> in sync so screen readers pick the right voice.
const syncLang = (lng: string) => { document.documentElement.lang = lng }
syncLang(i18n.resolvedLanguage ?? 'ro')
i18n.on('languageChanged', syncLang)

export default i18n
