// ─── planoFinalRelatorio.tsx ──────────────────────────────────────────────────
// PDF e Excel do Plano Final, a partir dos mesmos dados que a tela já calcula.
// ─────────────────────────────────────────────────────────────────────────────

import type { OfficialMacro } from '../services/supabase/officialPlanService'
import { Capa, GradeKpis, RelatorioA4, Secao, TabelaRelatorio, type KpiRelatorio } from './RelatorioA4'
import { baixarXlsx, nomeArquivo, type Aba, type FormatoColuna } from './xlsxReport'

export interface KpiPlano { chave: string; rotulo: string; valor: number | null; texto: string; variacaoPct: number | null; bom: boolean | null; doM1: boolean }
export interface CanalPlano { canal: string; receita: number; mkdPct: number; giro: number; producao: number }
export interface MesEntrada { label: string; pieces: number; avgPrice: number | null; value: number }
export interface CategoriaPlano {
  category: string; total: number; pieces: number | null; avgPrice: number | null
  marginPct: number | null; mkdPct: number | null
}
export interface DivisaoPlano { divisionLabel: string; total: number; categories: CategoriaPlano[] }

export interface DadosPlanoFinal {
  empresa: string
  ano: number
  macro: OfficialMacro
  kpis: KpiPlano[]
  canais: CanalPlano[]
  entrada: MesEntrada[]
  estrutura: DivisaoPlano[]
}

/** Formato Excel de cada KPI do M1. */
export const FORMATO_KPI: Record<string, FormatoColuna> = {
  receitaBruta: 'brl', margemBruta: 'pct', mkdPct: 'pct', giro: 'multiplo', gmroi: 'multiplo',
  producaoPecas: 'inteiro', pmv: 'brl', custoMedio: 'brl', cobertura: 'inteiro', orcamento: 'brl', ticketMedio: 'brl',
}

const brl = (v: number | null | undefined, casas = 0) =>
  v == null || !Number.isFinite(v) ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
const pct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const int = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('pt-BR'))
const dec2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

type LinhaEstrutura = { tipo: 'divisao' | 'categoria'; nome: string; divisao: string; total: number; part: number | null; pieces: number | null; avgPrice: number | null; marginPct: number | null; mkdPct: number | null }

function linhasEstrutura(estrutura: DivisaoPlano[]): LinhaEstrutura[] {
  const out: LinhaEstrutura[] = []
  for (const d of estrutura) {
    out.push({ tipo: 'divisao', nome: d.divisionLabel, divisao: d.divisionLabel, total: d.total, part: null, pieces: d.categories.reduce((s, c) => s + (c.pieces ?? 0), 0) || null, avgPrice: null, marginPct: null, mkdPct: null })
    for (const c of d.categories) {
      out.push({ tipo: 'categoria', nome: c.category, divisao: d.divisionLabel, total: c.total, part: d.total > 0 ? (c.total / d.total) * 100 : null, pieces: c.pieces, avgPrice: c.avgPrice, marginPct: c.marginPct, mkdPct: c.mkdPct })
    }
  }
  return out
}

