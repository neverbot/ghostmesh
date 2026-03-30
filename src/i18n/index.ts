import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import es from './locales/es.json';

const AVAILABLE_LOCALES = ['en', 'es'];
const STORAGE_KEY = 'ghostmesh:locale';

/** Detect the best locale: stored preference → browser language → English fallback. */
function detectLocale(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && AVAILABLE_LOCALES.includes(stored)) return stored;

  for (const lang of navigator.languages || [navigator.language]) {
    const code = lang.split('-')[0];
    if (AVAILABLE_LOCALES.includes(code)) return code;
  }

  return 'en';
}

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en, es },
});

/** Switch the active locale and persist the choice. */
function setLocale(locale: string): void {
  if (!AVAILABLE_LOCALES.includes(locale)) return;
  i18n.global.locale.value = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
}

// Set the html lang attribute on load
document.documentElement.lang = i18n.global.locale.value;

export { i18n, setLocale, AVAILABLE_LOCALES, STORAGE_KEY };
