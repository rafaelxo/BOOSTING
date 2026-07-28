// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClashConfigPicker } from './ClashConfigPicker'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'

function renderPicker() {
  useOrderBuilderStore.getState().reset()
  useOrderBuilderStore.getState().setService('clash', 'clash')
  return render(<ClashConfigPicker />)
}

describe('ClashConfigPicker', () => {
  beforeEach(() => {
    useOrderBuilderStore.getState().reset()
  })

  it('inicia em Solo Clash, sem tier/dia selecionado', () => {
    renderPicker()
    const state = useOrderBuilderStore.getState()
    expect(state.boostMode).toBe('solo')
    expect(state.clashTier).toBeNull()
    expect(state.clashDay).toBeNull()
    expect(state.basePrice).toBe(0)
  })

  it('clicar em Duo Clash muda a modalidade e recalcula o preço do tier já selecionado', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(screen.getByRole('button', { name: /Tier 4/ }))
    expect(useOrderBuilderStore.getState().clashTier).toBe('tier_4')
    expect(useOrderBuilderStore.getState().basePrice).toBe(20) // solo tier_4 = R$20,00 (2000 centavos)

    await user.click(screen.getByRole('button', { name: /Duo Clash/ }))
    expect(useOrderBuilderStore.getState().boostMode).toBe('duo')
    expect(useOrderBuilderStore.getState().basePrice).toBe(59.9) // duo tier_4 = R$59,90 (5990 centavos)
  })

  it('selecionar um tier seta a hora estimada fixa do Clash (nunca null com tier escolhido)', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(screen.getByRole('button', { name: /Tier 1/ }))
    expect(useOrderBuilderStore.getState().clashTier).toBe('tier_1')
    expect(useOrderBuilderStore.getState().estimatedHours).toBe(4)
    expect(useOrderBuilderStore.getState().pdlModifierPct).toBeNull()
  })

  it('clicar num dia seta clashDay', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Domingo' }))
    expect(useOrderBuilderStore.getState().clashDay).toBe('sunday')
  })

  it('sem stepAttempted, não mostra erro de validação mesmo faltando tier/dia', () => {
    renderPicker()
    expect(screen.queryByText('Selecione um tier')).not.toBeInTheDocument()
    expect(screen.queryByText('Selecione um dia')).not.toBeInTheDocument()
  })

  it('com stepAttempted e nada selecionado, mostra os dois erros de validação', () => {
    useOrderBuilderStore.getState().reset()
    useOrderBuilderStore.getState().setService('clash', 'clash')
    useOrderBuilderStore.getState().setStepAttempted(true)
    render(<ClashConfigPicker />)

    expect(screen.getByText('Selecione um tier')).toBeInTheDocument()
    expect(screen.getByText('Selecione um dia')).toBeInTheDocument()
  })
})
