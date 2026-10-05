import { defineConfig } from 'vitest/config'
import path from 'path'

// Config própria dos testes: sem os plugins de React/Tailwind do vite.config.ts,
// que não fazem nada aqui e só deixam a suíte mais lenta.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
