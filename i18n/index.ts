import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import hi from './locales/hi.json';
import as_ from './locales/as.json';
import gu from './locales/gu.json';
import bn from './locales/bn.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English', script: 'Latin' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', script: 'Devanagari' },
  { code: 'as', label: 'Assamese', nativeLabel: 'অসমীয়া', script: 'Bengali' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી', script: 'Gujarati' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', script: 'Bengali' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      as: { translation: as_ },
      gu: { translation: gu },
      bn: { translation: bn },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already handles XSS
    },
    detection: {
      // Check localStorage first, then browser language
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'voltwise-language',
      caches: ['localStorage'],
    },
    // Return key if translation missing (prevents blank UI)
    returnNull: false,
    returnEmptyString: false,
  });

export default i18n;
