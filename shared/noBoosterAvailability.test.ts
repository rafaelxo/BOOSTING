import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Verificação estática: o conceito de booster "disponível/indisponível" foi
// removido (badge, coluna crua, view derivada) em favor de "visto por
// último" (last_active_at via formatLastSeen()). Este teste garante que o
// campo/rótulo não volta a aparecer escondido em algum arquivo tocado pela
// reforma — não substitui rodar a seleção de boosters de verdade.
const root = join(__dirname, '..')

function read(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf-8')
}

const BOOSTER_FACING_FILES = [
  'src/types/index.ts',
  'src/lib/database.types.ts',
  'src/features/public/pages/BoostersPage.tsx',
  'src/features/public/pages/BoosterPublicProfilePage.tsx',
  'src/features/public/pages/HomePage.tsx',
  'src/features/admin/pages/BoosterDetail.tsx',
  'src/api/boosters/hooks.ts',
  'src/components/ui/Avatar.tsx',
  'src/components/UserAccountBadge.tsx',
]

describe('Ausência do conceito de disponibilidade manual/binária de booster', () => {
  for (const file of BOOSTER_FACING_FILES) {
    it(`${file} não referencia is_available/isBoosterOnline nem rótulo Disponível/Indisponível`, () => {
      const content = read(file)
      expect(content).not.toContain('is_available')
      expect(content).not.toContain('isBoosterOnline')
      expect(content.toLowerCase()).not.toMatch(/isponível/)
    })
  }
})
