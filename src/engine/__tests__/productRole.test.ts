import { describe, it, expect } from 'vitest'
import { normalizeProductRole, productRoleLabel, PRODUCT_ROLES, PRODUCT_ROLE_LABELS } from '../productRole'

describe('normalizeProductRole', () => {
  it('aceita os códigos do banco', () => {
    for (const id of PRODUCT_ROLES) expect(normalizeProductRole(id)).toBe(id)
  })

  it('aceita os rótulos de tela, com ou sem acento e caixa', () => {
    for (const id of PRODUCT_ROLES) {
      const label = PRODUCT_ROLE_LABELS[id]
      expect(normalizeProductRole(label)).toBe(id)
      expect(normalizeProductRole(label.toUpperCase())).toBe(id)
      expect(normalizeProductRole(label.normalize('NFD').replace(/[̀-ͯ]/g, ''))).toBe(id)
    }
  })

  it.each([
    ['Básicos', 'basico'],
    ['  basico  ', 'basico'],
    ['motor-giro', 'motor_giro'],
    ['Moda', 'motor_giro'],
    ['Alta Moda', 'icone'],
    ['Ícone', 'icone'],
    ['Sustentador', 'sustentador'],
    ['Sustentador de Margem (básico)', 'sustentador'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizeProductRole(entrada)).toBe(esperado)
  })

  it('não confunde palavras parecidas', () => {
    // a versão anterior do importador testava includes("bas") e includes("marca")
    expect(normalizeProductRole('Base')).toBeNull()
    expect(normalizeProductRole('Marca própria')).toBeNull()
  })

  it.each([null, undefined, '', '   ', 'Porta de Entrada', 'P1', 'xyz'])('%s → null', v => {
    expect(normalizeProductRole(v)).toBeNull()
  })
})

describe('productRoleLabel', () => {
  it('código conhecido vira rótulo; resto vira "Sem classificação"', () => {
    expect(productRoleLabel('icone')).toBe('Ícone de Marca')
    expect(productRoleLabel('sem_classificacao')).toBe('Sem classificação')
    expect(productRoleLabel(null)).toBe('Sem classificação')
  })
})
