import { describe, it, expect, beforeEach } from 'vitest'
import { useOrderBuilderStore } from './orderBuilderStore'

describe('orderBuilderStore — MD5 quantity ceiling', () => {
  beforeEach(() => useOrderBuilderStore.getState().reset())

  it('detecting 3 remaining placements selects 3 and blocks 4/5', () => {
    const { setIsMd5, setMd5MatchesRemainingFromApi, setWinsPurchased } = useOrderBuilderStore.getState()
    setIsMd5(true)
    setMd5MatchesRemainingFromApi(3)
    expect(useOrderBuilderStore.getState().winsPurchased).toBe(3)
    expect(useOrderBuilderStore.getState().md5MatchesRemainingCeiling).toBe(3)

    setWinsPurchased(5)
    expect(useOrderBuilderStore.getState().winsPurchased).toBe(3) // clamped, not 5
  })

  it('common Vitórias (non-MD5) caps at 5, defaults to 5', () => {
    const { setService, setWinsPurchased } = useOrderBuilderStore.getState()
    setService('win_boost', 'win_boost')
    expect(useOrderBuilderStore.getState().winsPurchased).toBe(5)
    setWinsPurchased(9)
    expect(useOrderBuilderStore.getState().winsPurchased).toBe(5)
  })

  it('toggling MD5 off clears the ceiling and re-allows up to 5', () => {
    const { setIsMd5, setMd5MatchesRemainingFromApi, setWinsPurchased } = useOrderBuilderStore.getState()
    setIsMd5(true)
    setMd5MatchesRemainingFromApi(2)
    setIsMd5(false)
    expect(useOrderBuilderStore.getState().md5MatchesRemaining).toBeNull()
    setWinsPurchased(5)
    expect(useOrderBuilderStore.getState().winsPurchased).toBe(5)
  })
})
