import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../i18n';

interface LanguageSwitcherProps {
  /** Render as a compact icon button (for headers) or full dropdown (for settings) */
  variant?: 'compact' | 'full';
  className?: string;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ variant = 'compact', className = '' }) => {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (code: LanguageCode) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  if (variant === 'full') {
    // Full list for settings page
    return (
      <div className={`space-y-1 ${className}`}>
        {SUPPORTED_LANGUAGES.map(lang => (
          <button
            key={lang.code}
            onClick={() => handleSelect(lang.code)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
              i18n.language === lang.code
                ? 'bg-cyan-50 border border-cyan-200 text-cyan-700'
                : 'bg-white border border-slate-100 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg flex-shrink-0">{lang.nativeLabel}</span>
              {lang.code !== 'en' && (
                <span className="text-sm text-slate-400 truncate">({lang.label})</span>
              )}
            </div>
            {i18n.language === lang.code && (
              <Check className="w-5 h-5 text-cyan-600 flex-shrink-0" />
            )}
          </button>
        ))}
      </div>
    );
  }

  // Compact dropdown for headers
  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/80 backdrop-blur-sm border border-slate-200 hover:bg-slate-50 transition-all duration-200 shadow-sm"
        aria-label={t('language.title')}
      >
        <Globe className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-semibold text-slate-600 max-w-[60px] truncate">
          {currentLang.nativeLabel}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-[100] overflow-hidden"
          >
            {SUPPORTED_LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors duration-150 ${
                  i18n.language === lang.code
                    ? 'bg-cyan-50 text-cyan-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium flex-shrink-0">{lang.nativeLabel}</span>
                  {lang.code !== 'en' && (
                    <span className="text-xs text-slate-400 truncate">({lang.label})</span>
                  )}
                </div>
                {i18n.language === lang.code && (
                  <Check className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LanguageSwitcher;
