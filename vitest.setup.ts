// Testes rodam com `environment: 'node'` (ver vitest.config.ts) -- Node não
// tem localStorage/sessionStorage reais como um browser. A versão
// experimental do Node exige um --localstorage-file pra localStorage
// funcionar (sem ela, .setItem lança), e depender disso deixaria os testes
// reféns de uma flag experimental do runtime. Polyfill simples em memória,
// suficiente para o que o middleware `persist` do Zustand precisa
// (getItem/setItem/removeItem) em orderBuilderStore.ts.
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), writable: true, configurable: true })
Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), writable: true, configurable: true })