export function RelatorioPlanoFinal({ dados }: { dados: DadosPlanoFinal }) {
  const { empresa, ano, macro, kpis, canais, entrada, estrutura } = dados
  const kpisPdf: KpiRelatorio[] = kpis.map(k => ({
    rotulo: k.rotulo,
    valor: k.texto,
    variacao: k.variacaoPct != null && k.bom != null
      ? { texto: `${k.variacaoPct >= 0 ? '+' : ''}${k.variacaoPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs ${ano - 1}`, bom: k.bom }
      : null,
    nota: k.doM1 ? 'meta do plano macro (M1)' : undefined,
  }))
  const totalEntrada = { label: 'Total', pieces: entrada.reduce((s, m) => s + m.pieces, 0), avgPrice: null, value: entrada.reduce((s, m) => s + m.value, 0) }

  return (
    <RelatorioA4 empresa={empresa} documento={`Plano Final ${ano}`}>
      <Capa
        titulo={`Plano Final ${ano}`}
        subtitulo="Metas do ano, distribuição por canal, necessidade de entrada mês a mês e estrutura da coleção por divisão e categoria."
        empresa={empresa}
        periodo={`Ano fiscal ${ano}`}
      />

      <Secao titulo="Indicadores do plano" nota="Prioridades definidas no Planejamento Estratégico (M1), na mesma ordem.">
        <GradeKpis itens={kpisPdf} />
      </Secao>

      {canais.length > 0 && (
        <Secao titulo="Indicadores por canal" nota={`Plano aplicado no Módulo 2 — ${ano}.`}>
          <TabelaRelatorio
            colunas={[
              { titulo: 'Canal', valor: (c: CanalPlano) => c.canal },
              { titulo: 'Receita bruta', valor: c => brl(c.receita), numero: true },
              { titulo: 'Participação', valor: c => pct(macro.receitaBruta > 0 ? (c.receita / macro.receitaBruta) * 100 : null), numero: true },
              { titulo: 'MKD', valor: c => pct(c.mkdPct), numero: true },
              { titulo: 'Giro', valor: c => dec2(c.giro), numero: true },
              { titulo: 'Produção (peças)', valor: c => int(c.producao), numero: true },
            ]}
            linhas={canais}
            total={{ canal: 'Consolidado', receita: macro.receitaBruta, mkdPct: macro.mkdPct, giro: macro.giro, producao: macro.pecasVendidas }}
          />
        </Secao>
      )}

      <Secao titulo="Necessidade de entrada" nota="Peças que ainda precisam entrar, por mês, considerando as coleções planejadas e o estoque projetado (M4 e M5). Meses sem necessidade são omitidos.">
        <TabelaRelatorio
          colunas={[
            { titulo: 'Mês', valor: (m: MesEntrada) => m.label },
            { titulo: 'Peças', valor: m => int(m.pieces), numero: true },
            { titulo: 'Preço médio', valor: m => brl(m.avgPrice, 2), numero: true },
            { titulo: 'Valor financeiro', valor: m => brl(m.value, 2), numero: true },
          ]}
          linhas={totalEntrada.pieces > 0 ? entrada.filter(m => m.pieces > 0) : []}
          total={totalEntrada.pieces > 0 ? totalEntrada : undefined}
          vazio={entrada.length === 0
            ? 'Sem plano de coleção aplicado para este ano.'
            : 'Nenhuma entrada adicional necessária: as coleções planejadas e o estoque projetado cobrem a demanda de todos os meses.'}
        />
      </Secao>

      <Secao titulo="Estrutura da coleção" nota="Receita, peças e preço por divisão e categoria (M4 a M6)." novaPagina>
        <TabelaRelatorio
          colunas={[
            { titulo: 'Divisão / categoria', valor: (l: LinhaEstrutura) => l.nome, largura: '34%' },
            { titulo: 'Participação', valor: l => (l.tipo === 'categoria' ? pct(l.part) : ''), numero: true },
            { titulo: 'Receita', valor: l => brl(l.total), numero: true },
            { titulo: 'Peças', valor: l => int(l.pieces), numero: true },
            { titulo: 'Preço médio', valor: l => (l.tipo === 'categoria' ? brl(l.avgPrice) : ''), numero: true },
            { titulo: 'Margem', valor: l => (l.tipo === 'categoria' ? pct(l.marginPct) : ''), numero: true },
            { titulo: 'Remarcação', valor: l => (l.tipo === 'categoria' ? pct(l.mkdPct) : ''), numero: true },
          ]}
          linhas={linhasEstrutura(estrutura)}
          classeLinha={l => (l.tipo === 'divisao' ? 'grupo' : 'sub')}
          vazio="Sem estrutura de sortimento calculada para este ano."
        />
      </Secao>
    </RelatorioA4>
  )
}

