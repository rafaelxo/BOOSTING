import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

const LANGS = [
  { code: 'pt-BR', flag: '🇧🇷', label: 'PT' },
  { code: 'en',    flag: '🇺🇸', label: 'EN' },
]

export function LanguageToggle() {
  const { i18n } = useTranslation()
  const current = i18n.language.startsWith('pt') ? 'pt-BR' : 'en'

  function change(code: string) {
    i18n.changeLanguage(code)
    localStorage.setItem('eloboost_lang', code)
  }

  return (
    <div className="flex items-center gap-0.5 bg-bg-elevated rounded-lg p-0.5">
      {LANGS.map(({ code, flag, label }) => (
        <button
          key={code}
          onClick={() => change(code)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors',
            current === code
              ? 'bg-bg-card text-ink shadow-sm'
              : 'text-ink-muted hover:text-ink-secondary'
          )}
        >
          <span>{flag}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
