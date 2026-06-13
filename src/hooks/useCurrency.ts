import { useTranslation } from 'react-i18next'

export function useCurrency() {
  const { i18n } = useTranslation()
  const isBRL = i18n.language.startsWith('pt')
  return (amount: number) =>
    new Intl.NumberFormat(isBRL ? 'pt-BR' : 'en-US', {
      style: 'currency',
      currency: isBRL ? 'BRL' : 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
}