/** Abas do Excel do Plano Final (exportado para teste). */
export function abasPlanoFinal(dados: DadosPlanoFinal): Aba<any>[] {
  const { ano, macro, kpis, canais, entrada, estrutura } = dados
  const abas: Aba<any>[] = [
    {
      nome: 'Resumo', titulo: `Plano Final ${ano} — indicadores`, subtitulo: 'Prioridades do M1',
      colunas: [
        { titulo: 'Indicador', valor: (k: KpiPlano) => k.rotulo, largura: 22 },
        { titulo: 'Valor', valor: (k: KpiPlano) => k.valor, formatoPorLinha: (k: KpiPlano) => FORMATO_KPI[k.chave] ?? 'decimal2', largura: 18 },
        { titulo: `Variação vs ${ano - 1}`, valor: (k: KpiPlano) => k.variacaoPct, formato: 'pct' },
        { titulo: 'Origem', valor: (k: KpiPlano) => (k.doM1 ? 'Meta do M1' : 'Plano oficial') },
      ],
      linhas: kpis,
    },
  ]
  if (canais.length > 0) {
    abas.push({
      nome: 'Canais', titulo: `Indicadores por canal — ${ano}`, subtitulo: 'Plano aplicado no M2',
      colunas: [
        { titulo: 'Canal', valor: (c: CanalPlano) => c.canal },
        { titulo: 'Receita bruta', valor: (c: CanalPlano) => c.receita, formato: 'brl' },
        { titulo: 'Participação', valor: (c: CanalPlano) => (macro.receitaBruta > 0 ? (c.receita / macro.receitaBruta) * 100 : null), formato: 'pct' },
        { titulo: 'MKD', valor: (c: CanalPlano) => c.mkdPct, formato: 'pct' },
        { titulo: 'Giro', valor: (c: CanalPlano) => c.giro, formato: 'multiplo' },
        { titulo: 'Produção (peças)', valor: (c: CanalPlano) => c.producao, formato: 'inteiro' },
      ],
      linhas: canais,
      total: { canal: 'Consolidado', receita: macro.receitaBruta, mkdPct: macro.mkdPct, giro: macro.giro, producao: macro.pecasVendidas },
    })
  }
  abas.push({
    nome: 'Necessidade de entrada', titulo: `Necessidade de entrada — ${ano}`, subtitulo: 'Peças por mês (M4 e M5)',
    colunas: [
      { titulo: 'Mês', valor: (m: MesEntrada) => m.label },
      { titulo: 'Peças', valor: (m: MesEntrada) => m.pieces, formato: 'inteiro' },
      { titulo: 'Preço médio', valor: (m: MesEntrada) => m.avgPrice, formato: 'brl' },
      { titulo: 'Valor financeiro', valor: (m: MesEntrada) => m.value, formato: 'brl' },
    ],
    linhas: entrada,
    total: { label: 'Total', pieces: entrada.reduce((s, m) => s + m.pieces, 0), avgPrice: null, value: entrada.reduce((s, m) => s + m.value, 0) },
  })
  abas.push({
    nome: 'Estrutura', titulo: `Estrutura da coleção — ${ano}`, subtitulo: 'Divisão e categoria (M4 a M6)',
    colunas: [
      { titulo: 'Divisão', valor: (l: LinhaEstrutura) => l.divisao },
      { titulo: 'Categoria', valor: (l: LinhaEstrutura) => (l.tipo === 'divisao' ? 'Total da divisão' : l.nome) },
      { titulo: 'Participação na divisão', valor: (l: LinhaEstrutura) => l.part, formato: 'pct' },
      { titulo: 'Receita', valor: (l: LinhaEstrutura) => l.total, formato: 'brl' },
      { titulo: 'Peças', valor: (l: LinhaEstrutura) => l.pieces, formato: 'inteiro' },
      { titulo: 'Preço médio', valor: (l: LinhaEstrutura) => l.avgPrice, formato: 'brl' },
      { titulo: 'Margem', valor: (l: LinhaEstrutura) => l.marginPct, formato: 'pct' },
      { titulo: 'Remarcação', valor: (l: LinhaEstrutura) => l.mkdPct, formato: 'pct' },
    ],
    linhas: linhasEstrutura(estrutura),
  })
  return abas
}

export function baixarExcelPlanoFinal(dados: DadosPlanoFinal): void {
  baixarXlsx(nomeArquivo('plano_final', dados.empresa, dados.ano), abasPlanoFinal(dados), { empresa: dados.empresa, documento: `Plano Final ${dados.ano}` })
}
